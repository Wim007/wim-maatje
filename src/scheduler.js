// Scheduler voor de ochtendbriefing + herinneringen ("melding-tot-gelezen").
//
// Gedrag, afgestemd op ADHD/vluchtgedrag:
//  - Op het ingestelde tijdstip (standaard 08:00): briefing genereren + eerste push.
//  - Blijft daarna elke `nagIntervalMin` minuten (standaard 20) opnieuw pushen,
//    tot je op "Gelezen" tikt OF tot `nagUntil` (standaard 11:00) — daarna rust.
//  - Wegvegen helpt niet: de melding komt terug tot je 'm gelezen hebt.
//
// Let op: dit vuurt alleen als de server draait. Op een altijd-aan host werkt het
// elke ochtend vanzelf; op een laptop pas als die aanstaat.

const { load, save, today } = require('./store');
const briefing = require('./briefing');
const push = require('./push');

const CHECK_INTERVAL = 60 * 1000; // elke minuut

function parseHHMM(str, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str || '');
  if (!m) return fallback;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

function pushBody(b) {
  if (!b.items.calendarConnected) return 'Je dagoverzicht staat klaar.';
  if (!b.items.eventCount) return 'Geen afspraken vandaag.';
  return `${b.items.eventCount} afspraken vandaag${b.items.firstEvent ? `, eerste om ${b.items.firstEvent}` : ''}.`;
}

// Stuur de melding. Sticky (blijft staan) en met vaste tag + renotify, zodat een
// herinnering de vorige vervangt en opnieuw laat trillen i.p.v. te stapelen.
async function sendBriefingPush(b, { reminder = false } = {}) {
  if (push.hasSubscriptions()) {
    try {
      await push.sendToAll({
        title: reminder ? 'Nog even je briefing lezen' : 'Goedemorgen — je briefing staat klaar',
        body: pushBody(b),
        url: '/?view=briefing',
        tag: 'wim-maatje-briefing',
        requireInteraction: true,
        renotify: true
      });
    } catch (err) {
      console.error('Push mislukt:', err.message);
    }
  }
  // Ritme altijd bijwerken, ook zonder telefoon: voorkomt elke-minuut-checks
  // en houdt de 20-minuten-tussenpozen kloppend zodra er wél een telefoon is.
  const db = load();
  db.briefing_state.lastNudgeAt = new Date().toISOString();
  save();
}

async function runBriefing(reason = 'auto') {
  const b = await briefing.generateAndStore();
  const db = load();
  db.briefing_state.lastRunDate = today();
  save();
  await sendBriefingPush(b, { reminder: false });
  console.log(`Ochtendbriefing gegenereerd (${reason}) voor ${b.date}.`);
  return b;
}

async function tick() {
  const db = load();
  if (!db.settings.briefingEnabled) return;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = parseHHMM(db.settings.briefingTime, 8 * 60);       // 08:00
  const endMin = parseHHMM(db.settings.nagUntil, 11 * 60);            // 11:00
  const intervalMs = Math.max(1, db.settings.nagIntervalMin || 20) * 60000;

  // Alleen actief binnen het venster (bv. 08:00–11:00). Daarbuiten: rust.
  if (nowMin < startMin || nowMin > endMin) return;

  // Eerste keer vandaag: genereren + eerste melding.
  if (db.briefing_state.lastRunDate !== today()) {
    await runBriefing('scheduler');
    return;
  }

  // Al gegenereerd: herinneren tot gelezen.
  const b = briefing.todaysBriefing();
  if (!b || b.acknowledged) return; // gelezen -> klaar voor vandaag

  const last = db.briefing_state.lastNudgeAt ? new Date(db.briefing_state.lastNudgeAt).getTime() : 0;
  if (Date.now() - last >= intervalMs) {
    await sendBriefingPush(b, { reminder: true });
    console.log(`Herinnering verstuurd voor ${b.date}.`);
  }
}

function start() {
  setInterval(() => tick().catch((err) => console.error('Briefing-tick fout:', err.message)), CHECK_INTERVAL);
  setTimeout(() => tick().catch((err) => console.error('Briefing-tick fout:', err.message)), 5000);
  console.log('Ochtendbriefing-scheduler actief (met herinneringen tot gelezen).');
}

module.exports = { start, runBriefing, tick };
