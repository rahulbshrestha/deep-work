function pad(n) { return String(n).padStart(2, '0'); }
function fmt(s) { s = Math.max(0, s); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }
function fmtBadge(s) { s = Math.max(0, s); const m = Math.floor(s / 60); const sc = s % 60; return s < 600 ? `${pad(m)}:${pad(sc)}` : `${m}m`; }

function safeSendMessage(message, callback) {
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        if (callback) callback(null);
        return;
      }
      if (callback) callback(response);
    });
  } catch (error) {
    console.warn('Popup message failed:', error);
    if (callback) callback(null);
  }
}

const countdown = document.getElementById('countdown');
const badge = document.getElementById('badge');
const dot = document.getElementById('dot');
const statusTxt = document.getElementById('statusTxt');
const progFill = document.getElementById('progFill');
const hintBox = document.getElementById('hintBox');
const hintText = document.getElementById('hintText');
const btnReset = document.getElementById('btnReset');
const tomatoImg = document.getElementById('tomatoImg');
const goalProgressBar = document.getElementById('goalProgressBar');

let DURATION = 3600;
let DAILY_GOAL = 4;

function setTomatoIcon(state) {
  const prefix = state === 'idle' ? '' : `${state}_`;
  tomatoImg.src = `icons/${prefix}48.png`;
}

function applyState(elapsed, running, timerState, history) {
  const safeHistory = history && typeof history === 'object' ? history : {};
  const remaining = Math.max(0, DURATION - elapsed);
  const pct = DURATION > 0 ? Math.min((elapsed / DURATION) * 100, 100) : 0;

  countdown.textContent = fmt(remaining);
  progFill.style.width = `${pct}%`;

  const today = new Date();
  const y = today.getFullYear();
  const mo = (`0${today.getMonth() + 1}`).slice(-2);
  const da = (`0${today.getDate()}`).slice(-2);
  const key = `${y}-${mo}-${da}`;
  const todayCount = safeHistory[key] || 0;
  const progressRatio = Math.min(todayCount / Math.max(DAILY_GOAL, 1), 1);
  document.getElementById('goalText').textContent = `${todayCount} / ${DAILY_GOAL}`;
  if (goalProgressBar) {
    goalProgressBar.style.width = `${Math.round(progressRatio * 100)}%`;
    goalProgressBar.style.background = progressRatio >= 1 ? '#27ae60' : '#c0392b';
  }

  countdown.className = 'countdown';
  dot.className = 'status-dot';
  badge.className = 'tomato-badge';
  progFill.className = 'prog-fill';
  hintBox.className = 'hint';

  if (timerState === 'running') {
    setTomatoIcon('running');
    badge.textContent = fmtBadge(remaining);
    countdown.classList.add('running');
    dot.classList.add('running');
    statusTxt.textContent = 'Session running…';
    hintText.textContent = 'Click the toolbar icon to pause';
    hintBox.classList.add('running');
  } else if (timerState === 'paused') {
    setTomatoIcon('paused');
    badge.textContent = '⏸';
    badge.classList.add('paused');
    countdown.classList.add('paused');
    dot.classList.add('paused');
    progFill.classList.add('paused');
    statusTxt.textContent = 'Paused';
    hintText.textContent = 'Click the toolbar icon to resume';
    hintBox.classList.add('paused');
  } else if (timerState === 'complete') {
    setTomatoIcon('complete');
    badge.textContent = '✓';
    badge.classList.add('complete');
    countdown.classList.add('complete');
    countdown.textContent = '00:00';
    dot.classList.add('complete');
    progFill.classList.add('complete');
    statusTxt.textContent = 'Session complete! 🎉';
    hintText.textContent = 'Click the toolbar icon to start a new session';
    hintBox.classList.add('complete');
  } else {
    setTomatoIcon('idle');
    badge.textContent = `${Math.round(DURATION / 60)}m`;
    statusTxt.textContent = 'Ready';
    hintText.textContent = 'Click the toolbar icon to start';
  }

  btnReset.disabled = elapsed === 0 && !running;
}

function syncStateFromBackground() {
  safeSendMessage({ type: 'GET' }, (res) => {
    if (!res) return;
    DURATION = res.DURATION || DURATION;
    safeSendMessage({ type: 'GET_SETTINGS' }, (sRes) => {
      DAILY_GOAL = sRes?.settings?.dailyGoal || 4;
      const timer = res.timer || {};
      const timerState = timer.running ? 'running' : timer.elapsed > 0 ? 'paused' : 'idle';
      applyState(timer.elapsed || 0, Boolean(timer.running), timerState, res.history);
    });
  });
}

// Live ticks & state changes from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TICK') {
    safeSendMessage({ type: 'GET' }, (res) => {
      if (!res) return;
      applyState(msg.elapsed, true, 'running', res.history);
    });
  }
  if (msg.type === 'STATE_CHANGE') {
    syncStateFromBackground();
  }
  if (msg.type === 'COMPLETE') {
    safeSendMessage({ type: 'GET' }, (res) => {
      if (!res) return;
      applyState(DURATION, false, 'complete', res.history);
    });
  }
});

btnReset.onclick = () => {
  safeSendMessage({ type: 'RESET' }, () => {
    syncStateFromBackground();
  });
};

document.getElementById('btnHistory').onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
};

document.getElementById('btnSettings').onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
};

// Init
syncStateFromBackground();
