// Web-push: pushmeldingen naar de telefoon(s).
// VAPID-sleutels worden één keer gegenereerd en in db bewaard.
// Vereist een geïnstalleerde PWA + toestemming voor meldingen op de telefoon.

const webpush = require('web-push');
const { load, save } = require('../store');

let configured = false;

// Zorgt voor VAPID-sleutels (genereert eenmalig) en configureert web-push.
function ensureVapid() {
  const db = load();
  if (!db.vapid) {
    db.vapid = webpush.generateVAPIDKeys(); // {publicKey, privateKey}
    save();
  }
  if (!configured) {
    const contact = process.env.PUSH_CONTACT || 'mailto:wim@wim-maatje.local';
    webpush.setVapidDetails(contact, db.vapid.publicKey, db.vapid.privateKey);
    configured = true;
  }
  return db.vapid;
}

function publicKey() {
  return ensureVapid().publicKey;
}

function saveSubscription(sub) {
  if (!sub || !sub.endpoint) return false;
  const db = load();
  if (!db.push_subscriptions.some((s) => s.endpoint === sub.endpoint)) {
    db.push_subscriptions.push(sub);
    save();
  }
  return true;
}

function removeSubscription(endpoint) {
  const db = load();
  const before = db.push_subscriptions.length;
  db.push_subscriptions = db.push_subscriptions.filter((s) => s.endpoint !== endpoint);
  if (db.push_subscriptions.length !== before) save();
}

// Verstuur een melding naar alle telefoons; ruimt dode subscriptions op.
async function sendToAll({ title, body, url = '/' }) {
  ensureVapid();
  const db = load();
  const payload = JSON.stringify({ title, body, url });
  const dead = [];

  await Promise.all(
    db.push_subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, payload);
      } catch (err) {
        // 404/410 = subscription bestaat niet meer.
        if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint);
        else console.error('Push mislukt:', err.statusCode || err.message);
      }
    })
  );

  for (const endpoint of dead) removeSubscription(endpoint);
  return { sent: db.push_subscriptions.length - dead.length, removed: dead.length };
}

function hasSubscriptions() {
  return load().push_subscriptions.length > 0;
}

module.exports = { publicKey, saveSubscription, removeSubscription, sendToAll, hasSubscriptions };
