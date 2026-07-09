// Ochtendbriefing — kort, kalm, ADHD-proof.
// Bewust deterministisch (geen LLM-call) zodat de 08:00-briefing nooit faalt.
// Bron: agenda van vandaag + actieve doelen. Eén moment per dag, verder stil.

const { load, save, id, today } = require('../store');
const gcal = require('../connectors/google-calendar');

function greeting(name) {
  return `Goedemorgen, ${name}.`;
}

// Vat een volle agenda samen in plaats van alles op te sommen.
function summarizeEvents(events) {
  const timed = events.filter((e) => !e.allDay);
  const allDay = events.filter((e) => e.allDay);
  const lines = [];

  if (!events.length) {
    lines.push('Je agenda is vandaag leeg.');
    return lines;
  }

  if (timed.length <= 4) {
    for (const e of timed) {
      lines.push(`• ${e.time} — ${e.title}${e.location ? ` (${e.location})` : ''}`);
    }
  } else {
    // Te veel: samenvatten in plaats van dumpen.
    lines.push(`• ${timed.length} afspraken, eerste om ${timed[0].time}, laatste om ${timed[timed.length - 1].time}.`);
    lines.push(`• Eerstvolgende: ${timed[0].time} — ${timed[0].title}.`);
  }
  for (const e of allDay) lines.push(`• Hele dag: ${e.title}`);
  return lines;
}

function topGoals(goals, limit = 3) {
  return goals.filter((g) => g.status === 'actief').slice(0, limit);
}

// Bouwt de briefingtekst + een gestructureerd object.
async function composeBriefing() {
  const db = load();
  const name = db.settings.name || 'Wim';

  let events = [];
  let calendarError = null;
  if (gcal.isConnected()) {
    try {
      events = await gcal.eventsForToday();
    } catch (err) {
      calendarError = err.code === 'NEEDS_RECONNECT'
        ? 'Je agenda-koppeling is verlopen — koppel opnieuw in de instellingen.'
        : 'Ik kon je agenda even niet ophalen.';
    }
  }

  const goals = topGoals(db.goals);

  const parts = [greeting(name), ''];

  parts.push('Vandaag in je agenda:');
  if (calendarError) {
    parts.push(`• ${calendarError}`);
  } else if (!gcal.isConnected()) {
    parts.push('• (Agenda nog niet gekoppeld — dat kan in de instellingen.)');
  } else {
    parts.push(...summarizeEvents(events));
  }

  if (goals.length) {
    parts.push('', 'Waar je aan werkt:');
    for (const g of goals) parts.push(`• ${g.title}`);
  }

  parts.push('', 'Eén ding tegelijk. Wat is vanochtend de kleinste zinvolle stap?');

  const text = parts.join('\n');
  const briefing = {
    id: id(),
    date: today(),
    generatedAt: new Date().toISOString(),
    acknowledged: false, // wordt true zodra Wim op "Gelezen" tikt; stopt de herinneringen
    text,
    items: {
      eventCount: events.length,
      firstEvent: events.find((e) => !e.allDay)?.time || null,
      goalCount: goals.length,
      calendarConnected: gcal.isConnected(),
      calendarError
    }
  };
  return briefing;
}

// Genereer + bewaar de briefing van vandaag (overschrijft een bestaande van vandaag).
async function generateAndStore() {
  const briefing = await composeBriefing();
  const db = load();
  db.briefings = db.briefings.filter((b) => b.date !== briefing.date);
  db.briefings.push(briefing);
  if (db.briefings.length > 60) db.briefings = db.briefings.slice(-60);
  save();
  return briefing;
}

function todaysBriefing() {
  return load().briefings.find((b) => b.date === today()) || null;
}

// Markeer de briefing van vandaag als gelezen -> stopt de herinneringen.
function acknowledgeToday() {
  const db = load();
  const b = db.briefings.find((x) => x.date === today());
  if (b) {
    b.acknowledged = true;
    save();
  }
  return b || null;
}

module.exports = { composeBriefing, generateAndStore, todaysBriefing, acknowledgeToday };
