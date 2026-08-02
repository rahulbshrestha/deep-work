// Focus Timer — Background Service Worker

const DEFAULT_SETTINGS = { duration: 60, notifications: true, dailyGoal: 4 };
const DEFAULT_TIMER = { running: false, startTime: null, elapsed: 0 };

function pad(n) { return String(n).padStart(2, '0'); }
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function normalizeSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const duration = Number(source.duration);
  const dailyGoal = Number(source.dailyGoal);

  return {
    duration: Number.isFinite(duration) && duration > 0 ? Math.max(1, Math.floor(duration)) : DEFAULT_SETTINGS.duration,
    dailyGoal: Number.isFinite(dailyGoal) && dailyGoal > 0 ? Math.max(1, Math.floor(dailyGoal)) : DEFAULT_SETTINGS.dailyGoal,
    notifications: source.notifications !== false,
    darkMode: Boolean(source.darkMode)
  };
}

function normalizeTimer(value) {
  const source = value && typeof value === 'object' ? value : {};
  const elapsed = Number(source.elapsed);
  return {
    running: Boolean(source.running),
    startTime: source.startTime ? Number(source.startTime) : null,
    elapsed: Number.isFinite(elapsed) && elapsed >= 0 ? Math.floor(elapsed) : DEFAULT_TIMER.elapsed
  };
}

function normalizeHistory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const history = {};
  Object.entries(value).forEach(([key, count]) => {
    const parsed = Number(count);
    if (typeof key === 'string' && key && Number.isFinite(parsed) && parsed >= 0) {
      history[key] = Math.floor(parsed);
    }
  });
  return history;
}

function isStoragePayloadPresent(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value).length > 0;
  }
  return true;
}

function mergeStoragePayloads(primaryData, fallbackData) {
  const merged = {};
  const keys = new Set([
    ...Object.keys(primaryData || {}),
    ...Object.keys(fallbackData || {})
  ]);

  keys.forEach((key) => {
    const primaryValue = primaryData?.[key];
    if (isStoragePayloadPresent(primaryValue)) {
      merged[key] = primaryValue;
      return;
    }

    if (fallbackData && Object.prototype.hasOwnProperty.call(fallbackData, key)) {
      merged[key] = fallbackData[key];
    }
  });

  return merged;
}

function safeGetStorage(keys, callback, area = 'sync') {
  try {
    const primaryArea = area === 'local' ? chrome.storage.local : chrome.storage.sync;
    const fallbackArea = chrome.storage.local;

    primaryArea.get(keys, (data) => {
      if (chrome.runtime.lastError) {
        console.warn('Storage read failed:', chrome.runtime.lastError.message);
        fallbackArea.get(keys, (fallbackData) => callback(fallbackData || {}));
        return;
      }

      fallbackArea.get(keys, (fallbackData) => {
        if (chrome.runtime.lastError) {
          callback(data || {});
          return;
        }
        callback(mergeStoragePayloads(data || {}, fallbackData || {}));
      });
    });
  } catch (error) {
    console.warn('Storage read threw:', error);
    chrome.storage.local.get(keys, (fallbackData) => callback(fallbackData || {}));
  }
}

function safeSetStorage(area, data, callback) {
  try {
    const primaryArea = area === 'local' ? chrome.storage.local : chrome.storage.sync;
    const fallbackArea = chrome.storage.local;

    primaryArea.set(data, () => {
      if (chrome.runtime.lastError) {
        console.warn('Storage write failed:', chrome.runtime.lastError.message);
        fallbackArea.set(data, () => {
          if (callback) callback(false);
        });
        return;
      }

      if (area === 'sync') {
        fallbackArea.set(data, () => {
          if (callback) callback(true);
        });
      } else if (callback) {
        callback(true);
      }
    });
  } catch (error) {
    console.warn('Storage write threw:', error);
    chrome.storage.local.set(data, () => {
      if (callback) callback(false);
    });
  }
}

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
    console.warn('Runtime message failed:', error);
    if (callback) callback(null);
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────
function loadSettings(cb) {
  safeGetStorage('settings', (data) => cb(normalizeSettings(data.settings)), 'sync');
}

function getDuration(cb) {
  loadSettings((settings) => cb(settings.duration * 60));
}

// ── Icon states ───────────────────────────────────────────────────────────────
function setIcon(state) {
  try {
    const prefix = state === 'idle' ? '' : `${state}_`;
    chrome.action.setIcon({
      path: {
        '16': `icons/${prefix}16.png`,
        '32': `icons/${prefix}32.png`,
        '48': `icons/${prefix}48.png`,
        '128': `icons/${prefix}128.png`
      }
    });
  } catch (error) {
    console.warn('Unable to update extension icon:', error);
  }
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function setBadge(state, remaining) {
  try {
    const colors = { running: '#c0392b', paused: '#e67e22', complete: '#27ae60', idle: '#888888' };
    chrome.action.setBadgeBackgroundColor({ color: colors[state] || '#888' });

    if (state === 'idle') {
      chrome.action.setBadgeText({ text: '' });
      chrome.action.setTitle({ title: 'Focus Timer — Click to start' });
    } else if (state === 'paused') {
      chrome.action.setBadgeText({ text: '⏸' });
      chrome.action.setTitle({ title: 'Focus Timer — Paused. Click to resume.' });
    } else if (state === 'complete') {
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setTitle({ title: 'Focus Timer — Session complete! Click to start new.' });
    } else {
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      const text = remaining < 600 ? `${pad(m)}:${pad(s)}` : `${m}m`;
      chrome.action.setBadgeText({ text });
      chrome.action.setTitle({ title: `Focus Timer — ${text} remaining · Click to pause` });
    }
  } catch (error) {
    console.warn('Unable to update extension badge:', error);
  }
}

// ── Storage ───────────────────────────────────────────────────────────────────
function loadTimer(cb) {
  safeGetStorage(['timer'], (timerData) => {
    safeGetStorage(['history'], (historyData) => {
      cb(normalizeTimer(timerData.timer), normalizeHistory(historyData.history));
    }, 'sync');
  }, 'local');
}

function saveTimer(timer, cb) {
  safeSetStorage('local', { timer: normalizeTimer(timer) }, cb);
}

function getCurrentElapsed(timer) {
  if (!timer.running || !timer.startTime) return timer.elapsed;
  return timer.elapsed + Math.floor((Date.now() - timer.startTime) / 1000);
}

function setIdleState(cb) {
  saveTimer({ running: false, startTime: null, elapsed: 0 }, () => {
    setIcon('idle');
    setBadge('idle', 0);
    if (cb) cb();
  });
}

// ── Ticking ───────────────────────────────────────────────────────────────────
let tickInterval = null;

function startTicking() {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    loadTimer((timer) => {
      if (!timer.running) {
        stopTicking();
        return;
      }
      getDuration((DURATION) => {
        const elapsed = getCurrentElapsed(timer);
        const remaining = Math.max(0, DURATION - elapsed);
        setBadge('running', remaining);
        safeSendMessage({ type: 'TICK', elapsed, remaining });
        if (remaining <= 0) {
          stopTicking();
          completeSession();
        }
      });
    });
  }, 1000);
}

function stopTicking() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

// ── Session complete ──────────────────────────────────────────────────────────
function completeSession() {
  loadTimer((timer) => {
    if (!timer.running) return;

    saveTimer({ running: false, startTime: null, elapsed: 0 }, () => {
      const key = todayKey();
      safeGetStorage(['history', 'settings'], (data) => {
        const history = normalizeHistory(data.history);
        history[key] = (history[key] || 0) + 1;
        const settings = normalizeSettings(data.settings);

        safeSetStorage('sync', { history }, () => {
          setIcon('complete');
          setBadge('complete', 0);

          if (settings.notifications !== false) {
            try {
              chrome.notifications.create('focusComplete', {
                type: 'basic',
                iconUrl: 'icons/complete_128.png',
                title: '🍅 Pomodoro complete!',
                message: `Great work! Session logged for ${key}. Click to start a new one.`,
                requireInteraction: false
              });
            } catch (error) {
              console.warn('Notification failed:', error);
            }
          }

          safeSendMessage({ type: 'COMPLETE' });
        });
      }, 'sync');
      chrome.alarms.clear('sessionEnd');
    });
  });
}

// ── Keep-alive alarm ──────────────────────────────────────────────────────────
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    loadTimer((timer) => {
      if (!timer.running) return;
      getDuration((DURATION) => {
        const elapsed = getCurrentElapsed(timer);
        const remaining = Math.max(0, DURATION - elapsed);
        setBadge('running', remaining);
        if (remaining <= 0) completeSession();
        else startTicking();
      });
    });
  }
  if (alarm.name === 'sessionEnd') completeSession();
});

// ── Context menu ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });

  chrome.contextMenus.create({ id: 'history', title: '📊 Pomodoro History', contexts: ['action'] });
  chrome.contextMenus.create({ id: 'settings', title: '⚙️ Settings', contexts: ['action'] });
  chrome.contextMenus.create({ id: 'sep', type: 'separator', contexts: ['action'] });
  chrome.contextMenus.create({ id: 'reset', title: '↺ Reset Timer', contexts: ['action'] });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'history') {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
  }
  if (info.menuItemId === 'settings') {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  }
  if (info.menuItemId === 'reset') {
    stopTicking();
    chrome.alarms.clear('sessionEnd');
    saveTimer({ running: false, startTime: null, elapsed: 0 }, () => {
      setIdleState(() => {
        safeSendMessage({ type: 'STATE_CHANGE', timerState: 'idle' });
      });
    });
  }
});

function handleToggleTimer() {
  loadTimer((timer) => {
    getDuration((DURATION) => {
      if (timer.running) {
        const elapsed = getCurrentElapsed(timer);
        stopTicking();
        chrome.alarms.clear('sessionEnd');
        saveTimer({ running: false, startTime: null, elapsed }, () => {
          setIcon('paused');
          setBadge('paused', 0);
          safeSendMessage({ type: 'STATE_CHANGE', timerState: 'paused' });
        });
      } else {
        const elapsed = timer.elapsed;
        const remaining = Math.max(0, DURATION - elapsed);
        if (remaining <= 0) {
          completeSession();
          return;
        }
        saveTimer({ running: true, startTime: Date.now(), elapsed }, () => {
          setIcon('running');
          setBadge('running', remaining);
          startTicking();
          chrome.alarms.create('sessionEnd', { delayInMinutes: remaining / 60 });
          safeSendMessage({ type: 'STATE_CHANGE', timerState: 'running' });
        });
      }
    });
  });
}

// ── Icon click → toggle ───────────────────────────────────────────────────────
chrome.action.onClicked.addListener(() => {
  handleToggleTimer();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-timer') {
    handleToggleTimer();
  }
  if (command === 'reset-timer') {
    stopTicking();
    chrome.alarms.clear('sessionEnd');
    saveTimer({ running: false, startTime: null, elapsed: 0 }, () => {
      setIdleState(() => {
        safeSendMessage({ type: 'STATE_CHANGE', timerState: 'idle' });
      });
    });
  }
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'GET') {
    loadTimer((timer, history) => {
      getDuration((DURATION) => {
        let elapsed = timer.elapsed;
        if (timer.running && timer.startTime) {
          elapsed = getCurrentElapsed(timer);
        }
        reply({ timer: { ...timer, elapsed }, history, DURATION });
      });
    });
    return true;
  }

  if (msg.type === 'RESET') {
    stopTicking();
    chrome.alarms.clear('sessionEnd');
    saveTimer({ running: false, startTime: null, elapsed: 0 }, () => {
      setIdleState(() => {
        reply({ ok: true });
      });
    });
    return true;
  }

  if (msg.type === 'GET_SETTINGS') {
    loadSettings((settings) => reply({ settings }));
    return true;
  }

  if (msg.type === 'SAVE_SETTINGS') {
    stopTicking();
    chrome.alarms.clear('sessionEnd');
    const settings = normalizeSettings(msg.settings);
    safeSetStorage('sync', { settings }, () => {
      saveTimer({ running: false, startTime: null, elapsed: 0 }, () => {
        setIdleState(() => {
          safeSendMessage({ type: 'STATE_CHANGE', timerState: 'idle' });
          reply({ ok: true });
        });
      });
    });
    return true;
  }
});
