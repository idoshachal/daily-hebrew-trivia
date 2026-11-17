const STORAGE_KEY = "daily-fact-v2";
const TIME_ZONE = "Asia/Jerusalem";
const EPOCH_UTC = Date.UTC(2026, 0, 1);
const DECK_SEED = 0xa11ce;
const LETTERS = ["א", "ב", "ג", "ד"];

const dateLine = document.getElementById("date-line");
const streakLine = document.getElementById("streak-line");
const progressEl = document.getElementById("progress");
const questionEl = document.getElementById("question");
const optionsEl = document.getElementById("options");
const verdictEl = document.getElementById("verdict");
const explainEl = document.getElementById("explain");
const explainBody = document.getElementById("explain-body");
const actionsEl = document.getElementById("actions");
const copyBtn = document.getElementById("copy-btn");
const copyNote = document.getElementById("copy-note");
const nextBtn = document.getElementById("next-btn");

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
  if (state.answeredDate === shiftDate(today, -1) && state.completed) return state.streak;
  return 0;
}

const BASE_TOPIC_COUNT = 26;
const DECK_GROWTH_DAY = "2026-11-18";

function scheduledTopic(topics, isoDate) {
  const base = seededShuffle(topics.slice(0, BASE_TOPIC_COUNT), DECK_SEED);
  const extras = topics.slice(BASE_TOPIC_COUNT);
  const n = dayNumber(isoDate);
  const added = dayNumber(DECK_GROWTH_DAY);
  const cycleEnd = added - mod(added, base.length) + base.length;
  if (n < cycleEnd || extras.length === 0) return base[mod(n, base.length)];
  const extended = extras.concat(base);
  return extended[mod(n - cycleEnd, extended.length)];
}

function todayTopic(isoDate) {
  const byId = new Map(QUESTIONS.map((question) => [question.id, question]));
  const topics = TOPICS.map((topic) => ({
    id: topic.id,
    title: topic.title,
    questions: topic.questionIds.map((id) => {
      const question = byId.get(id);
      const choices = seededShuffle(
        question.options.map((text, index) => ({
          text,
          correct: index === question.correctIndex,
        })),
        hashString(`${isoDate}|${id}`)
      );
      return { question, choices };
    }),
  }));
  return scheduledTopic(topics, isoDate);
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

function showResult(correct) {
  verdictEl.hidden = false;
  verdictEl.textContent = correct ? "נכון" : "לא נכון";
  verdictEl.className = correct ? "verdict good" : "verdict bad";
  explainEl.hidden = false;
  actionsEl.hidden = false;
  copyNote.hidden = true;
}

function sameDayState(state, today, topicId) {
  if (state.answeredDate === today && state.topicId === topicId && Array.isArray(state.answers)) {
    return state;
  }
  return null;
}

let session = null;
let reviewIndex = null;

function paint() {
  const today = jerusalemDate();
  const topic = todayTopic(today);
  const stored = loadState();
  const active = sameDayState(stored, today, topic.id);
  const answers = active ? active.answers : [];
  const finished = answers.length >= topic.questions.length;
  let cursor = finished ? topic.questions.length - 1 : answers.length;
  if (reviewIndex !== null && reviewIndex < answers.length) cursor = reviewIndex;
  const round = topic.questions[cursor];
  const selectedIndex = cursor < answers.length ? answers[cursor] : null;
  const answered = selectedIndex !== null;

  session = { today, topic, cursor, answers, stored };

  dateLine.textContent = hebrewDate(today);
  streakLine.textContent = streakText(visibleStreak(stored, today));
  const score = finished
    ? ` · ${answers.filter((choice, index) => topic.questions[index].choices[choice].correct).length} נכונות`
    : "";
  progressEl.textContent = `${topic.title} · שאלה ${cursor + 1} מתוך ${topic.questions.length}${score}`;
  questionEl.textContent = round.question.question;
  renderOptions(round.choices, answered, selectedIndex);

  if (answered) {
    fillExplanation(round.question.explanation);
    showResult(round.choices[selectedIndex].correct);
    nextBtn.hidden = cursor >= topic.questions.length - 1;
    copyBtn.hidden = !finished;
  } else {
    verdictEl.hidden = true;
    explainEl.hidden = true;
    explainBody.replaceChildren();
    actionsEl.hidden = true;
    nextBtn.hidden = true;
    copyBtn.hidden = true;
  }
}

function submit(choiceIndex) {
  const { today, topic, cursor, answers, stored } = session;
  if (answers.length !== cursor) return;

  const nextAnswers = answers.concat(choiceIndex);
  const finished = nextAnswers.length === topic.questions.length;
  const yesterdayDone =
    stored.answeredDate === shiftDate(today, -1) && stored.completed && stored.streak;
  const kept = finished ? (yesterdayDone ? stored.streak + 1 : 1) : yesterdayDone ? stored.streak : 0;

  const next = {
    answeredDate: today,
    topicId: topic.id,
    answers: nextAnswers,
    completed: finished,
    streak: kept,
  };
  saveState(next);
  reviewIndex = nextAnswers.length - 1;
  paint();
}

function showNext() {
  reviewIndex = null;
  paint();
}

async function copyResult() {
  const { today, topic, stored } = session;
  const state = loadState();
  const correctCount = topic.questions.filter((round, index) => {
    return round.choices[state.answers[index]]?.correct;
  }).length;
  const text = [
    "העובדה היומית",
    hebrewDate(today),
    topic.title,
    `${correctCount} מתוך ${topic.questions.length}`,
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
nextBtn.addEventListener("click", showNext);
paint();
