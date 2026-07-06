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
  if (name === 'sleep') loadSleep();
  if (name === 'day') loadCheckins();
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

// Herstel lopend gesprek bij laden
async function restoreSession() {
  if (!state.sessionId) return addWelcome();
  try {
    const data = await api(`/sessions/${state.sessionId}`);
    if (data.session.closedAt) {
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

async function loadSleep() {
  const { logs } = await api('/sleep');
  const form = $('#sleepform');
  const todayStr = new Date().toISOString().slice(0, 10);
  form.date.value = form.date.value || todayStr;

  const existing = logs.find((l) => l.date === form.date.value);
  if (existing) {
    form.bedtime.value = existing.bedtime || '';
    form.sleepHours.value = existing.sleepHours ?? '';
    form.wokeNight.checked = existing.wokeNight;
    form.wakeTime.value = existing.wakeTime || '';
    form.note.value = existing.note || '';
  }

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
  loadSleep();
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
      preferences: f.preferences.value
    }
  });
  state.settings = settings;
  applyTheme();
  setGreeting();
  setupSpeech();
  showView('chat');
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

(async function init() {
  document.documentElement.dataset.theme = 'auto';
  await loadSettings();
  await restoreSession();
  autosize();
})();
