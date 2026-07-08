// Google OAuth 2.0 voor de agenda-koppeling — handmatig via fetch, geen SDK.
// We vragen alleen leesrechten op de agenda plus het e-mailadres ter herkenning.
// Tokens (incl. refresh token) staan in data/db.json, nooit in git.
//
// Google-kant (eenmalig, door de gebruiker): zie docs/agenda-connector.md.
// Nodig in .env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

const { load, save } = require('../../store');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// Alleen-lezen agenda + e-mail. Schrijven kan later met calendar.events erbij.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
];

function config() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3100/api/google/callback'
  };
}

function isConfigured() {
  const c = config();
  return Boolean(c.clientId && c.clientSecret);
}

// URL waar de gebruiker naartoe gestuurd wordt om toegang te geven.
// access_type=offline + prompt=consent zodat we een refresh token krijgen.
function authUrl() {
  const c = config();
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true'
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// Ruil de code (uit de callback) om voor tokens en bewaar ze.
async function exchangeCode(code) {
  const c = config();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: c.redirectUri,
      grant_type: 'authorization_code'
    })
  });
  if (!res.ok) throw new Error(`Token-uitwisseling mislukt: ${res.status} ${await res.text()}`);
  const data = await res.json();

  const db = load();
  db.google.tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || db.google.tokens?.refresh_token || null,
    expiry: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope || SCOPES.join(' ')
  };
  db.google.email = await fetchEmail(data.access_token);
  save();
  return db.google;
}

async function fetchEmail(accessToken) {
  try {
    const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    return (await res.json()).email || null;
  } catch {
    return null;
  }
}

// Geeft een geldig access token terug; vernieuwt automatisch als het verlopen is.
async function getAccessToken() {
  const db = load();
  const tokens = db.google.tokens;
  if (!tokens) throw Object.assign(new Error('Agenda niet gekoppeld.'), { code: 'NOT_CONNECTED' });

  // Nog ~1 minuut geldig? Dan hergebruiken.
  if (tokens.access_token && tokens.expiry && Date.now() < tokens.expiry - 60000) {
    return tokens.access_token;
  }
  if (!tokens.refresh_token) {
    throw Object.assign(new Error('Koppeling verlopen — koppel de agenda opnieuw.'), { code: 'NEEDS_RECONNECT' });
  }

  const c = config();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  if (!res.ok) {
    throw Object.assign(new Error(`Vernieuwen token mislukt: ${res.status}`), { code: 'NEEDS_RECONNECT' });
  }
  const data = await res.json();
  tokens.access_token = data.access_token;
  tokens.expiry = Date.now() + (data.expires_in || 3600) * 1000;
  if (data.refresh_token) tokens.refresh_token = data.refresh_token; // Google stuurt 'm zelden opnieuw
  save();
  return tokens.access_token;
}

function isConnected() {
  return Boolean(load().google.tokens);
}

function disconnect() {
  const db = load();
  db.google.tokens = null;
  db.google.email = null;
  db.google.calendars = [];
  save();
}

module.exports = { isConfigured, authUrl, exchangeCode, getAccessToken, isConnected, disconnect, SCOPES };
