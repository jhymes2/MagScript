"use strict";

const $ = (id) => document.getElementById(id);
const el = {
  stage: $("stage"),
  cueSpeaker: $("cue-speaker"), cueText: $("cue-text"),
  lineSpeaker: $("line-speaker"), lineText: $("line-text"),
  counter: $("counter"), where: $("where"), fill: $("progress-fill"),
  back: $("back"), grade: $("grade"), hint: $("hint"),
  got: $("got"), missed: $("missed"), toast: $("toast"),
};

let cards = [];
let mode = "chrono";
let revealed = false;

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
  random.queue = shuffle(cards.map((c) => c.id));
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
      chrono.idx = 0;
      toast("End of the play. Back to the start.");
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
  render();
  el.stage.scrollTop = 0;
  el.cueText.scrollTop = el.cueText.scrollHeight; // the end of a long cue matters most
}

function render() {
  const c = currentCard();
  if (!c) return;

  if (c.cue) {
    const cuePg = c.cue.page !== c.page ? `<span class="pg">p. ${c.cue.page}</span>` : "";
    el.cueSpeaker.innerHTML = `${escapeHtml(c.cue.speaker)}.${cuePg}`;
    el.cueText.textContent = c.cue.text;
    el.cueText.classList.toggle("long", c.cue.text.length > 500);
  } else {
    el.cueSpeaker.textContent = "";
    el.cueText.textContent = "(Top of the play)";
  }

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
    el.counter.textContent = `Round ${random.round} · ${random.got} / ${cards.length} got${missed}`;
    el.fill.style.width = `${(random.got / cards.length) * 100}%`;
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
  if (e.metaKey || e.ctrlKey || e.altKey) return;
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

el.back.addEventListener("click", prev);
el.got.addEventListener("click", () => grade(true));
el.missed.addEventListener("click", () => grade(false));
document.querySelectorAll(".modes button").forEach((b) =>
  b.addEventListener("click", () => setMode(b.dataset.mode)));

// --- Load ----------------------------------------------------------------

fetch("cards.json")
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((data) => {
    cards = data.cards;
    startRound();
    show();
  })
  .catch(() => {
    el.cueText.textContent =
      "Couldn't load cards.json. If you opened this file directly, run `python3 -m http.server` in this folder and visit http://localhost:8000.";
  });
