const STORAGE_KEY = "daily-fact-v1";
const TIME_ZONE = "Asia/Jerusalem";
const EPOCH_UTC = Date.UTC(2026, 0, 1);
const DECK_SEED = 0xa11ce;
const LETTERS = ["א", "ב", "ג", "ד"];

const dateLine = document.getElementById("date-line");
const streakLine = document.getElementById("streak-line");
const questionEl = document.getElementById("question");
const optionsEl = document.getElementById("options");
const verdictEl = document.getElementById("verdict");
const explainEl = document.getElementById("explain");
const explainBody = document.getElementById("explain-body");
const actionsEl = document.getElementById("actions");
const copyBtn = document.getElementById("copy-btn");
const copyNote = document.getElementById("copy-note");

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle(list, seed) {
  const items = list.slice();
  const rand = mulberry32(seed);
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const swap = items[i];
    items[i] = items[j];
    items[j] = swap;
  }
  return items;
}

function jerusalemDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hebrewDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function dayNumber(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day);
  return Math.floor((utc - EPOCH_UTC) / 86400000);
}

function shiftDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function streakText(count) {
  if (!count) return "עדיין אין רצף";
  if (count === 1) return "רצף: יום אחד";
  if (count === 2) return "רצף: יומיים";
  return `רצף: ${count} ימים`;
}

function visibleStreak(state, today) {
  if (!state.answeredDate || !state.streak) return 0;
  if (state.answeredDate === today) return state.streak;
  if (state.answeredDate === shiftDate(today, -1)) return state.streak;
  return 0;
}

function todayQuestion(isoDate) {
  const deck = seededShuffle(QUESTIONS, DECK_SEED);
  const question = deck[mod(dayNumber(isoDate), deck.length)];
  const choices = seededShuffle(
    question.options.map((text, index) => ({
      text,
      correct: index === question.correctIndex,
    })),
    hashString(`${isoDate}|${question.id}`)
  );
  return { question, choices };
}

function fillExplanation(text) {
  explainBody.replaceChildren();
  text.split("\n\n").forEach((paragraph) => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    explainBody.appendChild(p);
  });
}

function renderOptions(choices, answered, selectedIndex) {
  optionsEl.replaceChildren();
  choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option";
    button.disabled = answered;

    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = LETTERS[index];

    const label = document.createElement("span");
    label.textContent = choice.text;

    button.append(mark, label);

    if (answered && choice.correct) button.classList.add("correct");
    if (answered && index === selectedIndex && !choice.correct) {
      button.classList.add("wrong");
    }
    if (answered && !choice.correct && index !== selectedIndex) {
      button.classList.add("dim");
    }

    if (!answered) {
      button.addEventListener("click", () => submit(index));
    }

    optionsEl.appendChild(button);
  });
}

function showResult(choices, selectedIndex) {
  const correct = choices[selectedIndex].correct;
  verdictEl.hidden = false;
  verdictEl.textContent = correct ? "נכון" : "לא נכון";
  verdictEl.className = correct ? "verdict good" : "verdict bad";
  explainEl.hidden = false;
  actionsEl.hidden = false;
  copyNote.hidden = true;
}

function resultLine(correct) {
  return correct ? "נכון" : "לא נכון";
}

let session = null;

function paint() {
  const today = jerusalemDate();
  const { question, choices } = todayQuestion(today);
  const state = loadState();
  const answered =
    state.answeredDate === today && state.questionId === question.id;
  const selectedIndex = answered ? state.choice : null;

  session = { today, question, choices, state };

  dateLine.textContent = hebrewDate(today);
  streakLine.textContent = streakText(visibleStreak(state, today));
  questionEl.textContent = question.question;
  renderOptions(choices, answered, selectedIndex);

  if (answered) {
    fillExplanation(question.explanation);
    showResult(choices, selectedIndex);
  } else {
    verdictEl.hidden = true;
    explainEl.hidden = true;
    actionsEl.hidden = true;
  }
}

function submit(choiceIndex) {
  const { today, question, choices, state } = session;
  if (state.answeredDate === today && state.questionId === question.id) return;

  const yesterday = shiftDate(today, -1);
  const streak =
    state.answeredDate === yesterday && state.streak ? state.streak + 1 : 1;

  const next = {
    answeredDate: today,
    questionId: question.id,
    choice: choiceIndex,
    streak,
  };
  saveState(next);
  session.state = next;

  streakLine.textContent = streakText(streak);
  renderOptions(choices, true, choiceIndex);
  fillExplanation(question.explanation);
  showResult(choices, choiceIndex);
  verdictEl.focus?.();
}

async function copyResult() {
  const { today, choices, state } = session;
  const correct = Boolean(choices[state.choice]?.correct);
  const text = [
    "העובדה היומית",
    hebrewDate(today),
    resultLine(correct),
    streakText(state.streak),
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  copyNote.hidden = false;
}

copyBtn.addEventListener("click", copyResult);
paint();
