// Module "Porno als coping" — entry point.
// Bundelt intent-detectie, prompteksten, episode-validatie en
// patroonanalyse. Bewust géén expliciete content in de opslag:
// alleen categorieën, scores en een notitie van max 1 zin.

const { detect } = require('./intents');
const { COPING_PROMPT, COPING_OFFER_HINT } = require('./prompt');
const flows = require('./flows');

const NOTE_MAX = 140; // 1 zin; langere notities worden afgekapt

function clampScore(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function pickEnum(value, allowed, fallback = 'anders') {
  return allowed.includes(value) ? value : fallback;
}

// Valideert en normaliseert een episode uit de request body.
// Alleen patroondata; geen vrije tekst behalve een korte notitie.
function sanitizeEpisode(body = {}) {
  const outcome = ['gezakt', 'gelijk', 'hoger'].includes(body.outcome) ? body.outcome : null;
  return {
    urgeBefore: clampScore(body.urgeBefore),
    urgeAfter: clampScore(body.urgeAfter),
    emotion: pickEnum(body.emotion, flows.EMOTIONS),
    trigger: pickEnum(body.trigger, flows.TRIGGERS),
    intervention: pickEnum(body.intervention, flows.INTERVENTIONS.map((i) => i.id)),
    outcome,
    relapse: body.relapse == null ? null : Boolean(body.relapse),
    note: String(body.note || '').trim().slice(0, NOTE_MAX)
  };
}

function dagdeel(ts) {
  const uur = new Date(ts).getHours();
  return uur >= 23 || uur < 6 ? 'nacht' : uur < 12 ? 'ochtend' : uur < 18 ? 'middag' : 'avond';
}

function topCounts(items, keyFn, limit = 3) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

// Eenvoudig patroonoverzicht over de laatste 90 dagen.
function buildPatterns(episodes) {
  const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
  const recent = episodes.filter((e) => new Date(e.ts).getTime() >= cutoff);

  const labelFor = (id) => flows.INTERVENTIONS.find((i) => i.id === id)?.label || id;

  // Effectiviteit per interventie: hoe vaak zakte de drang?
  const byIntervention = {};
  for (const e of recent) {
    if (!e.intervention || e.intervention === 'anders') continue;
    const entry = (byIntervention[e.intervention] ||= { total: 0, gezakt: 0 });
    entry.total += 1;
    const dropped =
      e.outcome === 'gezakt' ||
      (e.urgeBefore != null && e.urgeAfter != null && e.urgeAfter < e.urgeBefore);
    if (dropped) entry.gezakt += 1;
  }
  const helpful = Object.entries(byIntervention)
    .filter(([, v]) => v.total >= 2)
    .map(([id, v]) => ({ intervention: labelFor(id), total: v.total, gezaktPct: Math.round((v.gezakt / v.total) * 100) }))
    .sort((a, b) => b.gezaktPct - a.gezaktPct)
    .slice(0, 3);

  const relapses = recent.filter((e) => e.relapse === true).length;

  return {
    total: recent.length,
    relapses,
    topTriggers: topCounts(recent, (e) => e.trigger),
    topEmotions: topCounts(recent, (e) => e.emotion),
    topMoments: topCounts(recent, (e) => dagdeel(e.ts)),
    helpfulInterventions: helpful
  };
}

// Compact contextblok voor de chat: recente patronen, zodat de assistent
// kan terugverwijzen ("meestal speelt dit 's nachts na afwijzing").
function patternsSummary(episodes) {
  const p = buildPatterns(episodes);
  if (!p.total) return null;
  const parts = [`Drang-episodes gelogd (90 dagen): ${p.total}, terugval: ${p.relapses}.`];
  if (p.topTriggers.length) parts.push(`Meest voorkomende triggers: ${p.topTriggers.map((t) => t.key).join(', ')}.`);
  if (p.topEmotions.length) parts.push(`Meest voorkomende emoties: ${p.topEmotions.map((t) => t.key).join(', ')}.`);
  if (p.topMoments.length) parts.push(`Meestal in de ${p.topMoments[0].key}.`);
  if (p.helpfulInterventions.length) {
    parts.push(`Wat vaak helpt: ${p.helpfulInterventions.map((h) => `${h.intervention} (${h.gezaktPct}%)`).join(', ')}.`);
  }
  return parts.join(' ');
}

module.exports = {
  detect,
  COPING_PROMPT,
  COPING_OFFER_HINT,
  flows,
  sanitizeEpisode,
  buildPatterns,
  patternsSummary
};
