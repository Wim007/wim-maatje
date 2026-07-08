require('dotenv').config();

const path = require('path');
const express = require('express');

const { load, save, id, today } = require('./src/store');
const { assess } = require('./src/safety');
const { chatReply, summarizeSession } = require('./src/openai');
const { SOURCES } = require('./src/sources');
const coping = require('./src/coping');

const app = express();
const PORT = process.env.PORT || 3100;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Chat ----------

app.post('/api/chat', async (req, res) => {
  const db = load();
  const text = (req.body.message || '').trim();
  if (!text) return res.status(400).json({ error: 'Leeg bericht.' });

  // Sessie ophalen of aanmaken
  let session = db.sessions.find((s) => s.id === req.body.sessionId && !s.closedAt);
  if (!session) {
    session = { id: id(), date: today(), startedAt: new Date().toISOString(), closedAt: null, summary: null };
    db.sessions.push(session);
  }

  const recentUserMessages = db.messages.filter((m) => m.role === 'user').map((m) => m.content);
  const safetyLevel = assess(text, recentUserMessages);

  // Module "Porno als coping": expliciete drang activeert de module voor
  // de rest van de sessie; zachtere signalen geven alleen een aanbied-hint.
  const copingIntent = coping.detect(text);
  if (copingIntent === 'direct') session.copingMode = true;
  const copingState = session.copingMode ? 'actief' : copingIntent === 'mogelijk' ? 'mogelijk' : null;

  db.messages.push({ id: id(), sessionId: session.id, role: 'user', content: text, ts: new Date().toISOString() });

  const sessionMessages = db.messages.filter((m) => m.sessionId === session.id);

  try {
    const reply = await chatReply({ db, sessionMessages, safetyLevel, copingState });
    db.messages.push({ id: id(), sessionId: session.id, role: 'assistant', content: reply, ts: new Date().toISOString() });
    save();
    res.json({ sessionId: session.id, reply, safety: safetyLevel });
  } catch (err) {
    save(); // gebruikersbericht wel bewaren
    console.error('Chatfout:', err.message);
    const msg =
      err.code === 'NO_API_KEY'
        ? err.message
        : 'Er ging iets mis bij het ophalen van een antwoord. Probeer het zo nog eens.';
    res.status(err.code === 'NO_API_KEY' ? 503 : 502).json({ sessionId: session.id, error: msg, safety: safetyLevel });
  }
});

// Sessie afsluiten -> samenvatting + geheugenpunten
app.post('/api/sessions/:id/close', async (req, res) => {
  const db = load();
  const session = db.sessions.find((s) => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Sessie niet gevonden.' });
  if (session.closedAt) return res.json({ session });

  const sessionMessages = db.messages.filter((m) => m.sessionId === session.id);
  session.closedAt = new Date().toISOString();

  if (sessionMessages.length >= 2) {
    try {
      const result = await summarizeSession(sessionMessages);
      if (result) {
        session.summary = result.summary;
        for (const text of (result.memory_items || []).slice(0, 5)) {
          db.memory_items.push({ id: id(), date: session.date, text, sessionId: session.id });
        }
      }
    } catch (err) {
      console.error('Samenvatting mislukt:', err.message);
    }
  }
  save();
  res.json({ session });
});

app.get('/api/sessions', (req, res) => {
  const db = load();
  const sessions = [...db.sessions]
    .reverse()
    .map((s) => ({
      ...s,
      messageCount: db.messages.filter((m) => m.sessionId === s.id).length
    }));
  res.json({ sessions });
});

app.get('/api/sessions/:id', (req, res) => {
  const db = load();
  const session = db.sessions.find((s) => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Sessie niet gevonden.' });
  const messages = db.messages.filter((m) => m.sessionId === session.id);
  res.json({ session, messages });
});

// ---------- Doelen ----------

app.get('/api/goals', (req, res) => {
  res.json({ goals: load().goals });
});

app.post('/api/goals', (req, res) => {
  const db = load();
  const { title, category, notes } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Titel is verplicht.' });
  const goal = {
    id: id(),
    title: title.trim(),
    category: (category || 'algemeen').trim(),
    status: 'actief', // actief | afgerond | gepauzeerd
    startDate: today(),
    notes: (notes || '').trim(),
    lastCheckin: null
  };
  db.goals.push(goal);
  save();
  res.json({ goal });
});

app.patch('/api/goals/:id', (req, res) => {
  const db = load();
  const goal = db.goals.find((g) => g.id === req.params.id);
  if (!goal) return res.status(404).json({ error: 'Doel niet gevonden.' });
  const { title, category, status, notes, checkin } = req.body;
  if (title !== undefined) goal.title = title.trim();
  if (category !== undefined) goal.category = category.trim();
  if (status !== undefined) goal.status = status;
  if (notes !== undefined) goal.notes = notes.trim();
  if (checkin) {
    goal.lastCheckin = today();
    if (typeof checkin === 'string' && checkin.trim()) {
      goal.notes = (goal.notes ? goal.notes + '\n' : '') + `[${today()}] ${checkin.trim()}`;
    }
  }
  save();
  res.json({ goal });
});

app.delete('/api/goals/:id', (req, res) => {
  const db = load();
  const idx = db.goals.findIndex((g) => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Doel niet gevonden.' });
  db.goals.splice(idx, 1);
  save();
  res.json({ ok: true });
});

// ---------- Slaaplog ----------

app.get('/api/sleep', (req, res) => {
  res.json({ logs: load().sleep_logs.slice(-30) });
});

app.post('/api/sleep', (req, res) => {
  const db = load();
  const { date, bedtime, sleepHours, wokeNight, wakeTime, note } = req.body;
  const logDate = date || today();
  // één log per dag: bestaande overschrijven
  const existing = db.sleep_logs.find((l) => l.date === logDate);
  const log = existing || { id: id(), date: logDate };
  Object.assign(log, {
    bedtime: bedtime || '',
    sleepHours: sleepHours === '' || sleepHours == null ? null : Number(sleepHours),
    wokeNight: Boolean(wokeNight),
    wakeTime: wakeTime || '',
    note: (note || '').trim()
  });
  if (!existing) db.sleep_logs.push(log);
  db.sleep_logs.sort((a, b) => a.date.localeCompare(b.date));
  save();
  res.json({ log });
});

// ---------- Dagstatus ----------

app.get('/api/checkins', (req, res) => {
  res.json({ checkins: load().daily_checkins.slice(-30) });
});

app.post('/api/checkins', (req, res) => {
  const db = load();
  const { date, energy, stress, mood, focus } = req.body;
  const cDate = date || today();
  const existing = db.daily_checkins.find((c) => c.date === cDate);
  const checkin = existing || { id: id(), date: cDate };
  const num = (v) => (v === '' || v == null ? null : Math.max(1, Math.min(10, Number(v))));
  Object.assign(checkin, { energy: num(energy), stress: num(stress), mood: num(mood), focus: num(focus) });
  if (!existing) db.daily_checkins.push(checkin);
  db.daily_checkins.sort((a, b) => a.date.localeCompare(b.date));
  save();
  res.json({ checkin });
});

// ---------- Drang (module "Porno als coping") ----------
// Alleen patroondata: scores, categorieën en een korte notitie.
// Geen expliciete content — sanitizeEpisode dwingt dat af.

app.get('/api/coping/episodes', (req, res) => {
  res.json({ episodes: load().coping_episodes.slice(-50), flows: publicFlows() });
});

app.post('/api/coping/episodes', (req, res) => {
  const db = load();
  const episode = {
    id: id(),
    ts: new Date().toISOString(),
    date: today(),
    ...coping.sanitizeEpisode(req.body)
  };
  db.coping_episodes.push(episode);
  save();
  res.json({ episode });
});

// Naderhand bijwerken (bv. drang-na of terugval invullen).
app.patch('/api/coping/episodes/:id', (req, res) => {
  const db = load();
  const episode = db.coping_episodes.find((e) => e.id === req.params.id);
  if (!episode) return res.status(404).json({ error: 'Episode niet gevonden.' });
  const clean = coping.sanitizeEpisode({ ...episode, ...req.body });
  Object.assign(episode, clean);
  save();
  res.json({ episode });
});

app.get('/api/coping/patterns', (req, res) => {
  res.json({ patterns: coping.buildPatterns(load().coping_episodes) });
});

function publicFlows() {
  const { EMOTIONS, TRIGGERS, INTERVENTIONS } = coping.flows;
  return { emotions: EMOTIONS, triggers: TRIGGERS, interventions: INTERVENTIONS };
}

// ---------- Instellingen & bronnen ----------

app.get('/api/settings', (req, res) => {
  res.json({ settings: load().settings });
});

app.put('/api/settings', (req, res) => {
  const db = load();
  const { name, tts, stt, darkMode, preferences } = req.body;
  if (name !== undefined) db.settings.name = String(name).trim() || 'Wim';
  if (tts !== undefined) db.settings.tts = Boolean(tts);
  if (stt !== undefined) db.settings.stt = Boolean(stt);
  if (darkMode !== undefined) db.settings.darkMode = darkMode;
  if (preferences !== undefined) db.settings.preferences = String(preferences).trim();
  save();
  res.json({ settings: db.settings });
});

app.get('/api/sources', (req, res) => {
  res.json({ sources: SOURCES });
});

app.listen(PORT, () => {
  console.log(`Wim-maatje draait op http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('Let op: geen OPENAI_API_KEY gevonden — chat werkt pas na het instellen van de key in .env');
  }
});
