// OpenAI API-laag: chatantwoord en sessiesamenvatting.

const OpenAI = require('openai');
const { SYSTEM_PROMPT } = require('./systemPrompt');
const { SAFETY_INSTRUCTION } = require('./safety');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const MAX_HISTORY = 20; // recente berichten van de huidige sessie

let client = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI();
  return client;
}

// Compact dynamisch contextblok: naam, tijd, actieve doelen, geheugen, vorige samenvatting.
function buildContextBlock(db, safetyLevel) {
  const parts = [];
  const now = new Date();
  const uur = now.getHours();
  const dagdeel =
    uur >= 23 || uur < 6 ? 'nacht' : uur < 12 ? 'ochtend' : uur < 18 ? 'middag' : 'avond';

  parts.push(`Naam gebruiker: ${db.settings.name}`);
  parts.push(
    `Huidig moment: ${now.toLocaleString('nl-NL', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    })} (${dagdeel})`
  );
  if (db.settings.preferences) parts.push(`Voorkeuren: ${db.settings.preferences}`);

  const activeGoals = db.goals.filter((g) => g.status === 'actief');
  if (activeGoals.length) {
    parts.push(
      'Actieve doelen:\n' +
        activeGoals
          .map((g) => `- ${g.title} (sinds ${g.startDate}${g.lastCheckin ? `, laatste check-in ${g.lastCheckin}` : ''})`)
          .join('\n')
    );
  }

  const memory = db.memory_items.slice(-10);
  if (memory.length) {
    parts.push('Geheugenpunten uit eerdere gesprekken:\n' + memory.map((m) => `- [${m.date}] ${m.text}`).join('\n'));
  }

  const lastClosed = [...db.sessions].reverse().find((s) => s.summary);
  if (lastClosed) {
    parts.push(`Samenvatting vorige sessie (${lastClosed.date}): ${lastClosed.summary}`);
  }

  const lastSleep = db.sleep_logs[db.sleep_logs.length - 1];
  if (lastSleep) {
    parts.push(
      `Laatste slaaplog (${lastSleep.date}): ~${lastSleep.sleepHours} uur geslapen, ` +
        `${lastSleep.wokeNight ? 'wél' : 'niet'} midden in de nacht wakker.`
    );
  }

  if (safetyLevel) parts.push(SAFETY_INSTRUCTION[safetyLevel]);

  return parts.join('\n\n');
}

async function chatReply({ db, sessionMessages, safetyLevel }) {
  const openai = getClient();
  if (!openai) {
    const err = new Error('Geen OPENAI_API_KEY ingesteld. Zet de key in .env en herstart de server.');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const history = sessionMessages.slice(-MAX_HISTORY).map((m) => ({
    role: m.role,
    content: m.content
  }));

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 1024,
    messages: [
      // Vaste prompt eerst: OpenAI's automatische prompt caching hergebruikt de stabiele prefix
      { role: 'system', content: SYSTEM_PROMPT + '\n\n' + buildContextBlock(db, safetyLevel) },
      ...history
    ]
  });

  const choice = response.choices[0];
  if (choice.message.refusal || choice.finish_reason === 'content_filter') {
    return 'Daar kan ik nu geen goed antwoord op geven. Laten we het bij het moment houden: wat heb je nu het meest nodig?';
  }

  return (choice.message.content || '').trim();
}

// Sessie afsluiten: samenvatting + geheugenpunten via structured output.
const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Korte samenvatting van de sessie in 1-3 zinnen, Nederlands, feitelijk.'
    },
    memory_items: {
      type: 'array',
      description:
        'Kernpunten om te onthouden voor volgende gesprekken (bv. "slecht geslapen", "doel: eerder stoppen met werken", "huisarts benaderd"). Max 5, kort.',
      items: { type: 'string' }
    }
  },
  required: ['summary', 'memory_items'],
  additionalProperties: false
};

async function summarizeSession(sessionMessages) {
  const openai = getClient();
  if (!openai) return null;

  const transcript = sessionMessages
    .map((m) => `${m.role === 'user' ? 'Wim' : 'Wim-maatje'}: ${m.content}`)
    .join('\n');

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 1024,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'sessie_samenvatting', strict: true, schema: SUMMARY_SCHEMA }
    },
    messages: [
      {
        role: 'user',
        content:
          'Vat dit coachgesprek samen voor het geheugen van de assistent. Wees feitelijk en kort.\n\n' +
          transcript
      }
    ]
  });

  const choice = response.choices[0];
  if (choice.message.refusal) return null;

  try {
    return JSON.parse(choice.message.content || '');
  } catch {
    return null;
  }
}

module.exports = { chatReply, summarizeSession, MODEL };
