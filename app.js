"use strict";

const $ = (id) => document.getElementById(id);
const el = {
  stage: $("stage"),
  cue: $("cue"),
  lineSpeaker: $("line-speaker"), lineText: $("line-text"),
  counter: $("counter"), where: $("where"), fill: $("progress-fill"),
  back: $("back"), grade: $("grade"), hint: $("hint"),
  got: $("got"), missed: $("missed"), toast: $("toast"),
  startPage: $("start-page"),
  photos: $("photos"), photosToggle: $("photos-toggle"), message: $("message"),
};

let cards = [];
let mode = "chrono";
let revealed = false;
let pool = []; // ids of cards on or after the chosen start page

// In-order mode: just an index.
const chrono = { idx: 0 };

// Random mode: a shuffled queue; missed cards are put back a few cards later.
// `history` lets the back key revisit earlier cards.
const random = { queue: [], history: [], pos: -1, graded: new Set(), got: 0, missed: 0, round: 1 };

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startRound() {
  random.queue = shuffle([...pool]);
  random.got = 0;
  random.missed = 0;
}

function currentCard() {
  if (mode === "chrono") return cards[chrono.idx];
  return cards[random.history[random.pos]];
}

// A random-mode card can be graded only the first time it's drawn.
function awaitingGrade() {
  return mode === "random" && revealed && !random.graded.has(random.pos);
}

function next() {
  if (mode === "chrono") {
    if (chrono.idx === cards.length - 1) {
      chrono.idx = pool[0];
      toast(`End of the play. Back to page ${cards[pool[0]].page}.`);
    } else {
      chrono.idx++;
    }
  } else if (random.pos < random.history.length - 1) {
    random.pos++;
  } else {
    if (random.queue.length === 0) {
      toast(`Round ${random.round} done. Reshuffling.`);
      random.round++;
      startRound();
    }
    random.history.push(random.queue.shift());
    random.pos++;
  }
  show();
}

function prev() {
  if (mode === "chrono" && chrono.idx > 0) chrono.idx--;
  else if (mode === "random" && random.pos > 0) random.pos--;
  else return;
  show();
}

function grade(gotIt) {
  random.graded.add(random.pos);
  if (gotIt) {
    random.got++;
  } else {
    random.missed++;
    const id = random.history[random.pos];
    const at = Math.min(random.queue.length, 3 + Math.floor(Math.random() * 4));
    random.queue.splice(at, 0, id);
  }
  next();
}

// Space / tap / right arrow: reveal, then grade (random) or advance.
function primary() {
  if (!cards.length) return;
  if (!revealed) {
    revealed = true;
    render();
  } else if (awaitingGrade()) {
    grade(true);
  } else {
    next();
  }
}

function show() {
  revealed = false;
  renderContext(currentCard());
  render();
  el.stage.scrollTop = 0;
  el.cue.scrollTop = el.cue.scrollHeight; // the lines just before the hidden one matter most
}

// The speeches leading up to the hidden line, shown in full.
function renderContext(c) {
  if (!c) return;
  if (!c.context.length) {
    el.cue.textContent = "(Top of the play)";
    return;
  }
  el.cue.innerHTML = c.context.map((p) => {
    const pg = p.page !== c.page ? `<span class="pg">p. ${p.page}</span>` : "";
    return `<div class="speech">
      <div class="speaker${p.mine ? " mine" : ""}">${escapeHtml(p.speaker)}.${pg}</div>
      <div class="text">${escapeHtml(p.text)}</div>
    </div>`;
  }).join("");
  const length = c.context.reduce((n, p) => n + p.text.length, 0);
  el.cue.classList.toggle("long", length > 500);
}

function render() {
  const c = currentCard();
  if (!c) return;

  el.lineSpeaker.textContent = c.speaker + ".";
  el.lineText.textContent = c.line;
  el.lineText.classList.toggle("redacted", !revealed);
  el.lineText.setAttribute("aria-hidden", String(!revealed));

  el.where.textContent = `Scene ${c.scene} · Page ${c.page}`;

  if (mode === "chrono") {
    el.counter.textContent = `Line ${chrono.idx + 1} / ${cards.length}`;
    el.fill.style.width = `${((chrono.idx + 1) / cards.length) * 100}%`;
    el.back.disabled = chrono.idx === 0;
  } else {
    const missed = random.missed ? ` · ${random.missed} missed` : "";
    el.counter.textContent = `Round ${random.round} · ${random.got} / ${pool.length} got${missed}`;
    el.fill.style.width = `${(random.got / pool.length) * 100}%`;
    el.back.disabled = random.pos <= 0;
  }

  const grading = awaitingGrade();
  el.grade.hidden = !grading;
  el.hint.hidden = grading;
  el.hint.textContent = revealed ? "Space or tap for next" : "Space or tap to reveal";
}

function setMode(m) {
  if (m === mode) return;
  mode = m;
  document.querySelectorAll(".modes button").forEach((b) =>
    b.setAttribute("aria-selected", String(b.dataset.mode === m)));
  if (mode === "random" && random.pos < 0) next();
  else show();
}

// Jump to the first line on or after `page`. In random mode, restart the
// shuffle with only the lines from that page on.
function setStartPage(page) {
  pool = cards.filter((c) => c.page >= page).map((c) => c.id);
  chrono.idx = pool[0];
  Object.assign(random, { history: [], pos: -1, graded: new Set(), round: 1 });
  startRound();
  if (mode === "random") next();
  else show();
}

function buildPagePicker() {
  const first = cards[0].page, last = cards[cards.length - 1].page;
  for (let p = first; p <= last; p++) el.startPage.add(new Option(`From p. ${p}`, p));
  el.startPage.addEventListener("change", () => {
    setStartPage(Number(el.startPage.value));
    el.startPage.blur(); // give Space/arrows back to the cards
  });
}

let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2200);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

// --- Input ---------------------------------------------------------------

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target === el.startPage) return;
  switch (e.key) {
    case " ":
    case "Enter":
    case "ArrowRight":
      e.preventDefault();
      primary();
      break;
    case "ArrowLeft":
      e.preventDefault();
      prev();
      break;
    case "m": case "M": case "x": case "X":
      if (awaitingGrade()) grade(false);
      break;
  }
});

// Buttons keep focus after a click, and Space would then "click" them again.
document.querySelectorAll("button").forEach((b) =>
  b.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") e.preventDefault(); }));

// Tap the page to reveal/advance; swipe left = next, swipe right = back.
let touch = null;
let swiped = false;
el.stage.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  touch = { x: t.clientX, y: t.clientY };
  swiped = false;
}, { passive: true });
el.stage.addEventListener("touchend", (e) => {
  if (!touch) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  touch = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    swiped = true;
    if (dx > 0) prev(); else primary();
  }
});
el.stage.addEventListener("click", () => {
  if (swiped) { swiped = false; return; }
  primary();
});

el.photosToggle.addEventListener("click", () => {
  el.photos.hidden = !el.photos.hidden;
  el.photosToggle.setAttribute("aria-pressed", String(!el.photos.hidden));
});

el.back.addEventListener("click", prev);
el.got.addEventListener("click", () => grade(true));
el.missed.addEventListener("click", () => grade(false));
document.querySelectorAll(".modes button").forEach((b) =>
  b.addEventListener("click", () => setMode(b.dataset.mode)));

// Re-read message.txt every few seconds, so edits to it show up live.
function loadMessage() {
  fetch("message.txt", { cache: "no-store" })
    .then((r) => (r.ok ? r.text() : ""))
    .then((text) => {
      text = text.trim();
      if (el.message.textContent !== text) el.message.textContent = text;
    })
    .catch(() => {});
}
loadMessage();
setInterval(loadMessage, 3000);

// --- Load ----------------------------------------------------------------

fetch("cards.json")
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((data) => {
    cards = data.cards;
    buildPagePicker();
    setStartPage(cards[0].page);
  })
  .catch(() => {
    el.cue.textContent =
      "Couldn't load cards.json. If you opened this file directly, run `python3 -m http.server` in this folder and visit http://localhost:8000.";
  });
