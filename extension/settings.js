let pendingDuration = 60;
let pendingGoal = 4;
let pendingNotif = true;

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
    console.warn('Settings message failed:', error);
    if (callback) callback(null);
  }
}

function safeStorageSet(data, callback) {
  try {
    chrome.storage.sync.set(data, () => {
      if (chrome.runtime.lastError) {
        console.warn('Settings sync write failed:', chrome.runtime.lastError.message);
        chrome.storage.local.set(data, () => {
          if (callback) callback(false);
        });
        return;
      }

      chrome.storage.local.set(data, () => {
        if (callback) callback(true);
      });
    });
  } catch (error) {
    console.warn('Settings storage write threw:', error);
    chrome.storage.local.set(data, () => {
      if (callback) callback(false);
    });
  }
}

function showFeedback(message, isError = false) {
  const fb = document.getElementById('feedback');
  fb.textContent = message;
  fb.style.color = isError ? '#c0392b' : '#27ae60';
  setTimeout(() => { fb.textContent = ''; }, 4000);
}

function normalizeSettingsObject(value) {
  const source = value && typeof value === 'object' ? value : {};
  const duration = Number(source.duration);
  const dailyGoal = Number(source.dailyGoal);
  return {
    duration: Number.isFinite(duration) && duration > 0 ? Math.max(1, Math.floor(duration)) : 60,
    dailyGoal: Number.isFinite(dailyGoal) && dailyGoal > 0 ? Math.max(1, Math.floor(dailyGoal)) : 4,
    notifications: source.notifications !== false
  };
}

function buildBackupPayload() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: normalizeSettingsObject({ duration: pendingDuration, dailyGoal: pendingGoal, notifications: pendingNotif }),
    history: {}
  };
}

function saveBackupToGoogle(callback) {
  const payload = buildBackupPayload();
  chrome.storage.sync.get(['history', 'settings'], (res) => {
    payload.history = res.history && typeof res.history === 'object' ? res.history : {};
    payload.settings = normalizeSettingsObject(res.settings || payload.settings);

    chrome.storage.sync.set({ cloudBackup: payload }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Google backup write failed:', chrome.runtime.lastError.message);
        if (callback) callback(false);
        return;
      }
      chrome.storage.local.set({ cloudBackup: payload }, () => {
        if (callback) callback(true);
      });
    });
  });
}

function loadBackupFromGoogle(callback) {
  chrome.storage.sync.get(['cloudBackup'], (res) => {
    const payload = res.cloudBackup;
    if (!payload || typeof payload !== 'object') {
      if (callback) callback(null);
      return;
    }
    if (callback) callback(payload);
  });
}

function applyBackupPayload(payload, callback) {
  if (!payload || typeof payload !== 'object') {
    if (callback) callback(false);
    return;
  }

  const history = payload.history && typeof payload.history === 'object' ? payload.history : {};
  const settings = normalizeSettingsObject(payload.settings);
  const merged = {
    history,
    settings,
    cloudBackup: payload
  };

  safeStorageSet(merged, (ok) => {
    if (!ok) {
      if (callback) callback(false);
      return;
    }
    if (callback) callback(true);
  });
}

function downloadBackupPayload(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pomograph-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function loadSettings() {
  safeSendMessage({ type: 'GET_SETTINGS' }, (res) => {
    const s = res?.settings || {};
    pendingDuration = Number.isFinite(Number(s.duration)) && Number(s.duration) > 0 ? Number(s.duration) : 60;
    pendingGoal = Number.isFinite(Number(s.dailyGoal)) && Number(s.dailyGoal) > 0 ? Number(s.dailyGoal) : 4;
    pendingNotif = s.notifications !== false;
    document.getElementById('durVal').textContent = pendingDuration;
    document.getElementById('goalVal').textContent = pendingGoal;
    document.getElementById('notifCheck').checked = pendingNotif;
  });
}

document.getElementById('durMinus').onclick = () => {
  pendingDuration = Math.max(5, pendingDuration - 5);
  document.getElementById('durVal').textContent = pendingDuration;
};
document.getElementById('durPlus').onclick = () => {
  pendingDuration = Math.min(240, pendingDuration + 5);
  document.getElementById('durVal').textContent = pendingDuration;
};

document.getElementById('goalMinus').onclick = () => {
  pendingGoal = Math.max(1, pendingGoal - 1);
  document.getElementById('goalVal').textContent = pendingGoal;
};
document.getElementById('goalPlus').onclick = () => {
  pendingGoal = Math.min(24, pendingGoal + 1);
  document.getElementById('goalVal').textContent = pendingGoal;
};

document.getElementById('notifCheck').onchange = (e) => {
  pendingNotif = e.target.checked;
};

document.getElementById('btnSave').onclick = () => {
  safeSendMessage({
    type: 'SAVE_SETTINGS',
    settings: { duration: pendingDuration, dailyGoal: pendingGoal, notifications: pendingNotif }
  }, (res) => {
    if (!res) {
      showFeedback('Unable to save settings right now.', true);
      return;
    }
    showFeedback('✓ Settings saved — timer has been reset.');
  });
};

document.getElementById('btnClear').onclick = () => {
  if (!confirm('Delete all pomodoro history? This cannot be undone.')) return;
  safeStorageSet({ history: {} }, (ok) => {
    if (!ok) {
      showFeedback('Unable to clear history right now.', true);
      return;
    }
    showFeedback('✓ History cleared.');
  });
};

document.getElementById('btnSaveToGoogle').onclick = () => {
  showFeedback('Saving to Google account…');
  saveBackupToGoogle((ok) => {
    if (!ok) {
      showFeedback('Unable to save to Google account right now.', true);
      return;
    }
    showFeedback('✓ Backup saved to your Google account.');
  });
};

document.getElementById('btnLoadFromGoogle').onclick = () => {
  showFeedback('Loading from Google account…');
  loadBackupFromGoogle((payload) => {
    if (!payload) {
      showFeedback('No Google backup found yet.', true);
      return;
    }
    applyBackupPayload(payload, (ok) => {
      if (!ok) {
        showFeedback('Unable to load Google backup.', true);
        return;
      }
      showFeedback('✓ Backup loaded. Reloading…');
      setTimeout(() => window.location.reload(), 800);
    });
  });
};

document.getElementById('btnExportBackup').onclick = () => {
  chrome.storage.sync.get(['history', 'settings', 'cloudBackup'], (res) => {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: normalizeSettingsObject(res.settings || {}),
      history: res.history && typeof res.history === 'object' ? res.history : {},
      cloudBackup: res.cloudBackup || null
    };
    downloadBackupPayload(backup);
    showFeedback('✓ Backup file downloaded.');
  });
};

document.getElementById('btnImportBackup').onclick = () => {
  document.getElementById('fileInput').click();
};

document.getElementById('fileInput').onchange = (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      applyBackupPayload(payload, (ok) => {
        if (!ok) {
          showFeedback('Unable to import backup file.', true);
          return;
        }
        showFeedback('✓ Backup file imported. Reloading…');
        setTimeout(() => window.location.reload(), 800);
      });
    } catch (error) {
      console.warn('Backup import failed:', error);
      showFeedback('That backup file could not be read.', true);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
};

loadSettings();
