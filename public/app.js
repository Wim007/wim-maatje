// Wim-maatje frontend — vanilla JS, één pagina met tabs.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  sessionId: localStorage.getItem('wm_sessionId') || null,
  settings: { name: 'Wim', tts: false, stt: true, darkMode: 'auto', preferences: '' },
  recognizing: false
};

// ---------- Hulpfuncties ----------

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Er ging iets mis.'), { data });
  return data;
}

function fmtDate(iso) {
  return new Date(iso + (iso.length === 10 ? 'T12:00' : '')).toLocaleDateString('nl-NL', {
    weekday: 'short', day: 'numeric', month: 'short'
  });
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.darkMode || 'auto';
}

function setGreeting() {
  const uur = new Date().getHours();
  const naam = state.settings.name || 'Wim';
  const tekst =
    uur >= 23 || uur < 6 ? `Het is nacht, ${naam}. Rustig aan.` :
    uur < 12 ? `Goedemorgen, ${naam}.` :
    uur < 18 ? `Goedemiddag, ${naam}.` : `Goedenavond, ${naam}.`;
  $('#greeting').textContent = tekst;
}

// ---------- Tabs ----------

function showView(name) {
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${name}`).classList.remove('hidden');
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  if (name === 'briefing') loadBriefing();
  if (name === 'sleep') loadSleep();
  if (name === 'day') loadCheckins();
  if (name === 'coping') loadCoping();
  if (name === 'goals') loadGoals();
  if (name === 'history') loadSessions();
}

$('#tabbar').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) showView(tab.dataset.view);
});

$('#btn-settings').addEventListener('click', () => {
  $$('.tab').forEach((t) => t.classList.remove('active'));
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $('#view-settings').classList.remove('hidden');
  loadSources();
  loadAgenda();
  loadPushStatus();
});

// ---------- Chat ----------

const messagesEl = $('#messages');
const inputEl = $('#input');

function addWelcome() {
  if (messagesEl.children.length) return;
  const el = document.createElement('p');
  el.className = 'welcome';
  el.textContent = 'Eén ding tegelijk. Typ wat er speelt, of kies hieronder een startpunt.';
  messagesEl.appendChild(el);
}

function addMessage(role, text, { pending = false } = {}) {
  $('.welcome')?.remove();
  const el = document.createElement('div');
  el.className = `msg ${role}` + (pending ? ' pending' : '');
  el.textContent = text;
  if (role === 'assistant' && !pending) {
    const speak = document.createElement('button');
    speak.className = 'speak';
    speak.textContent = '🔊 Voorlezen';
    speak.addEventListener('click', () => speakText(text));
    el.appendChild(document.createElement('br'));
    el.appendChild(speak);
  }
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

async function sendMessage(text) {
  text = (text || '').trim();
  if (!text) return;
  inputEl.value = '';
  autosize();
  addMessage('user', text);
  const pendingEl = addMessage('assistant', 'Even denken…', { pending: true });
  $('#btn-send').disabled = true;

  try {
    const data = await api('/chat', { method: 'POST', body: { sessionId: state.sessionId, message: text } });
    state.sessionId = data.sessionId;
    localStorage.setItem('wm_sessionId', data.sessionId);
    pendingEl.remove();
    addMessage('assistant', data.reply);
    if (data.safety === 'acuut') $('#support-card').classList.remove('hidden');
    if (state.settings.tts) speakText(data.reply);
  } catch (err) {
    pendingEl.remove();
    if (err.data?.sessionId) {
      state.sessionId = err.data.sessionId;
      localStorage.setItem('wm_sessionId', err.data.sessionId);
    }
    addMessage('assistant', err.message);
    if (err.data?.safety === 'acuut') $('#support-card').classList.remove('hidden');
  } finally {
    $('#btn-send').disabled = false;
    inputEl.focus();
  }
}

$('#chatform').addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(inputEl.value);
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});

function autosize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
}
inputEl.addEventListener('input', autosize);

$('#chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) sendMessage(chip.dataset.msg);
});

$('#support-dismiss').addEventListener('click', () => $('#support-card').classList.add('hidden'));

$('#btn-close-session').addEventListener('click', async () => {
  if (!state.sessionId) return;
  $('#chat-hint').textContent = 'Gesprek wordt afgerond…';
  try {
    await api(`/sessions/${state.sessionId}/close`, { method: 'POST' });
    $('#chat-hint').textContent = 'Gesprek afgerond en samengevat. Een nieuw bericht start een nieuw gesprek.';
  } catch {
    $('#chat-hint').textContent = 'Afronden lukte niet helemaal; het gesprek is wel gesloten.';
  }
  state.sessionId = null;
  localStorage.removeItem('wm_sessionId');
});

// Nieuw gesprek starten: huidige leegmaken, oude op de achtergrond afronden (samenvatten).
$('#btn-new-session').addEventListener('click', () => {
  const old = state.sessionId;
  state.sessionId = null;
  localStorage.removeItem('wm_sessionId');
  messagesEl.innerHTML = '';
  $('#chat-hint').textContent = '';
  $('#support-card').classList.add('hidden');
  addWelcome();
  inputEl.focus();
  if (old) api(`/sessions/${old}/close`, { method: 'POST' }).catch(() => {});
});

// Herstel lopend gesprek bij laden
async function restoreSession() {
  if (!state.sessionId) return addWelcome();
  try {
    const data = await api(`/sessions/${state.sessionId}`);
    const todayStr = new Date().toISOString().slice(0, 10);
    // Nieuwe dag: rond het gesprek van gisteren af (voor de samenvatting) en start vers.
    if (data.session.closedAt || data.session.date !== todayStr) {
      if (!data.session.closedAt) {
        api(`/sessions/${state.sessionId}/close`, { method: 'POST' }).catch(() => {});
      }
      state.sessionId = null;
      localStorage.removeItem('wm_sessionId');
      return addWelcome();
    }
    data.messages.forEach((m) => addMessage(m.role, m.content));
    if (!data.messages.length) addWelcome();
  } catch {
    state.sessionId = null;
    localStorage.removeItem('wm_sessionId');
    addWelcome();
  }
}

// ---------- Spraak: STT ----------

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

function setupSpeech() {
  const statusEl = $('#speech-status');
  const supported = { stt: Boolean(SpeechRec), tts: 'speechSynthesis' in window };
  statusEl.textContent =
    `Spraakinvoer: ${supported.stt ? 'beschikbaar' : 'niet beschikbaar in deze browser'} · ` +
    `Voorlezen: ${supported.tts ? 'beschikbaar' : 'niet beschikbaar in deze browser'}`;

  if (!supported.stt || !state.settings.stt) {
    $('#btn-mic').style.display = supported.stt ? '' : 'none';
    if (!supported.stt) $('#chat-hint').textContent = 'Spraakinvoer is hier niet beschikbaar — typen werkt gewoon.';
    return;
  }
  $('#btn-mic').style.display = '';
}

$('#btn-mic').addEventListener('click', () => {
  if (!SpeechRec) return;
  if (state.recognizing) {
    recognition?.stop();
    return;
  }
  recognition = new SpeechRec();
  recognition.lang = 'nl-NL';
  recognition.interimResults = true;
  recognition.continuous = false;

  const base = inputEl.value ? inputEl.value + ' ' : '';
  recognition.onresult = (e) => {
    const transcript = [...e.results].map((r) => r[0].transcript).join('');
    inputEl.value = base + transcript;
    autosize();
  };
  recognition.onstart = () => {
    state.recognizing = true;
    $('#btn-mic').classList.add('recording');
    $('#chat-hint').textContent = 'Luistert… tik nogmaals op de microfoon om te stoppen.';
  };
  recognition.onend = () => {
    state.recognizing = false;
    $('#btn-mic').classList.remove('recording');
    $('#chat-hint').textContent = '';
    inputEl.focus();
  };
  recognition.onerror = () => {
    $('#chat-hint').textContent = 'Spraakinvoer lukte niet. Typen werkt gewoon.';
  };
  recognition.start();
});

// ---------- Spraak: TTS ----------

function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'nl-NL';
  utter.rate = 0.95;
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('nl'));
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}
if ('speechSynthesis' in window) speechSynthesis.getVoices();

// ---------- Slaap ----------

let sleepLogs = [];

// Vult het slaapformulier met de log van 'date', of maakt het leeg als er
// nog geen log voor die dag is (zodat je nooit per ongeluk een andere dag overschrijft).
function fillSleepForm(date) {
  const form = $('#sleepform');
  const log = sleepLogs.find((l) => l.date === date);
  form.bedtime.value = log?.bedtime || '';
  form.sleepHours.value = log?.sleepHours ?? '';
  form.wokeNight.checked = Boolean(log?.wokeNight);
  form.wakeTime.value = log?.wakeTime || '';
  form.note.value = log?.note || '';
}

async function loadSleep(showDate) {
  const { logs } = await api('/sleep');
  sleepLogs = logs;
  const form = $('#sleepform');
  const todayStr = new Date().toISOString().slice(0, 10);
  // Standaard op vandaag; velden passen bij de getoonde datum.
  form.date.value = showDate || todayStr;
  fillSleepForm(form.date.value);

  // Weekoverzicht: laatste 7 dagen
  const bars = $('#weekbars');
  bars.innerHTML = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const log = logs.find((l) => l.date === key);
    const hours = log?.sleepHours ?? 0;
    const el = document.createElement('div');
    el.className = 'weekbar';
    el.innerHTML =
      `<span class="val">${log?.sleepHours != null ? log.sleepHours : '–'}</span>` +
      `<div class="bar${log?.wokeNight ? ' broken' : ''}" style="height:${Math.min(100, (hours / 9) * 100)}%"></div>` +
      `<span>${d.toLocaleDateString('nl-NL', { weekday: 'short' })}</span>`;
    el.title = log?.wokeNight ? 'Midden in de nacht wakker geweest' : '';
    bars.appendChild(el);
  }
}

// Andere datum kiezen -> velden meteen op die dag zetten (of leegmaken).
$('#sleepform').addEventListener('change', (e) => {
  if (e.target.name === 'date') fillSleepForm(e.target.value);
});

$('#sleepform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  await api('/sleep', {
    method: 'POST',
    body: {
      date: f.date.value,
      bedtime: f.bedtime.value,
      sleepHours: f.sleepHours.value,
      wokeNight: f.wokeNight.checked,
      wakeTime: f.wakeTime.value,
      note: f.note.value
    }
  });
  loadSleep(f.date.value); // blijf op de zojuist opgeslagen dag
});

// ---------- Dagstatus ----------

function bindSliders() {
  $$('#dayform input[type="range"]').forEach((slider) => {
    const output = $(`#dayform .scale-row[data-field="${slider.name}"] output`);
    const update = () => (output.textContent = slider.value);
    slider.addEventListener('input', update);
    update();
  });
}

async function loadCheckins() {
  const { checkins } = await api('/checkins');
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCheckin = checkins.find((c) => c.date === todayStr);
  const form = $('#dayform');
  if (todayCheckin) {
    for (const k of ['energy', 'stress', 'mood', 'focus']) {
      if (todayCheckin[k] != null) form[k].value = todayCheckin[k];
    }
  }
  bindSliders();

  const list = $('#checkin-list');
  list.innerHTML = '';
  [...checkins].reverse().slice(0, 7).forEach((c) => {
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML =
      `<span class="title">${fmtDate(c.date)}</span>` +
      `<div class="meta">Energie ${c.energy ?? '–'} · Stress ${c.stress ?? '–'} · Stemming ${c.mood ?? '–'} · Focus ${c.focus ?? '–'}</div>`;
    list.appendChild(el);
  });
  if (!checkins.length) list.innerHTML = '<p class="hint">Nog geen dagstatussen opgeslagen.</p>';
}

$('#dayform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  await api('/checkins', {
    method: 'POST',
    body: { energy: f.energy.value, stress: f.stress.value, mood: f.mood.value, focus: f.focus.value }
  });
  loadCheckins();
});

// ---------- Ochtendbriefing ----------

async function loadBriefing() {
  const body = $('#briefing-body');
  body.innerHTML = '<p class="hint">Briefing wordt geladen…</p>';
  try {
    const { briefing } = await api('/briefing/today');
    renderBriefing(briefing);
  } catch {
    body.innerHTML = '<p class="hint">Briefing kon niet geladen worden.</p>';
  }
  // Koppel-hint alleen tonen als agenda niet gekoppeld is.
  try {
    const status = await api('/google/status');
    $('#briefing-connect-hint').classList.toggle('hidden', status.connected);
  } catch {}
}

function renderBriefing(briefing) {
  const body = $('#briefing-body');
  body.innerHTML = '';
  const pre = document.createElement('div');
  pre.className = 'briefing-text';
  pre.textContent = briefing.text;
  body.appendChild(pre);
  const gen = new Date(briefing.generatedAt);
  $('#briefing-meta').textContent = `Bijgewerkt ${gen.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
}

$('#btn-briefing-refresh').addEventListener('click', async () => {
  $('#briefing-body').innerHTML = '<p class="hint">Verversen…</p>';
  try {
    const { briefing } = await api('/briefing/generate', { method: 'POST' });
    renderBriefing(briefing);
  } catch {
    $('#briefing-body').innerHTML = '<p class="hint">Verversen lukte niet.</p>';
  }
});

// ---------- Agenda-koppeling ----------

async function loadAgenda() {
  const statusEl = $('#agenda-status');
  const actions = $('#agenda-actions');
  const calBox = $('#agenda-calendars');
  actions.innerHTML = '';
  calBox.innerHTML = '';
  let status;
  try {
    status = await api('/google/status');
  } catch {
    statusEl.textContent = 'Status onbekend.';
    return;
  }

  if (!status.configured) {
    statusEl.textContent = 'Google-koppeling is nog niet ingesteld (GOOGLE_CLIENT_ID/SECRET in .env). Zie de README.';
    return;
  }

  if (status.connected) {
    statusEl.textContent = `Gekoppeld${status.email ? ` (${status.email})` : ''}.`;
    actions.append(
      linkBtn('Ontkoppelen', async () => {
        await api('/google/disconnect', { method: 'POST' });
        loadAgenda();
      })
    );
    // Agenda's aan/uit
    (status.calendars || []).forEach((c) => {
      const label = document.createElement('label');
      label.className = 'checkline';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = c.selected;
      cb.dataset.id = c.id;
      label.append(cb, document.createTextNode(' ' + (c.summary || c.id)));
      calBox.appendChild(label);
    });
    if ((status.calendars || []).length) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn';
      saveBtn.textContent = 'Agenda-keuze opslaan';
      saveBtn.addEventListener('click', async () => {
        const selected = [...calBox.querySelectorAll('input:checked')].map((cb) => cb.dataset.id);
        await api('/google/calendars', { method: 'PUT', body: { selected } });
        saveBtn.textContent = 'Opgeslagen ✓';
        setTimeout(() => (saveBtn.textContent = 'Agenda-keuze opslaan'), 1500);
      });
      calBox.appendChild(saveBtn);
    }
  } else {
    statusEl.textContent = 'Niet gekoppeld.';
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Agenda koppelen';
    btn.addEventListener('click', async () => {
      try {
        const { url } = await api('/google/connect');
        window.location.href = url;
      } catch (err) {
        statusEl.textContent = err.message || 'Koppelen lukte niet.';
      }
    });
    actions.appendChild(btn);
  }
}

// ---------- Pushmeldingen ----------

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function loadPushStatus() {
  const el = $('#push-status');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    el.textContent = 'Deze browser ondersteunt geen pushmeldingen. Installeer de app op je telefoon.';
    $('#btn-push-enable').style.display = 'none';
    return;
  }
  const perm = Notification.permission;
  el.textContent =
    perm === 'granted' ? 'Meldingen staan aan op dit apparaat.' :
    perm === 'denied' ? 'Meldingen zijn geblokkeerd in de browserinstellingen.' :
    'Meldingen staan uit.';
}

async function enablePush() {
  const el = $('#push-status');
  try {
    const reg = await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      el.textContent = 'Toestemming niet gegeven.';
      return;
    }
    const { publicKey } = await api('/push/vapid');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    await api('/push/subscribe', { method: 'POST', body: { subscription: sub } });
    el.textContent = 'Meldingen staan aan op dit apparaat. 👍';
  } catch (err) {
    el.textContent = 'Meldingen aanzetten lukte niet. Werkt het beste als de app op je startscherm staat.';
  }
}

$('#btn-push-enable').addEventListener('click', enablePush);
$('#btn-push-test').addEventListener('click', async () => {
  try {
    await api('/push/test', { method: 'POST' });
    $('#push-status').textContent = 'Testmelding verstuurd — check je telefoon.';
  } catch (err) {
    $('#push-status').textContent = err.message || 'Testmelding lukte niet.';
  }
});

// ---------- Drang (module "Porno als coping") ----------

const OUTCOME_LABEL = { gezakt: 'gezakt', gelijk: 'gelijk gebleven', hoger: 'hoger geworden' };

// Directe hulp: naar de chat en de flow starten.
$('#btn-coping-help').addEventListener('click', () => {
  showView('chat');
  sendMessage('Porno-drang hulp. Ik voel nu drang.');
});

function fillSelect(sel, options) {
  if (sel.children.length) return;
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = typeof opt === 'string' ? opt : opt.id;
    o.textContent = typeof opt === 'string' ? opt : opt.label;
    sel.appendChild(o);
  }
}

async function loadCoping() {
  const [{ episodes, flows }, { patterns }] = await Promise.all([
    api('/coping/episodes'),
    api('/coping/patterns')
  ]);

  fillSelect($('#coping-emotion'), flows.emotions);
  fillSelect($('#coping-trigger'), flows.triggers);
  fillSelect($('#coping-intervention'), flows.interventions);

  // Patroonoverzicht
  const box = $('#coping-patterns');
  if (!patterns.total) {
    box.innerHTML = '<p class="hint">Nog geen episodes gelogd. Eén log per episode is genoeg om patronen te zien.</p>';
  } else {
    const line = (label, items) =>
      items.length ? `<div class="meta"><strong>${label}:</strong> ${items.map((i) => `${escapeHtml(i.key)} (${i.count}×)`).join(' · ')}</div>` : '';
    box.innerHTML =
      `<div class="meta"><strong>Episodes:</strong> ${patterns.total} · <strong>Terugval:</strong> ${patterns.relapses}×</div>` +
      line('Triggers', patterns.topTriggers) +
      line('Emoties', patterns.topEmotions) +
      line('Momenten', patterns.topMoments) +
      (patterns.helpfulInterventions.length
        ? `<div class="meta"><strong>Wat helpt:</strong> ${patterns.helpfulInterventions
            .map((h) => `${escapeHtml(h.intervention)} (${h.gezaktPct}% gezakt)`)
            .join(' · ')}</div>`
        : '');
  }

  // Laatste episodes
  const list = $('#coping-list');
  list.innerHTML = '';
  const interventionLabel = (idVal) => flows.interventions.find((i) => i.id === idVal)?.label || idVal;
  [...episodes].reverse().slice(0, 10).forEach((e) => {
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML =
      `<span class="title">${fmtDate(e.date)}</span>` +
      (e.relapse ? '<span class="badge">terugval</span>' : '') +
      `<div class="meta">Drang ${e.urgeBefore ?? '–'} → ${e.urgeAfter ?? '–'} · ${escapeHtml(e.emotion)} · trigger: ${escapeHtml(e.trigger)}</div>` +
      `<div class="meta">${escapeHtml(interventionLabel(e.intervention))}${e.outcome ? ` · ${OUTCOME_LABEL[e.outcome]}` : ''}</div>` +
      (e.note ? `<div class="meta">${escapeHtml(e.note)}</div>` : '');
    list.appendChild(el);
  });
  if (!episodes.length) list.innerHTML = '<p class="hint">Nog geen episodes.</p>';
}

$('#copingform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  await api('/coping/episodes', {
    method: 'POST',
    body: {
      urgeBefore: f.urgeBefore.value,
      urgeAfter: f.urgeAfter.value,
      emotion: f.emotion.value,
      trigger: f.trigger.value,
      intervention: f.intervention.value,
      outcome: f.outcome.value || null,
      relapse: f.relapse.checked,
      note: f.note.value
    }
  });
  f.reset();
  loadCoping();
});

// ---------- Doelen ----------

async function loadGoals() {
  const { goals } = await api('/goals');
  const list = $('#goal-list');
  list.innerHTML = '';
  const active = goals.filter((g) => g.status === 'actief');
  const rest = goals.filter((g) => g.status !== 'actief');

  for (const goal of [...active, ...rest]) {
    const el = document.createElement('div');
    el.className = 'list-item';
    const status = goal.status === 'actief' ? '' : `<span class="badge">${goal.status}</span>`;
    el.innerHTML =
      `<span class="title">${escapeHtml(goal.title)}</span>${status}` +
      `<div class="meta">${goal.category} · sinds ${fmtDate(goal.startDate)}` +
      (goal.lastCheckin ? ` · laatste check-in ${fmtDate(goal.lastCheckin)}` : '') +
      `</div>` +
      (goal.notes ? `<div class="meta">${escapeHtml(goal.notes).replaceAll('\n', '<br>')}</div>` : '');

    const actions = document.createElement('div');
    actions.className = 'actions';
    if (goal.status === 'actief') {
      actions.append(
        linkBtn('Check-in', async () => {
          const note = prompt('Korte notitie bij deze check-in (mag leeg):') ?? '';
          await api(`/goals/${goal.id}`, { method: 'PATCH', body: { checkin: note || true } });
          loadGoals();
        }),
        linkBtn('Afronden', async () => {
          await api(`/goals/${goal.id}`, { method: 'PATCH', body: { status: 'afgerond' } });
          loadGoals();
        })
      );
    } else {
      actions.append(
        linkBtn('Heropenen', async () => {
          await api(`/goals/${goal.id}`, { method: 'PATCH', body: { status: 'actief' } });
          loadGoals();
        })
      );
    }
    actions.append(
      linkBtn('Verwijderen', async () => {
        if (!confirm('Dit doel verwijderen?')) return;
        await api(`/goals/${goal.id}`, { method: 'DELETE' });
        loadGoals();
      })
    );
    el.appendChild(actions);
    list.appendChild(el);
  }
  if (!goals.length) list.innerHTML = '<p class="hint">Nog geen doelen. Houd het klein: één doel is genoeg om te starten.</p>';
}

function linkBtn(label, onClick) {
  const b = document.createElement('button');
  b.className = 'linkbtn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

$('#goalform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  await api('/goals', { method: 'POST', body: { title: f.title.value, category: f.category.value } });
  f.reset();
  loadGoals();
});

// ---------- Geschiedenis ----------

async function loadSessions() {
  $('#session-detail').classList.add('hidden');
  $('#session-list').classList.remove('hidden');
  const { sessions } = await api('/sessions');
  const list = $('#session-list');
  list.innerHTML = '';
  sessions
    .filter((s) => s.messageCount > 0)
    .forEach((s) => {
      const el = document.createElement('div');
      el.className = 'list-item clickable';
      el.innerHTML =
        `<span class="title">${fmtDate(s.date)}</span>` +
        `<span class="badge">${s.messageCount} berichten</span>` +
        (s.summary ? `<div class="meta">${escapeHtml(s.summary)}</div>` : '<div class="meta">Nog geen samenvatting.</div>');
      el.addEventListener('click', () => openSession(s));
      list.appendChild(el);
    });
  if (!list.children.length) list.innerHTML = '<p class="hint">Nog geen gesprekken gevoerd.</p>';
}

async function openSession(s) {
  const { messages } = await api(`/sessions/${s.id}`);
  $('#session-list').classList.add('hidden');
  const detail = $('#session-detail');
  detail.classList.remove('hidden');
  $('#session-detail-title').textContent = `Gesprek van ${fmtDate(s.date)}`;
  const box = $('#session-detail-messages');
  box.innerHTML = '';
  messages.forEach((m) => {
    const el = document.createElement('div');
    el.className = `msg ${m.role}`;
    el.textContent = m.content;
    box.appendChild(el);
  });
}

$('#btn-back-history').addEventListener('click', loadSessions);

// ---------- Instellingen ----------

async function loadSettings() {
  const { settings } = await api('/settings');
  state.settings = settings;
  const f = $('#settingsform');
  f.name.value = settings.name;
  f.tts.checked = settings.tts;
  f.stt.checked = settings.stt;
  f.darkMode.value = settings.darkMode || 'auto';
  f.preferences.value = settings.preferences || '';
  if (f.briefingTime) f.briefingTime.value = settings.briefingTime || '08:00';
  if (f.briefingEnabled) f.briefingEnabled.checked = settings.briefingEnabled !== false;
  applyTheme();
  setGreeting();
  setupSpeech();
}

$('#settingsform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const { settings } = await api('/settings', {
    method: 'PUT',
    body: {
      name: f.name.value,
      tts: f.tts.checked,
      stt: f.stt.checked,
      darkMode: f.darkMode.value,
      preferences: f.preferences.value,
      briefingTime: f.briefingTime.value,
      briefingEnabled: f.briefingEnabled.checked
    }
  });
  state.settings = settings;
  applyTheme();
  setGreeting();
  setupSpeech();
  showView('briefing');
});

async function loadSources() {
  const { sources } = await api('/sources');
  const ul = $('#source-list');
  ul.innerHTML = '';
  sources.forEach((s) => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a> <span class="note">— ${escapeHtml(s.note)}</span>`;
    ul.appendChild(li);
  });
}

// ---------- Util ----------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Init ----------

// Service worker registreren (nodig voor PWA + pushmeldingen).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}

(async function init() {
  document.documentElement.dataset.theme = 'auto';
  await loadSettings();
  await restoreSession();
  autosize();

  const params = new URLSearchParams(location.search);

  // Terugkomst van Google-koppeling.
  const agenda = params.get('agenda');
  if (agenda === 'gekoppeld') {
    $$('.tab').forEach((t) => t.classList.remove('active'));
    $$('.view').forEach((v) => v.classList.add('hidden'));
    $('#view-settings').classList.remove('hidden');
    loadSources();
    loadAgenda();
    loadPushStatus();
  }

  // Diep-link naar een view (bv. vanuit de pushmelding: ?view=briefing).
  const view = params.get('view');
  if (view && $(`#view-${view}`)) showView(view);

  // Query params opruimen uit de adresbalk.
  if (agenda || view) history.replaceState(null, '', location.pathname);
})();
