// Eenvoudige JSON-opslag voor één gebruiker.
// Alles staat in data/db.json; schrijven gebeurt atomair (tmp + rename).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY_DB = {
  settings: {
    name: 'Wim',
    tts: false,
    stt: true,
    darkMode: 'auto', // 'auto' | 'licht' | 'donker'
    preferences: 'Kort en nuchter. Geen zweverigheid.'
  },
  sessions: [],       // {id, date, startedAt, closedAt, summary}
  messages: [],       // {id, sessionId, role, content, ts}
  goals: [],          // {id, title, category, status, startDate, notes, lastCheckin}
  memory_items: [],   // {id, date, text, sessionId}
  sleep_logs: [],     // {id, date, bedtime, sleepHours, wokeNight, wakeTime, note}
  daily_checkins: [], // {id, date, energy, stress, mood, focus}
  coping_episodes: [] // {id, ts, date, urgeBefore, urgeAfter, emotion, trigger, intervention, outcome, relapse, note}
};

let db = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    db = structuredClone(EMPTY_DB);
  }
  // Nieuwe velden uit EMPTY_DB aanvullen na updates
  for (const key of Object.keys(EMPTY_DB)) {
    if (db[key] === undefined) db[key] = structuredClone(EMPTY_DB[key]);
  }
  return db;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function id() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { load, save, id, today };
