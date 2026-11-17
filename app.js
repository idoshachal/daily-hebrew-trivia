const STORAGE_KEY = "daily-fact-v3";
const ALL_POOL = "all";
const TIME_ZONE = "Asia/Jerusalem";
const EPOCH_UTC = Date.UTC(2026, 0, 1);
const DECK_SEED = 0xa11ce;
const LETTERS = ["א", "ב", "ג", "ד"];

const dateLine = document.getElementById("date-line");
const streakLine = document.getElementById("streak-line");
const deckLabel = document.getElementById("deck-label");
const deckSelect = document.getElementById("deck");
const progressEl = document.getElementById("progress");
const stackEl = document.getElementById("stack");
const actionsEl = document.getElementById("actions");
const copyBtn = document.getElementById("copy-btn");
const copyNote = document.getElementById("copy-note");
const memoryEl = document.getElementById("memory");
const suggestForm = document.getElementById("suggest");
const suggestNote = document.getElementById("suggest-note");
const MEMORY_TEXT = {
  new: "למדתי משהו חדש",
  knew: "ידעתי פעם והספקתי לשכוח",
  remembered: "ידעתי וגם זכרתי",
};

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

function emptyState() {
  return { pool: ALL_POOL, streak: 0, lastCompletedDate: "", byPool: {} };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      pool: typeof parsed.pool === "string" ? parsed.pool : ALL_POOL,
      streak: parsed.streak || 0,
      lastCompletedDate: parsed.lastCompletedDate || "",
      byPool: parsed.byPool && typeof parsed.byPool === "object" ? parsed.byPool : {},
    };
  } catch {
    return emptyState();
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
  if (!state.streak || !state.lastCompletedDate) return 0;
  if (state.lastCompletedDate === today) return state.streak;
  if (state.lastCompletedDate === shiftDate(today, -1)) return state.streak;
  return 0;
}

const BASE_TOPIC_COUNT = 26;
const DECK_GROWTH_DAY = "2026-11-18";

function uniqueAuthors() {
  const seen = [];
  TOPICS.forEach((topic) => {
    if (topic.author && !seen.includes(topic.author)) seen.push(topic.author);
  });
  return seen;
}

function preparedTopics(isoDate) {
  const byId = new Map(QUESTIONS.map((question) => [question.id, question]));
  return TOPICS.map((topic) => ({
    id: topic.id,
    title: topic.title,
    author: topic.author,
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
}

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

function authorTopic(topics, isoDate) {
  const deck = seededShuffle(topics, DECK_SEED);
  return deck[mod(dayNumber(isoDate), deck.length)];
}

function topicForPool(isoDate, pool) {
  const topics = preparedTopics(isoDate);
  if (pool === ALL_POOL) return scheduledTopic(topics, isoDate);
  const mine = topics.filter((topic) => topic.author === pool);
  return mine.length ? authorTopic(mine, isoDate) : scheduledTopic(topics, isoDate);
}

function poolEntry(state, pool, today, topicId) {
  const entry = state.byPool[pool];
  if (
    entry &&
    entry.answeredDate === today &&
    entry.topicId === topicId &&
    Array.isArray(entry.answers)
  ) {
    return {
      answeredDate: entry.answeredDate,
      topicId: entry.topicId,
      answers: entry.answers,
      completed: Boolean(entry.completed),
      memory: entry.memory || "",
    };
  }
  return { answeredDate: today, topicId, answers: [], completed: false, memory: "" };
}

function renderDeckPicker(state) {
  const names = uniqueAuthors();
  const show = names.length > 1;
  deckLabel.hidden = !show;
  if (!show) return ALL_POOL;

  const options = [{ value: ALL_POOL, label: "שאלה יומית" }].concat(
    names.map((name) => ({ value: name, label: `שאלה יומית של ${name}` }))
  );
  const selected = options.some((item) => item.value === state.pool) ? state.pool : ALL_POOL;
  deckSelect.replaceChildren();
  options.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    option.selected = item.value === selected;
    deckSelect.appendChild(option);
  });
  return selected;
}

function renderRound(round, selectedIndex) {
  const section = document.createElement("section");
  section.className = "round";

  const heading = document.createElement("h2");
  heading.textContent = round.question.question;

  const options = document.createElement("div");
  options.className = "options";
  options.setAttribute("role", "group");
  const answered = selectedIndex !== null;

  round.choices.forEach((choice, index) => {
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
    if (answered && index === selectedIndex && !choice.correct) button.classList.add("wrong");
    if (answered && !choice.correct && index !== selectedIndex) button.classList.add("dim");
    if (!answered) button.addEventListener("click", () => submit(index));

    options.appendChild(button);
  });

  section.append(heading, options);
  if (!answered) return section;

  const verdict = document.createElement("p");
  verdict.className = round.choices[selectedIndex].correct ? "verdict good" : "verdict bad";
  verdict.setAttribute("role", "status");
  verdict.textContent = round.choices[selectedIndex].correct ? "נכון" : "לא נכון";

  const explain = document.createElement("section");
  explain.className = "explain";
  const title = document.createElement("h3");
  title.textContent = "ההסבר המלא";
  const body = document.createElement("div");
  round.question.explanation.split("\n\n").forEach((paragraph) => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    body.appendChild(p);
  });
  explain.append(title, body);
  section.append(verdict, explain);
  return section;
}

let session = null;
let scrollTarget = null;

function paint() {
  const today = jerusalemDate();
  const stored = loadState();
  const pool = renderDeckPicker(stored);
  const topic = topicForPool(today, pool);
  const entry = poolEntry(stored, pool, today, topic.id);
  const answers = entry.answers;
  const finished = answers.length >= topic.questions.length;
  const visibleCount = finished ? topic.questions.length : answers.length + 1;

  session = { today, topic, pool, answers, stored, memory: entry.memory || "" };

  dateLine.textContent = hebrewDate(today);
  streakLine.textContent = streakText(visibleStreak(stored, today));
  const correctCount = answers.filter((choice, index) => {
    return topic.questions[index].choices[choice].correct;
  }).length;
  const detail = finished
    ? `${correctCount} מתוך ${topic.questions.length}`
    : `שאלה ${visibleCount} מתוך ${topic.questions.length}`;
  const showAuthor = uniqueAuthors().length > 1 && topic.author;
  progressEl.textContent = showAuthor
    ? `${topic.author} · ${topic.title} · ${detail}`
    : `${topic.title} · ${detail}`;

  stackEl.replaceChildren();
  for (let index = 0; index < visibleCount; index += 1) {
    const selected = index < answers.length ? answers[index] : null;
    stackEl.appendChild(renderRound(topic.questions[index], selected));
  }

  actionsEl.hidden = !finished;
  copyBtn.hidden = !finished;
  memoryEl.hidden = !finished;
  suggestForm.hidden = !finished;
  copyNote.hidden = true;
  memoryEl.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("selected", button.dataset.memory === entry.memory);
  });

  if (scrollTarget !== null) {
    const node = stackEl.children[scrollTarget];
    scrollTarget = null;
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function submit(choiceIndex) {
  const { today, topic, pool, answers, stored } = session;
  if (answers.length >= topic.questions.length) return;

  const nextAnswers = answers.concat(choiceIndex);
  const finished = nextAnswers.length === topic.questions.length;
  const previous = stored.byPool[pool];
  const keptMemory = previous && previous.answeredDate === today ? previous.memory || "" : "";
  const byPool = Object.assign({}, stored.byPool, {
    [pool]: {
      answeredDate: today,
      topicId: topic.id,
      answers: nextAnswers,
      completed: finished,
      memory: keptMemory,
    },
  });

  let streak = stored.streak || 0;
  let lastCompletedDate = stored.lastCompletedDate || "";
  if (finished && lastCompletedDate !== today) {
    const yesterday = shiftDate(today, -1);
    streak = lastCompletedDate === yesterday && streak ? streak + 1 : 1;
    lastCompletedDate = today;
  }

  saveState({ pool, streak, lastCompletedDate, byPool });
  scrollTarget = finished ? nextAnswers.length - 1 : nextAnswers.length;
  paint();
}

async function copyResult() {
  const { today, topic } = session;
  const state = loadState();
  const entry = state.byPool[session.pool];
  const correctCount = topic.questions.filter((round, index) => {
    return round.choices[entry.answers[index]]?.correct;
  }).length;
  const lines = ["העובדה היומית", hebrewDate(today)];
  if (uniqueAuthors().length > 1 && topic.author) lines.push(topic.author);
  lines.push(
    topic.title,
    `${correctCount} מתוך ${topic.questions.length}`,
    streakText(state.streak)
  );
  if (entry.memory && MEMORY_TEXT[entry.memory]) lines.push(MEMORY_TEXT[entry.memory]);
  const text = lines.join("\n");

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

function suggestMessage(text, ok) {
  suggestNote.hidden = false;
  suggestNote.textContent = text;
  suggestNote.className = ok ? "suggest-note good" : "suggest-note bad";
}

async function sendSuggestion(event) {
  event.preventDefault();
  const data = new FormData(suggestForm);
  if (String(data.get("website") || "").trim()) {
    suggestMessage("נשלח. אפשר לשלוח עוד שאלה.", true);
    suggestForm.elements.body.value = "";
    return;
  }

  const displayName = String(data.get("display_name") || "").trim();
  const body = String(data.get("body") || "").trim();
  if (displayName.length < 2 || displayName.length > 40) {
    suggestMessage("השם צריך להיות בין 2 ל-40 תווים.", false);
    return;
  }
  if (body.length < 10 || body.length > 2000) {
    suggestMessage("השאלה צריכה להיות בין 10 ל-2000 תווים.", false);
    return;
  }

  const frameName = "suggest-frame";
  let frame = document.getElementById(frameName);
  if (!frame) {
    frame = document.createElement("iframe");
    frame.id = frameName;
    frame.name = frameName;
    frame.hidden = true;
    frame.style.display = "none";
    document.body.appendChild(frame);
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "https://docs.google.com/forms/d/e/1FAIpQLSdPpaz7hVphB6T1cwwSfaT6anEAyu5F6ALUVnP3poGIvqozpQ/formResponse";
  form.target = frameName;
  form.acceptCharset = "UTF-8";
  const fields = {
    "entry.364998489": displayName,
    "entry.2060333505": body,
    fvv: "1",
    pageHistory: "0",
  };
  Object.keys(fields).forEach((name) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = fields[name];
    form.appendChild(input);
  });
  form.style.display = "none";
  document.body.appendChild(form);
  form.submit();
  form.remove();
  suggestForm.elements.body.value = "";
  suggestMessage("נשלח. אפשר לשלוח עוד שאלה.", true);
}

deckSelect.addEventListener("change", () => {
  const stored = loadState();
  stored.pool = deckSelect.value;
  saveState(stored);
  paint();
});
function setMemory(value) {
  const { today, topic, pool, stored } = session;
  const entry = poolEntry(stored, pool, today, topic.id);
  const byPool = Object.assign({}, stored.byPool, {
    [pool]: Object.assign({}, entry, { memory: value }),
  });
  saveState({
    pool,
    streak: stored.streak || 0,
    lastCompletedDate: stored.lastCompletedDate || "",
    byPool,
  });
  paint();
}

copyBtn.addEventListener("click", copyResult);
memoryEl.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => setMemory(button.dataset.memory));
});
suggestForm.addEventListener("submit", sendSuggestion);
paint();
