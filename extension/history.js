var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var CELL = 16;
var GAP = 2;
var COL_W = CELL + GAP;
var NUM_WEEKS = 39;

var today = new Date();
today.setHours(0, 0, 0, 0);

function dateKey(d) {
  var y = d.getFullYear();
  var mo = ('0' + (d.getMonth() + 1)).slice(-2);
  var da = ('0' + d.getDate()).slice(-2);
  return y + '-' + mo + '-' + da;
}

var todayKey = dateKey(today);
var hist = {};

function normalizeHistory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  var result = {};
  Object.entries(value).forEach(function(entry) {
    var key = entry[0];
    var parsed = Number(entry[1]);
    if (typeof key === 'string' && key && Number.isFinite(parsed) && parsed >= 0) {
      result[key] = Math.floor(parsed);
    }
  });
  return result;
}

function isStoragePayloadPresent(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value).length > 0;
  }
  return true;
}

function mergeStoragePayloads(primaryData, fallbackData) {
  var merged = {};
  var keys = new Set([
    ...Object.keys(primaryData || {}),
    ...Object.keys(fallbackData || {})
  ]);

  keys.forEach(function(key) {
    var primaryValue = primaryData?.[key];
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

function safeStorageGet(keys, callback, area) {
  try {
    var storageArea = area === 'local' ? chrome.storage.local : chrome.storage.sync;
    var fallbackArea = chrome.storage.local;
    storageArea.get(keys, function(data) {
      if (chrome.runtime.lastError) {
        console.warn('History storage read failed:', chrome.runtime.lastError.message);
        fallbackArea.get(keys, function(fallbackData) {
          callback(fallbackData || {});
        });
        return;
      }

      fallbackArea.get(keys, function(fallbackData) {
        if (chrome.runtime.lastError) {
          callback(data || {});
          return;
        }
        callback(mergeStoragePayloads(data || {}, fallbackData || {}));
      });
    });
  } catch (error) {
    console.warn('History storage read threw:', error);
    callback({});
  }
}

function safeStorageSet(area, data, callback) {
  try {
    var storageArea = area === 'local' ? chrome.storage.local : chrome.storage.sync;
    var fallbackArea = chrome.storage.local;
    storageArea.set(data, function() {
      if (chrome.runtime.lastError) {
        console.warn('History storage write failed:', chrome.runtime.lastError.message);
        fallbackArea.set(data, function() {
          if (callback) callback(false);
        });
        return;
      }

      if (area === 'sync') {
        fallbackArea.set(data, function() {
          if (callback) callback(true);
        });
      } else if (callback) {
        callback(true);
      }
    });
  } catch (error) {
    console.warn('History storage write threw:', error);
    if (callback) callback(false);
  }
}

function level(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  return 4;
}

function getWeekStart(date) {
  var start = new Date(date);
  start.setHours(0, 0, 0, 0);
  var day = start.getDay();
  start.setDate(start.getDate() - day);
  return start;
}

function getWeekEnd(date) {
  var end = new Date(getWeekStart(date));
  end.setDate(end.getDate() + 6);
  return end;
}

function renderStats() {
  var total = 0;
  for (var k in hist) total += hist[k];

  var d, week = 0, streak = 0;

  var ws = getWeekStart(today);
  for (d = new Date(ws); d <= today; d.setDate(d.getDate() + 1)) {
    week += hist[dateKey(d)] || 0;
  }

  // Streak only counts weekdays — weekends neither break nor extend it.
  for (d = new Date(today); ; d.setDate(d.getDate() - 1)) {
    var dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    if ((hist[dateKey(d)] || 0) > 0) {
      streak++;
    } else {
      break;
    }
  }

  document.getElementById('sToday').textContent = hist[todayKey] || 0;
  document.getElementById('sWeek').textContent = week;
  document.getElementById('sStreak').textContent = streak;
}

function buildWeeklySummary() {
  var weeks = [];
  var currentWeekStart = getWeekStart(today);
  currentWeekStart.setDate(currentWeekStart.getDate() - (52 * 7));

  for (var i = 0; i < 53; i++) {
    var weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() + (i * 7));
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    var total = 0;
    for (var d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
      total += hist[dateKey(d)] || 0;
    }

    weeks.push({
      start: weekStart,
      end: weekEnd,
      total: total
    });
  }

  return weeks;
}

function formatWeekLabel(week) {
  var start = week.start;
  var end = week.end;
  var startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  var endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return startLabel + ' – ' + endLabel;
}

function renderWeeklySummary() {
  var track = document.getElementById('weeklyTrack');
  var pill = document.getElementById('weeklySummaryPill');
  var syncStatus = document.getElementById('syncStatus');
  if (!track) return;

  if (syncStatus) {
    syncStatus.textContent = '☁ Synced to Chrome';
  }

  track.innerHTML = '';
  var weeks = buildWeeklySummary();
  var recentWeeks = weeks.slice(-10);
  var values = recentWeeks.map(function(week) { return week.total; });
  var maxTotal = Math.max(1, ...values);

  var bestWeek = recentWeeks.reduce(function(best, week) {
    if (!best || week.total > best.total) return week;
    return best;
  }, null);

  if (pill) {
    pill.textContent = bestWeek && bestWeek.total > 0 ? 'Best week: ' + bestWeek.total + ' sessions' : 'Best week: none';
  }

  if (recentWeeks.length === 0 || recentWeeks.every(function(week) { return week.total === 0; })) {
    var empty = document.createElement('div');
    empty.className = 'weekly-empty';
    empty.textContent = 'No sessions yet — your weekly pattern will appear here.';
    track.appendChild(empty);
    return;
  }

  var chart = document.createElement('div');
  chart.className = 'weekly-chart';

  recentWeeks.forEach(function(week) {
    var group = document.createElement('div');
    group.className = 'weekly-bar-group';

    var shell = document.createElement('div');
    shell.className = 'weekly-bar-shell';

    var bar = document.createElement('div');
    bar.className = 'weekly-bar' + (week.total <= 0 ? ' zero' : '');
    var height = week.total <= 0 ? 6 : Math.max(12, Math.round((week.total / maxTotal) * 100));
    bar.style.height = height + '%';
    bar.title = 'Week of ' + week.start.toLocaleDateString() + ' to ' + week.end.toLocaleDateString() + ': ' + week.total + ' session' + (week.total === 1 ? '' : 's');
    shell.appendChild(bar);

    var value = document.createElement('div');
    value.className = 'weekly-bar-value';
    value.textContent = week.total > 0 ? week.total : '0';

    var label = document.createElement('div');
    label.className = 'weekly-bar-label';
    label.textContent = formatWeekLabel(week);

    group.appendChild(shell);
    group.appendChild(value);
    group.appendChild(label);
    chart.appendChild(group);
  });

  track.appendChild(chart);
}

function renderGraph() {
  var end = new Date(today);
  end.setDate(today.getDate() + (6 - today.getDay()));
  var start = new Date(end);
  start.setDate(end.getDate() - (NUM_WEEKS * 7 - 1));

  var weeks = [];
  var cur = new Date(start);
  while (cur <= end) {
    var wk = [];
    for (var i = 0; i < 7; i++) {
      wk.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(wk);
  }

  var strip = document.getElementById('monthStrip');
  strip.innerHTML = '';
  strip.style.width = (weeks.length * COL_W) + 'px';
  strip.style.position = 'relative';

  var lastMo = -1;
  weeks.forEach(function(wk, wi) {
    var mo = wk[0].getMonth();
    if (mo !== lastMo) {
      var span = document.createElement('span');
      span.className = 'mo-lbl';
      span.textContent = MONTHS[mo];
      span.style.left = (wi * COL_W) + 'px';
      strip.appendChild(span);
      lastMo = mo;
    }
  });

  var row = document.getElementById('weekRow');
  row.innerHTML = '';

  weeks.forEach(function(wk) {
    var col = document.createElement('div');
    col.className = 'week-col';

    wk.forEach(function(day) {
      var cell = document.createElement('div');
      cell.className = 'cell';

      if (day > today) {
        cell.classList.add('future');
      } else {
        var k = dateKey(day);
        var count = hist[k] || 0;
        var lv = level(count);

        if (k === todayKey) cell.classList.add('today');
        if (lv > 0) cell.setAttribute('data-v', String(lv));

        var tipTxt = DAYS[day.getDay()] + ' ' + MONTHS[day.getMonth()] + ' ' + day.getDate() + ', ' + day.getFullYear() + '  ·  ' + count + ' session' + (count === 1 ? '' : 's');
        attachCell(cell, k, count, tipTxt);
      }

      col.appendChild(cell);
    });

    row.appendChild(col);
  });

  var body = document.querySelector('.graph-body');
  body.scrollLeft = body.scrollWidth;
}

function attachCell(cell, k, count, tipTxt) {
  var tip = document.getElementById('tip');

  cell.addEventListener('mouseenter', function() {
    tip.textContent = tipTxt;
    tip.style.opacity = '1';
  });
  cell.addEventListener('mousemove', function(e) {
    tip.style.left = e.clientX + 'px';
    tip.style.top = (e.clientY - 42) + 'px';
  });
  cell.addEventListener('mouseleave', function() {
    tip.style.opacity = '0';
  });
  cell.addEventListener('click', function() {
    openModal(k, count);
  });
}

safeStorageGet(['history', 'settings'], function(data) {
  hist = normalizeHistory(data.history);
  const settings = data.settings || { duration: 60, dailyGoal: 4 };
  render(settings);
}, 'sync');

document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.onclick = function() {
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.view-section').forEach(function(s) { s.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab + 'View').classList.add('active');
  };
});

function render(settings) {
  renderStats();
  renderGraph();
  renderWeeklySummary();
  renderWeeklyLog(settings);
  renderTrends(settings);
}

var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatHours(h) {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

// Weeks run Sun–Sat and are split at month boundaries so every row belongs
// to exactly one month (e.g. Apr 26–30 and May 1–2 are separate rows).
function buildWeeklyLog(hoursPerSession, goalPerWeekday) {
  var keys = Object.keys(hist).filter(function(k) { return hist[k] > 0 && k <= todayKey; }).sort();
  if (keys.length === 0) return [];

  var parts = keys[0].split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  var end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));

  var rows = [];
  var row = null;
  for (; d <= end; d.setDate(d.getDate() + 1)) {
    var dow = d.getDay();
    if (!row || dow === 0 || d.getDate() === 1) {
      row = { year: d.getFullYear(), month: d.getMonth(), days: [], weekdays: [], sessions: 0, current: false };
      rows.push(row);
    }
    var day = new Date(d);
    row.days.push(day);
    if (dow !== 0 && dow !== 6) row.weekdays.push(day);
    row.sessions += hist[dateKey(day)] || 0;
    if (dateKey(day) === todayKey) row.current = true;
  }

  return rows
    .filter(function(r) { return r.weekdays.length > 0 || r.sessions > 0; })
    .map(function(r) {
      r.first = r.days[0];
      r.last = r.days[r.days.length - 1];
      r.hours = r.sessions * hoursPerSession;
      r.goal = Math.max(1, r.weekdays.length) * goalPerWeekday;
      return r;
    })
    .reverse();
}

function renderWeeklyLog(settings) {
  var body = document.getElementById('logBody');
  if (!body) return;

  var hoursPerSession = (settings.duration || 60) / 60;
  var goalPerWeekday = (settings.dailyGoal || 4) * hoursPerSession;
  var rows = buildWeeklyLog(hoursPerSession, goalPerWeekday);

  document.getElementById('logSubtitle').textContent =
    'Each bar fills toward your goal of ' + formatHours(goalPerWeekday * 5) + 'h per full week';

  body.innerHTML = '';
  if (rows.length === 0) {
    document.getElementById('logTotalPill').textContent = 'Total: 0h';
    var empty = document.createElement('div');
    empty.className = 'weekly-empty';
    empty.textContent = 'No sessions yet — your weekly log will appear here.';
    body.appendChild(empty);
    return;
  }

  var totalHours = rows.reduce(function(sum, r) { return sum + r.hours; }, 0);
  document.getElementById('logTotalPill').textContent = 'Total: ' + formatHours(totalHours) + 'h';

  var monthTotals = {};
  rows.forEach(function(r) {
    var mk = r.year + '-' + r.month;
    monthTotals[mk] = (monthTotals[mk] || 0) + r.hours;
  });

  var table = document.createElement('table');
  table.className = 'log-table';
  table.innerHTML = '<thead><tr><th>Year</th><th>Week</th><th class="num">Hours</th><th>Progress</th></tr></thead>';
  var tbody = document.createElement('tbody');

  var lastMonth = null;
  rows.forEach(function(r) {
    var mk = r.year + '-' + r.month;
    if (mk !== lastMonth) {
      var mRow = document.createElement('tr');
      mRow.className = 'month-row';
      mRow.innerHTML = '<td colspan="4"><span class="month-name">' + MONTH_NAMES[r.month] + ' ' + r.year +
        '</span><span class="month-total">' + formatHours(monthTotals[mk]) + 'h this month</span></td>';
      tbody.appendChild(mRow);
      lastMonth = mk;
    }

    var range = MONTH_NAMES[r.first.getMonth()] + ' ' + r.first.getDate();
    if (r.last.getDate() !== r.first.getDate()) range += ' – ' + MONTH_NAMES[r.last.getMonth()] + ' ' + r.last.getDate();

    var pct = Math.round((r.hours / r.goal) * 100);
    var tier = pct >= 100 ? 'tier-max' : pct >= 60 ? 'tier-good' : pct >= 30 ? 'tier-mid' : 'tier-low';
    var fill = Math.min(100, pct);

    var tr = document.createElement('tr');
    tr.className = 'week-row-log';
    tr.innerHTML =
      '<td class="log-year">' + r.year + '</td>' +
      '<td class="log-range">' + range + (r.current ? '<span class="log-badge">Now</span>' : '') + '</td>' +
      '<td class="log-hours num">' + formatHours(r.hours) + '<small>h</small></td>' +
      '<td class="log-bar-cell"><div class="hp-wrap">' +
        '<div class="hp-bar ' + tier + '" title="' + formatHours(r.hours) + 'h of ' + formatHours(r.goal) + 'h goal">' +
          '<div class="hp-fill' + (fill >= 100 ? ' full' : '') + '" style="width:' + fill + '%"></div>' +
        '</div>' +
        '<span class="hp-pct">' + pct + '%</span>' +
      '</div></td>';
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  body.appendChild(table);
}

var WEEKLY_GOAL = 15;

function renderTrends(settings) {
  const monthPrefix = todayKey.slice(0, 7);
  let monthSessions = 0;
  let monthActiveWeekdays = 0;
  for (const dateStr in hist) {
    if (dateStr.slice(0, 7) !== monthPrefix) continue;
    const count = hist[dateStr];
    monthSessions += count;
    if (count > 0) {
      const dow = new Date(dateStr + 'T12:00:00').getDay();
      if (dow !== 0 && dow !== 6) monthActiveWeekdays++;
    }
  }
  const monthHours = (monthSessions * (settings.duration || 60)) / 60;
  document.getElementById('tTotalTime').textContent = monthHours.toFixed(1) + 'h';
  document.getElementById('tTotalDays').textContent =
    'in ' + monthActiveWeekdays + ' day' + (monthActiveWeekdays === 1 ? '' : 's');

  const dayTotals = [0, 0, 0, 0, 0, 0, 0];
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const dateStr in hist) {
    const d = new Date(dateStr + 'T12:00:00');
    const day = d.getDay();
    dayTotals[day] += hist[dateStr];
    dayCounts[day]++;
  }
  let bestDayIdx = -1;
  let maxAvg = -1;
  dayTotals.forEach(function(total, i) {
    const avg = dayCounts[i] ? total / dayCounts[i] : 0;
    if (avg > maxAvg) {
      maxAvg = avg;
      bestDayIdx = i;
    }
  });
  document.getElementById('tBestDay').textContent = bestDayIdx === -1 ? '—' : DAYS[bestDayIdx];

  let last30Total = 0;
  let activeDays = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const k = dateKey(d);
    const count = hist[k] || 0;
    last30Total += count;
    if (count > 0) activeDays++;
  }
  document.getElementById('tAvgSessions').textContent = activeDays > 0 ? (last30Total / activeDays).toFixed(1) : '0.0';

  const recentGoalWeeks = buildWeeklySummary().slice(-12);
  const weeksHit = recentGoalWeeks.filter(function(w) { return w.total >= WEEKLY_GOAL; }).length;
  document.getElementById('tGoalRate').textContent = Math.round((weeksHit / recentGoalWeeks.length) * 100) + '%';
}

let selectedDateStr = null;
let currentCount = 0;

const modal = document.getElementById('editModal');
const mDateDisplay = document.getElementById('mDateDisplay');
const mCountVal = document.getElementById('mCountVal');

function openModal(dateStr, count) {
  selectedDateStr = dateStr;
  currentCount = count;

  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  mDateDisplay.textContent = DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();

  updateCountDisplay();
  modal.classList.add('active');
}

function closeModal() {
  modal.classList.remove('active');
  selectedDateStr = null;
}

function updateCountDisplay() {
  mCountVal.textContent = currentCount;
  document.querySelectorAll('.btn-preset').forEach(function(btn) {
    if (parseInt(btn.dataset.val) === currentCount) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

document.getElementById('btnCloseModal').addEventListener('click', closeModal);
modal.addEventListener('click', function(e) {
  if (e.target === modal) closeModal();
});

document.getElementById('btnMinus').addEventListener('click', function() {
  if (currentCount > 0) {
    currentCount--;
    updateCountDisplay();
  }
});

document.getElementById('btnPlus').addEventListener('click', function() {
  if (currentCount < 99) {
    currentCount++;
    updateCountDisplay();
  }
});

document.querySelectorAll('.btn-preset').forEach(function(btn) {
  btn.addEventListener('click', function() {
    currentCount = parseInt(btn.dataset.val);
    updateCountDisplay();
  });
});

document.getElementById('btnSaveModal').addEventListener('click', function() {
  if (!selectedDateStr) return;

  if (currentCount === 0) {
    delete hist[selectedDateStr];
  } else {
    hist[selectedDateStr] = currentCount;
  }

  safeStorageSet('sync', { history: hist }, function() {
    safeStorageGet(['settings'], function(data) {
      render(data.settings || { duration: 60, dailyGoal: 4 });
    }, 'sync');
    closeModal();
  });
});

