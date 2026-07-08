// Google Calendar lezen — agenda's oplijsten en de afspraken van vandaag ophalen.
// Alleen lezen; normaliseert naar een klein, plat formaat voor de briefing.

const { load, save } = require('../../store');
const { getAccessToken } = require('./oauth');

const API = 'https://www.googleapis.com/calendar/v3';

async function apiGet(path, params = {}) {
  const token = await getAccessToken();
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
  return res.json();
}

// Haal de agenda's op en bewaar ze met een 'selected'-vlag.
// Automatische agenda's (verjaardagen/feestdagen) staan standaard uit.
async function syncCalendars() {
  const data = await apiGet('/users/me/calendarList', { minAccessRole: 'reader' });
  const db = load();
  const previous = new Map(db.google.calendars.map((c) => [c.id, c.selected]));

  db.google.calendars = (data.items || []).map((c) => {
    const auto = /holiday|birthday|verjaardag|feestdag/i.test(c.id + ' ' + (c.summary || ''));
    const wasKnown = previous.has(c.id);
    return {
      id: c.id,
      summary: c.summaryOverride || c.summary || c.id,
      primary: Boolean(c.primary),
      selected: wasKnown ? previous.get(c.id) : (c.primary === true || !auto)
    };
  });
  save();
  return db.google.calendars;
}

function selectedCalendarIds() {
  const cals = load().google.calendars;
  const selected = cals.filter((c) => c.selected).map((c) => c.id);
  // Nog niet gesynct? Val terug op de primaire agenda.
  return selected.length ? selected : ['primary'];
}

// Afspraken van vandaag (lokale dag) uit alle geselecteerde agenda's, gesorteerd op tijd.
async function eventsForToday(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const ids = selectedCalendarIds();
  const all = [];
  for (const id of ids) {
    try {
      const data = await apiGet(`/calendars/${encodeURIComponent(id)}/events`, {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '50'
      });
      for (const ev of data.items || []) {
        if (ev.status === 'cancelled') continue;
        all.push(normalize(ev, data.summary || id));
      }
    } catch (err) {
      // Eén kapotte agenda mag de rest niet blokkeren.
      console.error(`Agenda ${id} overslaan:`, err.message);
    }
  }
  all.sort((a, b) => a.sortKey - b.sortKey);
  return all;
}

function normalize(ev, calendarName) {
  const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
  const startTime = ev.start?.dateTime || ev.start?.date;
  const endTime = ev.end?.dateTime || ev.end?.date;
  const startDate = new Date(startTime);
  return {
    id: ev.id,
    title: (ev.summary || '(zonder titel)').trim(),
    allDay,
    start: startTime,
    end: endTime,
    time: allDay ? null : startDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
    location: (ev.location || '').trim() || null,
    calendar: calendarName,
    sortKey: allDay ? -1 : startDate.getTime()
  };
}

module.exports = { syncCalendars, eventsForToday, selectedCalendarIds };
