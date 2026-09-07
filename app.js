/* ── Trip constants (kept in sync with the public site) ─────────────── */
const TRIP_START = "2026-12-27";
const TRIP_END = "2027-01-01";
const NYE = "2026-12-31";

function buildDays() {
  const days = [];
  let d = new Date(TRIP_START + "T00:00:00");
  const end = new Date(TRIP_END + "T00:00:00");
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    let tag = "";
    if (iso === TRIP_START) tag = "Arrival";
    else if (iso === TRIP_END) tag = "Departure";
    else if (iso === NYE) tag = "NYE";
    days.push({
      date: iso,
      dow: d.toLocaleDateString("en-US", { weekday: "short" }),
      num: d.getDate(),
      month: d.toLocaleDateString("en-US", { month: "short" }),
      tag,
    });
    d.setDate(d.getDate() + 1);
  }
  return days;
}
const DAYS = buildDays();

const CATEGORIES = [
  { id: "dinner", label: "Dinner", emoji: "🍽️", varName: "--hibiscus" },
  { id: "excursion", label: "Excursion", emoji: "🗺️", varName: "--lagoon" },
  { id: "beach", label: "Beach / Pool", emoji: "🏖️", varName: "--sky" },
  { id: "spa", label: "Spa", emoji: "💆", varName: "--violet" },
  { id: "other", label: "Other", emoji: "✨", varName: "--ink-faint" },
];
const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/* ── Helpers ──────────────────────────────────────────────────────── */
function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}
function slug(name) {
  return (name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "guest";
}
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
function dayLabel(dateStr) {
  const d = DAYS.find((x) => x.date === dateStr);
  return d ? `${d.dow}, ${d.month} ${d.num}` : dateStr;
}
function voteCount(a) {
  return Object.values(a.votes || {}).filter((v) => v && v.person).length;
}
function goingCount(a) {
  return Object.values(a.rsvps || {}).filter((r) => r && r.status === "going").length;
}
function isMapsLink(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  return /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\./i.test(url);
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._h);
  showToast._h = setTimeout(() => t.classList.remove("show"), 2200);
}

const TRASH_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"/></svg>`;
const EDIT_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const TRASH_ICON_SM = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"/></svg>`;

/* ── Data store: same shape as the public site's, plus admin verbs ──── */
const LOCAL_KEY = "mex_trip_data_v1"; // same key as the public site — shares data when served from the same origin
function hasRealConfig() {
  const c = window.FIREBASE_CONFIG;
  return !!(c && c.apiKey && c.apiKey !== "REPLACE_ME" && c.projectId && c.projectId !== "REPLACE_ME");
}

function makeFirebaseStore() {
  firebase.initializeApp(window.FIREBASE_CONFIG);
  const db = firebase.firestore();
  return {
    mode: "firebase",
    onActivities(cb) {
      return db.collection("activities").onSnapshot(
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => {
          console.error(err);
          showToast("Connection problem — check Firestore rules/config");
        }
      );
    },
    addActivity(data) {
      return db
        .collection("activities")
        .add({ ...data, rsvps: {}, votes: {}, comments: [], createdAt: new Date().toISOString() })
        .then((ref) => ref.id);
    },
    updateActivity(id, data) {
      return db.collection("activities").doc(id).update(data);
    },
    deleteActivity(id) {
      return db.collection("activities").doc(id).delete();
    },
    deleteComment(id, commentObj) {
      return db
        .collection("activities")
        .doc(id)
        .update({ comments: firebase.firestore.FieldValue.arrayRemove(commentObj) });
    },
    resetAll(ids) {
      const batch = db.batch();
      ids.forEach((id) => batch.delete(db.collection("activities").doc(id)));
      return batch.commit();
    },
  };
}

function makeLocalStore() {
  function load() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { activities: {} };
    } catch (e) {
      return { activities: {} };
    }
  }
  function save(data) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    listeners.forEach((fn) => fn());
  }
  let listeners = [];
  window.addEventListener("storage", (e) => {
    if (e.key === LOCAL_KEY) listeners.forEach((fn) => fn());
  });
  return {
    mode: "local",
    onActivities(cb) {
      const fn = () => {
        const data = load();
        cb(Object.entries(data.activities).map(([id, a]) => ({ id, ...a })));
      };
      listeners.push(fn);
      fn();
      return () => {
        listeners = listeners.filter((x) => x !== fn);
      };
    },
    addActivity(data) {
      const id = uid();
      const store = load();
      store.activities[id] = { ...data, rsvps: {}, votes: {}, comments: [], createdAt: new Date().toISOString() };
      save(store);
      return Promise.resolve(id);
    },
    updateActivity(id, data) {
      const store = load();
      if (!store.activities[id]) return Promise.resolve();
      store.activities[id] = { ...store.activities[id], ...data };
      save(store);
      return Promise.resolve();
    },
    deleteActivity(id) {
      const store = load();
      delete store.activities[id];
      save(store);
      return Promise.resolve();
    },
    deleteComment(id, commentObj) {
      const store = load();
      if (!store.activities[id]) return Promise.resolve();
      store.activities[id].comments = (store.activities[id].comments || []).filter((c) => c.id !== commentObj.id);
      save(store);
      return Promise.resolve();
    },
    resetAll(ids) {
      const store = load();
      ids.forEach((id) => delete store.activities[id]);
      save(store);
      return Promise.resolve();
    },
  };
}

const Store = hasRealConfig() && window.firebase ? makeFirebaseStore() : makeLocalStore();

/* ── State ────────────────────────────────────────────────────────── */
let activities = [];
let editingId = null;
let armedDeleteId = null;
let armedDeleteTimer = null;

/* ── Stats ────────────────────────────────────────────────────────── */
function renderStats() {
  let totalGoing = 0,
    totalComments = 0,
    totalVotes = 0,
    top = null;
  activities.forEach((a) => {
    totalGoing += goingCount(a);
    totalComments += (a.comments || []).length;
    const v = voteCount(a);
    totalVotes += v;
    if (!top || v > voteCount(top)) top = a;
  });
  document.getElementById("stats").innerHTML = `
    <div class="stat-card"><div class="label">Activities</div><div class="value mono">${activities.length}</div></div>
    <div class="stat-card"><div class="label">Total going</div><div class="value mono">${totalGoing}</div></div>
    <div class="stat-card"><div class="label">Comments</div><div class="value mono">${totalComments}</div></div>
    <div class="stat-card"><div class="label">Votes cast</div><div class="value mono">${totalVotes}</div></div>
    <div class="stat-card"><div class="label">Top pick</div><div class="value small">${top ? escapeHtml(top.title) : "—"}</div></div>
  `;
}

/* ── Activities table ─────────────────────────────────────────────── */
function sortedActivities() {
  return activities
    .slice()
    .sort((a, b) => a.day.localeCompare(b.day) || (a.time || "99:99").localeCompare(b.time || "99:99") || a.createdAt.localeCompare(b.createdAt));
}
function renderActivitiesTable() {
  const body = document.getElementById("activitiesBody");
  const list = sortedActivities();
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="7"><div class="empty-note">No activities yet — add the first one.</div></td></tr>`;
    return;
  }
  body.innerHTML = list
    .map((a) => {
      const cat = catById[a.category] || catById.other;
      return `
    <tr data-id="${a.id}">
      <td><div class="cell-title mono">${dayLabel(a.day)}</div><div class="cell-sub">${a.time ? formatTime(a.time) : "Anytime"}</div></td>
      <td><span class="pill" style="color:var(${cat.varName})">${cat.emoji} ${cat.label}</span></td>
      <td><div class="cell-title">${escapeHtml(a.title)}</div>${a.location ? `<div class="cell-sub">📍 ${escapeHtml(a.location)}</div>` : ""}</td>
      <td class="mono">${voteCount(a)}</td>
      <td class="mono">${goingCount(a)}</td>
      <td class="mono">${(a.comments || []).length}</td>
      <td>
        <div class="row-actions">
          <button type="button" class="icon-btn" data-action="edit" title="Edit">${EDIT_ICON}</button>
          <button type="button" class="icon-btn danger" data-action="delete" title="${armedDeleteId === a.id ? "Click again to confirm" : "Delete"}">${armedDeleteId === a.id ? "!" : TRASH_ICON}</button>
        </div>
      </td>
    </tr>`;
    })
    .join("");
}

/* ── Leaderboard ──────────────────────────────────────────────────── */
function renderLeaderboard() {
  const list = activities.slice().sort((a, b) => voteCount(b) - voteCount(a) || a.createdAt.localeCompare(b.createdAt));
  const el = document.getElementById("leaderboardList");
  if (!list.length) {
    el.innerHTML = `<div class="empty-note">No votes cast yet.</div>`;
    return;
  }
  el.innerHTML = list
    .map((a, i) => {
      const rank = i + 1;
      const cat = catById[a.category] || catById.other;
      const medal = rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : rank;
      return `<li class="lb-row ${rank <= 3 ? "r" + rank : ""}">
      <div class="lb-rank">${medal}</div>
      <div class="lb-body">
        <div class="lb-title">${cat.emoji} ${escapeHtml(a.title)}</div>
        <div class="lb-meta">${dayLabel(a.day)}${a.time ? " · " + formatTime(a.time) : ""} · ${goingCount(a)} going</div>
      </div>
      <div class="lb-votes"><div class="n mono">${voteCount(a)}</div><div class="u">votes</div></div>
    </li>`;
    })
    .join("");
}

/* ── Attendance ───────────────────────────────────────────────────── */
function renderAttendance() {
  const people = {};
  function ensure(key, name) {
    if (!people[key]) people[key] = { name, going: 0, maybe: 0, no: 0, voted: 0, comments: 0 };
    return people[key];
  }
  activities.forEach((a) => {
    Object.entries(a.rsvps || {}).forEach(([key, r]) => {
      if (!r || !r.person || !r.status) return;
      const p = ensure(key, r.person);
      if (r.status === "going") p.going++;
      else if (r.status === "maybe") p.maybe++;
      else if (r.status === "no") p.no++;
    });
    Object.entries(a.votes || {}).forEach(([key, v]) => {
      if (!v || !v.person) return;
      ensure(key, v.person).voted++;
    });
    (a.comments || []).forEach((c) => {
      ensure(slug(c.person), c.person).comments++;
    });
  });
  const rows = Object.values(people).sort((a, b) => b.going - a.going || b.voted - a.voted);
  const body = document.getElementById("attendanceBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-note">Nobody's RSVP'd, voted, or commented yet.</div></td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (p) => `
    <tr>
      <td class="cell-title">${escapeHtml(p.name)}</td>
      <td class="mono">${p.going}</td>
      <td class="mono">${p.maybe}</td>
      <td class="mono">${p.no}</td>
      <td class="mono">${p.voted}</td>
      <td class="mono">${p.comments}</td>
    </tr>`
    )
    .join("");
}

function render() {
  renderStats();
  renderActivitiesTable();
  renderLeaderboard();
  renderAttendance();
  if (editingId) {
    const a = activities.find((x) => x.id === editingId);
    if (a) renderModComments(a);
    else closeModal();
  }
}

/* ── Tabs ─────────────────────────────────────────────────────────── */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    const target = btn.dataset.tab;
    ["activities", "leaderboard", "attendance", "danger"].forEach((t) => {
      document.getElementById("panel-" + t).hidden = t !== target;
    });
  });
});

/* ── Add/edit modal ───────────────────────────────────────────────── */
const catPicker = document.getElementById("catPicker");
catPicker.innerHTML = CATEGORIES.map(
  (c) => `<button type="button" class="cat-option" data-cat="${c.id}" style="--cat-color: var(${c.varName})"><span class="dot"></span>${c.emoji} ${c.label}</button>`
).join("");
let selectedCat = CATEGORIES[0].id;
catPicker.addEventListener("click", (e) => {
  const opt = e.target.closest(".cat-option");
  if (!opt) return;
  selectedCat = opt.dataset.cat;
  [...catPicker.children].forEach((el) => el.classList.toggle("active", el === opt));
});

const daySelectEl = document.getElementById("f-day");
daySelectEl.innerHTML = DAYS.map((d) => `<option value="${d.date}">${d.dow}, ${d.month} ${d.num}${d.tag ? " — " + d.tag : ""}</option>`).join("");

function openModal() {
  document.getElementById("modalScrim").classList.add("open");
  document.getElementById("activityModal").classList.add("open");
}
function closeModal() {
  document.getElementById("modalScrim").classList.remove("open");
  document.getElementById("activityModal").classList.remove("open");
  editingId = null;
}
document.getElementById("modalScrim").addEventListener("click", closeModal);
document.getElementById("modalCancel").addEventListener("click", closeModal);

function openModalForAdd() {
  editingId = null;
  document.getElementById("modalTitle").textContent = "Add activity";
  document.getElementById("modalMeta").hidden = true;
  document.getElementById("modalDelete").hidden = true;
  document.getElementById("modComments").hidden = true;
  document.getElementById("activityForm").reset();
  document.getElementById("f-maps").setCustomValidity("");
  selectedCat = CATEGORIES[0].id;
  [...catPicker.children].forEach((el, i) => el.classList.toggle("active", i === 0));
  daySelectEl.value = DAYS[0].date;
  openModal();
}
document.getElementById("addActivityBtn").addEventListener("click", openModalForAdd);

function renderModComments(a) {
  const list = document.getElementById("modCommentList");
  const comments = (a.comments || []).slice().sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  document.getElementById("modalMeta").textContent = `Added by ${a.createdBy || "someone"} · ${voteCount(a)} votes · ${goingCount(a)} going · ${comments.length} comments`;
  list.innerHTML = comments.length
    ? comments
        .map(
          (c) => `
      <div class="mod-comment" data-cid="${escapeHtml(c.id)}">
        <div><div class="who">${escapeHtml(c.person)}</div><div class="txt">${escapeHtml(c.text)}</div></div>
        <button type="button" data-del-comment="${escapeHtml(c.id)}" title="Delete comment">${TRASH_ICON_SM}</button>
      </div>`
        )
        .join("")
    : `<div class="cell-sub">No comments.</div>`;
}

function openModalForEdit(id) {
  const a = activities.find((x) => x.id === id);
  if (!a) return;
  editingId = id;
  document.getElementById("modalTitle").textContent = "Edit activity";
  document.getElementById("modalMeta").hidden = false;
  document.getElementById("modalDelete").hidden = false;
  document.getElementById("modalDelete").textContent = "Delete";
  document.getElementById("modalDelete").dataset.armed = "0";
  document.getElementById("f-title").value = a.title || "";
  selectedCat = a.category || CATEGORIES[0].id;
  [...catPicker.children].forEach((el) => el.classList.toggle("active", el.dataset.cat === selectedCat));
  daySelectEl.value = a.day;
  document.getElementById("f-time").value = a.time || "";
  document.getElementById("f-location").value = a.location || "";
  document.getElementById("f-maps").value = a.mapsLink || "";
  document.getElementById("f-maps").setCustomValidity("");
  document.getElementById("f-notes").value = a.notes || "";
  renderModComments(a);
  openModal();
}

document.getElementById("activitiesBody").addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-id]");
  const btn = e.target.closest("[data-action]");
  if (!tr || !btn) return;
  const id = tr.dataset.id;
  if (btn.dataset.action === "edit") openModalForEdit(id);
  if (btn.dataset.action === "delete") quickDelete(id);
});

// armedDeleteId lives in JS state (not on the button) because the table
// re-renders on every live update from Firestore — a DOM-only "armed" flag
// gets wiped by the very next snapshot before a second click can land.
function quickDelete(id) {
  clearTimeout(armedDeleteTimer);
  if (armedDeleteId === id) {
    armedDeleteId = null;
    Store.deleteActivity(id).then(() => showToast("Deleted"));
    return;
  }
  armedDeleteId = id;
  renderActivitiesTable();
  armedDeleteTimer = setTimeout(() => {
    armedDeleteId = null;
    renderActivitiesTable();
  }, 2500);
}

document.getElementById("modalDelete").addEventListener("click", function () {
  if (!editingId) return;
  if (this.dataset.armed === "1") {
    const id = editingId;
    Store.deleteActivity(id).then(() => {
      showToast("Deleted");
      closeModal();
    });
    return;
  }
  this.dataset.armed = "1";
  this.textContent = "Click again to confirm";
  setTimeout(() => {
    this.dataset.armed = "0";
    this.textContent = "Delete";
  }, 2500);
});

document.getElementById("modCommentList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-del-comment]");
  if (!btn || !editingId) return;
  const a = activities.find((x) => x.id === editingId);
  if (!a) return;
  const comment = (a.comments || []).find((c) => c.id === btn.dataset.delComment);
  if (!comment) return;
  Store.deleteComment(editingId, comment).then(() => showToast("Comment deleted"));
});

document.getElementById("activityForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = document.getElementById("f-title").value.trim();
  if (!title) return;
  const mapsInput = document.getElementById("f-maps");
  const mapsLink = mapsInput.value.trim();
  if (!isMapsLink(mapsLink)) {
    mapsInput.setCustomValidity("Paste the share link from Google Maps (google.com/maps, goo.gl, or maps.app.goo.gl).");
    mapsInput.reportValidity();
    return;
  }
  mapsInput.setCustomValidity("");

  const data = {
    title,
    category: selectedCat,
    day: daySelectEl.value,
    time: document.getElementById("f-time").value || "",
    location: document.getElementById("f-location").value.trim(),
    mapsLink,
    notes: document.getElementById("f-notes").value.trim(),
  };
  const saveBtn = document.getElementById("modalSave");
  saveBtn.disabled = true;
  const action = editingId ? Store.updateActivity(editingId, data) : Store.addActivity({ ...data, createdBy: "Admin" });
  action
    .then(() => {
      showToast(editingId ? "Saved" : "Added");
      closeModal();
    })
    .finally(() => (saveBtn.disabled = false));
});

/* ── Danger zone ──────────────────────────────────────────────────── */
document.getElementById("exportBtn").addEventListener("click", () => {
  const payload = { exportedAt: new Date().toISOString(), activities };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mexico-trip-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast("Backup downloaded");
});

const resetConfirmInput = document.getElementById("resetConfirm");
const resetBtn = document.getElementById("resetBtn");
resetConfirmInput.addEventListener("input", () => {
  resetBtn.disabled = resetConfirmInput.value.trim() !== "RESET";
});
resetBtn.addEventListener("click", () => {
  const ids = activities.map((a) => a.id);
  resetBtn.disabled = true;
  Store.resetAll(ids).then(() => {
    showToast("All trip data cleared");
    resetConfirmInput.value = "";
  });
});

/* ── Boot / connection status ─────────────────────────────────────── */
function boot() {
  document.getElementById("connDot").className = "conn-dot " + (Store.mode === "firebase" ? "on" : "off");
  document.getElementById("connLabel").textContent = Store.mode === "firebase" ? "firestore · live" : "local only (this device)";
  Store.onActivities((list) => {
    activities = list;
    render();
  });
}

/* ── Password gate ────────────────────────────────────────────────── */
const ADMIN_PASSWORD = "mexico2026";
const lockScreen = document.getElementById("lockScreen");
const dash = document.getElementById("dash");

function tryUnlock() {
  const val = document.getElementById("pwInput").value;
  if (val === ADMIN_PASSWORD) {
    sessionStorage.setItem("mex_admin_ok", "1");
    lockScreen.hidden = true;
    dash.hidden = false;
    boot();
  } else {
    const card = document.getElementById("lockCard");
    document.getElementById("lockError").hidden = false;
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
    document.getElementById("pwInput").value = "";
    document.getElementById("pwInput").focus();
  }
}
document.getElementById("unlockBtn").addEventListener("click", tryUnlock);
document.getElementById("pwInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryUnlock();
});
document.getElementById("lockBtn").addEventListener("click", () => {
  sessionStorage.removeItem("mex_admin_ok");
  location.reload();
});

if (sessionStorage.getItem("mex_admin_ok") === "1") {
  lockScreen.hidden = true;
  dash.hidden = false;
  boot();
}
