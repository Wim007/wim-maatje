// Minimalistische scheduler voor de ochtendbriefing.
// Checkt elke minuut of het tijd is; genereert dan de briefing en stuurt één push.
// Borgt: maximaal één automatische briefing per dag (briefing_state.lastRunDate).
//
// Let op: dit vuurt alleen als de server op dat moment draait. Op een altijd-aan
// host werkt het elke ochtend vanzelf; op een laptop pas als die aanstaat.

const { load, save, today } = require('./store');
const briefing = require('./briefing');
const push = require('./push');

const CHECK_INTERVAL = 60 * 1000; // elke minuut

function parseHHMM(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str || '');
  if (!m) return { h: 8, min: 0 };
  return { h: Math.min(23, Number(m[1])), min: Math.min(59, Number(m[2])) };
}

async function runBriefing(reason = 'auto') {
  const b = await briefing.generateAndStore();
  const db = load();
  db.briefing_state.lastRunDate = today();
  save();

  if (push.hasSubscriptions()) {
    const first = b.items.firstEvent;
    const body = b.items.calendarConnected
      ? (b.items.eventCount ? `${b.items.eventCount} afspraken vandaag${first ? `, eerste om ${first}` : ''}.` : 'Geen afspraken vandaag.')
      : 'Je dagoverzicht staat klaar.';
    try {
      await push.sendToAll({ title: 'Goedemorgen — je briefing staat klaar', body, url: '/?view=briefing' });
    } catch (err) {
      console.error('Push bij briefing mislukt:', err.message);
    }
  }
  console.log(`Ochtendbriefing gegenereerd (${reason}) voor ${b.date}.`);
  return b;
}

function tick() {
  const db = load();
  if (!db.settings.briefingEnabled) return;
  if (db.briefing_state.lastRunDate === today()) return; // vandaag al gedaan

  const { h, min } = parseHHMM(db.settings.briefingTime);
  const now = new Date();
  // Vuur op of net na het ingestelde tijdstip (ook als de server iets later opstartte).
  if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= min)) {
    runBriefing('scheduler').catch((err) => console.error('Briefing mislukt:', err.message));
  }
}

function start() {
  setInterval(tick, CHECK_INTERVAL);
  // Ook kort na opstart één keer checken (server startte misschien ná 08:00).
  setTimeout(tick, 5000);
  console.log('Ochtendbriefing-scheduler actief.');
}

module.exports = { start, runBriefing };
