const STORAGE_KEY = "habitos-data-v1";
const SEEDED_KEY = "habitos-seeded-v1";
const DAY_LABELS = ["D", "L", "M", "M", "J", "V", "S"];

const DEFAULT_HABITS = [
  "Lavarse los dientes",
  "Caminar 15 min después del almuerzo",
  "Caminar 15 min después de la cena",
  "Comer sano",
  "No tomar alcohol",
  "1 hora de ejercicio",
  "Audiolibro o charla TED",
  "1 hora de estudio",
];

function todayISO(d = new Date()) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { habits: [] };
    return JSON.parse(raw);
  } catch (e) {
    return { habits: [] };
  }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let state = load();
let editingId = null;

if (state.habits.length === 0 && !localStorage.getItem(SEEDED_KEY)) {
  state.habits = DEFAULT_HABITS.map((name) => ({ id: uid(), name, done: {} }));
  save(state);
  localStorage.setItem(SEEDED_KEY, "1");
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function lastNDays(n) {
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function computeStreak(habit) {
  let streak = 0;
  const d = new Date();
  while (true) {
    const iso = todayISO(d);
    if (habit.done[iso]) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      if (iso === todayISO()) {
        d.setDate(d.getDate() - 1);
        continue;
      }
      break;
    }
  }
  return streak;
}

function render() {
  const label = document.getElementById("today-label");
  const now = new Date();
  label.textContent = now.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const list = document.getElementById("list");
  list.innerHTML = "";

  const iso = todayISO();
  const doneToday = state.habits.filter((h) => h.done[iso]).length;
  const summary = document.getElementById("summary");
  if (state.habits.length === 0) {
    summary.textContent = "";
  } else {
    summary.innerHTML = `<b>${doneToday}/${state.habits.length}</b> completados hoy`;
  }

  if (state.habits.length === 0) {
    list.innerHTML = `<div class="empty"><div>Todavía no cargaste ningún hábito.<br>Agregá el primero abajo.</div></div>`;
    return;
  }

  const days = lastNDays(7);

  state.habits.forEach((habit) => {
    const streak = computeStreak(habit);
    const el = document.createElement("div");
    el.className = "habit";

    const isDoneToday = !!habit.done[iso];

    el.innerHTML = `
      <div class="habit-top">
        <div class="habit-name">${escapeHtml(habit.name)}</div>
        <button class="check-btn ${isDoneToday ? "done" : ""}" data-action="toggle-today" data-id="${habit.id}">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 12l5 5L20 6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="week">
        ${days
          .map((d) => {
            const dIso = todayISO(d);
            const filled = !!habit.done[dIso];
            const isToday = dIso === iso;
            return `<div class="day">
              <div class="day-label">${DAY_LABELS[d.getDay()]}</div>
              <div class="day-dot ${filled ? "filled" : ""} ${isToday ? "today" : ""}" data-action="toggle-day" data-id="${habit.id}" data-date="${dIso}"></div>
            </div>`;
          })
          .join("")}
      </div>
      <div class="row-actions">
        <span class="habit-streak">Racha: <b>${streak}</b> ${streak === 1 ? "día" : "días"}</span>
      </div>
      <div class="row-actions">
        <button class="link-btn" data-action="edit" data-id="${habit.id}">Editar</button>
        <button class="link-btn danger" data-action="delete" data-id="${habit.id}">Eliminar</button>
      </div>
    `;
    list.appendChild(el);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function toggleDay(habitId, dateIso) {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return;
  if (habit.done[dateIso]) {
    delete habit.done[dateIso];
  } else {
    habit.done[dateIso] = true;
  }
  save(state);
  render();
}

function deleteHabit(id) {
  state.habits = state.habits.filter((h) => h.id !== id);
  save(state);
  render();
}

function openSheet(mode, habit) {
  editingId = habit ? habit.id : null;
  document.getElementById("sheet-title").textContent =
    mode === "edit" ? "Editar hábito" : "Nuevo hábito";
  const input = document.getElementById("habit-input");
  input.value = habit ? habit.name : "";
  document.getElementById("overlay").classList.add("open");
  setTimeout(() => input.focus(), 200);
}

function closeSheet() {
  document.getElementById("overlay").classList.remove("open");
  editingId = null;
}

function saveSheet() {
  const input = document.getElementById("habit-input");
  const name = input.value.trim();
  if (!name) return;

  if (editingId) {
    const habit = state.habits.find((h) => h.id === editingId);
    if (habit) habit.name = name;
  } else {
    state.habits.push({ id: uid(), name, done: {} });
  }
  save(state);
  closeSheet();
  render();
}

document.getElementById("list").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "toggle-today") {
    toggleDay(id, todayISO());
  } else if (action === "toggle-day") {
    toggleDay(id, btn.dataset.date);
  } else if (action === "edit") {
    const habit = state.habits.find((h) => h.id === id);
    openSheet("edit", habit);
  } else if (action === "delete") {
    if (confirm("¿Eliminar este hábito y su historial?")) {
      deleteHabit(id);
    }
  }
});

document.getElementById("add-habit-btn").addEventListener("click", () => openSheet("new"));
document.getElementById("cancel-btn").addEventListener("click", closeSheet);
document.getElementById("save-btn").addEventListener("click", saveSheet);
document.getElementById("overlay").addEventListener("click", (e) => {
  if (e.target.id === "overlay") closeSheet();
});
document.getElementById("habit-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveSheet();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

render();
