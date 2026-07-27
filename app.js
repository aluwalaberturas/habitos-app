const STORAGE_KEY = "habitos-data-v1";
const SEEDED_KEY = "habitos-seeded-v1";
const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const DEFAULT_HABITS = [
  { name: "Lavarse los dientes (mañana)" },
  { name: "Lavarse los dientes (noche)" },
  { name: "Caminar 15 min después del almuerzo" },
  { name: "Caminar 15 min después de la cena" },
  { name: "Comer sano (mañana)" },
  { name: "Comer sano (noche)" },
  { name: "No tomar alcohol" },
  { name: "1 hora de ejercicio" },
  { name: "Audiolibro o charla TED" },
  { name: "1 hora de estudio" },
  { name: "Tomar agua", type: "counter", target: 12, unit: "vaso" },
  { name: "Acostarse antes de las 23:30" },
  { name: "Levantarse antes de las 7am" },
  { name: "Meditar 15 minutos" },
  { name: "Elongar cuello y espalda" },
];
const MIGRATION_KEY = "habitos-migrated-v2";

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
  state.habits = DEFAULT_HABITS.map((h) => ({
    id: uid(),
    name: h.name,
    done: {},
    ...(h.type ? { type: h.type, target: h.target, unit: h.unit } : {}),
  }));
  save(state);
  localStorage.setItem(SEEDED_KEY, "1");
}

if (!localStorage.getItem(MIGRATION_KEY)) {
  const existingNames = new Set(state.habits.map((h) => h.name));
  const missing = DEFAULT_HABITS.filter((h) => !existingNames.has(h.name));
  if (missing.length) {
    missing.forEach((h) => {
      state.habits.push({
        id: uid(),
        name: h.name,
        done: {},
        ...(h.type ? { type: h.type, target: h.target, unit: h.unit } : {}),
      });
    });
    save(state);
  }
  localStorage.setItem(MIGRATION_KEY, "1");
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function isDoneOn(habit, iso) {
  const v = habit.done[iso];
  if (habit.type === "counter") return (v || 0) >= habit.target;
  return !!v;
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function buildYearGrid(year) {
  const jan1 = new Date(year, 0, 1);
  const startPad = jan1.getDay();
  const totalDays = isLeapYear(year) ? 366 : 365;

  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 0; d < totalDays; d++) cells.push(new Date(year, 0, 1 + d));
  while (cells.length % 7 !== 0) cells.push(null);

  const cols = cells.length / 7;
  const weeks = [];
  const monthLabels = [];
  let lastMonth = -1;

  for (let c = 0; c < cols; c++) {
    const weekCells = cells.slice(c * 7, c * 7 + 7);
    weeks.push(weekCells);
    for (const day of weekCells) {
      if (day && day.getDate() === 1 && day.getMonth() !== lastMonth) {
        monthLabels.push({ col: c, label: MONTH_ABBR[day.getMonth()] });
        lastMonth = day.getMonth();
      }
    }
  }
  return { weeks, monthLabels };
}

function yearStats(habit, year) {
  const today = new Date();
  const isCurrentYear = year === today.getFullYear();
  const end = isCurrentYear ? today : new Date(year, 11, 31);
  let total = 0;
  let done = 0;
  const d = new Date(year, 0, 1);
  while (d <= end) {
    total++;
    if (isDoneOn(habit, todayISO(d))) done++;
    d.setDate(d.getDate() + 1);
  }
  const percent = total ? Math.round((done / total) * 100) : 0;
  return { total, done, percent };
}

function computeStreak(habit) {
  let streak = 0;
  const d = new Date();
  while (true) {
    const iso = todayISO(d);
    if (isDoneOn(habit, iso)) {
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
  const year = new Date().getFullYear();
  const doneToday = state.habits.filter((h) => isDoneOn(h, iso)).length;
  const summary = document.getElementById("summary");
  if (state.habits.length === 0) {
    summary.textContent = "";
  } else {
    const avg = Math.round(
      state.habits.reduce((sum, h) => sum + yearStats(h, year).percent, 0) / state.habits.length
    );
    summary.innerHTML = `<b>${doneToday}/${state.habits.length}</b> completados hoy · promedio del año <b>${avg}%</b>`;
  }

  if (state.habits.length === 0) {
    list.innerHTML = `<div class="empty"><div>Todavía no cargaste ningún hábito.<br>Agregá el primero abajo.</div></div>`;
    return;
  }

  const { weeks, monthLabels } = buildYearGrid(year);
  const CELL = 12;
  const GAP = 3;
  const colWidth = CELL + GAP;

  state.habits.forEach((habit) => {
    const streak = computeStreak(habit);
    const stats = yearStats(habit, year);
    const el = document.createElement("div");
    el.className = "habit";

    const isDoneToday = isDoneOn(habit, iso);
    const isCounter = habit.type === "counter";
    const todayCount = habit.done[iso] || 0;

    const monthRow = monthLabels
      .map((m) => `<span class="year-month-label" style="left:${m.col * colWidth}px">${m.label}</span>`)
      .join("");

    const gridCols = weeks
      .map((week) => {
        const cells = week
          .map((day) => {
            if (!day) return `<div class="year-day pad"></div>`;
            const dIso = todayISO(day);
            const isFuture = day > new Date(new Date().setHours(23, 59, 59, 999));
            const filled = isDoneOn(habit, dIso);
            const isToday = dIso === iso;
            if (isFuture) return `<div class="year-day future"></div>`;
            const action = isCounter ? "" : `data-action="toggle-day" data-id="${habit.id}" data-date="${dIso}"`;
            return `<div class="year-day ${filled ? "filled" : ""} ${isToday ? "today" : ""}" ${action}></div>`;
          })
          .join("");
        return `<div class="year-week">${cells}</div>`;
      })
      .join("");

    el.innerHTML = `
      <div class="habit-top">
        <div class="habit-name">${escapeHtml(habit.name)}</div>
        ${
          isCounter
            ? `<div class="counter-stepper">
                <button class="stepper-btn" data-action="counter-dec" data-id="${habit.id}">−</button>
                <span class="counter-value ${isDoneToday ? "done" : ""}"><b>${todayCount}</b>/${habit.target} ${habit.unit || ""}${todayCount === 1 ? "" : "s"}</span>
                <button class="stepper-btn" data-action="counter-inc" data-id="${habit.id}">+</button>
              </div>`
            : `<button class="check-btn ${isDoneToday ? "done" : ""}" data-action="toggle-today" data-id="${habit.id}">
                <svg viewBox="0 0 24 24" fill="none"><path d="M4 12l5 5L20 6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>`
        }
      </div>
      <div class="year-scroll">
        <div class="year-months" style="width:${weeks.length * colWidth}px">${monthRow}</div>
        <div class="year-grid">${gridCols}</div>
      </div>
      <div class="row-actions">
        <span class="habit-streak">Racha: <b>${streak}</b> ${streak === 1 ? "día" : "días"} · este año <b>${stats.percent}%</b> (${stats.done}/${stats.total})</span>
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

function incrementCounter(habitId, delta) {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return;
  const iso = todayISO();
  const current = habit.done[iso] || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) {
    delete habit.done[iso];
  } else {
    habit.done[iso] = next;
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
  const counterToggle = document.getElementById("habit-counter-toggle");
  const targetInput = document.getElementById("habit-target-input");
  input.value = habit ? habit.name : "";
  const isCounter = !!(habit && habit.type === "counter");
  counterToggle.checked = isCounter;
  targetInput.style.display = isCounter ? "" : "none";
  targetInput.value = isCounter ? habit.target : "";
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

  const isCounter = document.getElementById("habit-counter-toggle").checked;
  const target = Math.max(1, parseInt(document.getElementById("habit-target-input").value, 10) || 1);

  if (editingId) {
    const habit = state.habits.find((h) => h.id === editingId);
    if (habit) {
      habit.name = name;
      if (isCounter) {
        habit.type = "counter";
        habit.target = target;
        habit.unit = habit.unit || "vaso";
      } else {
        delete habit.type;
        delete habit.target;
        delete habit.unit;
      }
    }
  } else {
    const newHabit = { id: uid(), name, done: {} };
    if (isCounter) {
      newHabit.type = "counter";
      newHabit.target = target;
      newHabit.unit = "vaso";
    }
    state.habits.push(newHabit);
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
  } else if (action === "counter-inc") {
    incrementCounter(id, 1);
  } else if (action === "counter-dec") {
    incrementCounter(id, -1);
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
document.getElementById("habit-counter-toggle").addEventListener("change", (e) => {
  document.getElementById("habit-target-input").style.display = e.target.checked ? "" : "none";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

render();
