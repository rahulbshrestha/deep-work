# 🍅 Focus Timer

A lightweight Chrome extension for running Pomodoro-style focus sessions — click the toolbar icon to start, track your streaks on a GitHub-style contribution graph, and keep your history backed up.

## ✨ Features

- ⏱️ **One-click timer** — click the toolbar icon to start/pause a focus session, right from the browser
- ⌨️ **Keyboard shortcuts** — `Ctrl+Shift+Y` to toggle, `Ctrl+Shift+R` to reset
- 🔔 **Desktop notifications** when a session wraps up
- 📊 **History & stats** — a contribution-style graph, weekly focus rhythm chart, streaks, and daily totals
- 📈 **Trends** — most productive day, daily average, total focus time, and goal consistency
- 🎯 **Daily goals** — set a target number of sessions per day and track progress
- ☁️ **Backup & sync** — save history/settings to your Chrome/Google account, or export/import a JSON backup file
- 🎨 **Clean, consistent UI** across the popup, settings, and history pages

## 🗂️ Project structure

```
extension/
├── manifest.json     🧩 Chrome extension manifest (Manifest V3)
├── bg.js              ⚙️ Background service worker — timer logic, alarms, notifications
├── popup.html/js       🍅 Toolbar popup — start/pause, countdown, daily goal
├── history.html/js     📊 History page — contribution graph, weekly chart, trends
├── settings.html/js    🛠️ Settings page — duration, goals, notifications, backup
├── theme.css           🎨 Shared color tokens used across all pages
└── icons/               🖼️ Extension icons (idle/running/paused/complete states)
```

## 🚀 Getting started

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` folder
4. Click the tomato icon in your toolbar to start your first session 🍅

## 📖 Usage

### Starting a session
- Click the 🍅 toolbar icon to **start** a session
- Click it again (or press `Ctrl+Shift+Y`) to **pause/resume**
- The badge shows the time remaining, and the icon changes color for running / paused / complete

### Resetting
- Press `Ctrl+Shift+R`, open the popup and click **↺ Reset timer**, or right-click the toolbar icon → **↺ Reset Timer**

### Checking your history
- Right-click the toolbar icon → **📊 Pomodoro History**, or click **📊 History** in the popup footer
- See today's count, this week's total, and your current streak
- The contribution graph auto-scrolls to your most recent weeks
- Click any day on the graph to manually edit that day's session count
- Switch to the **Trends** tab for your most productive day, daily average, and goal consistency

### Adjusting settings
- Right-click the toolbar icon → **⚙️ Settings**, or click **⚙️ Settings** in the popup footer
- Change **session duration** and **daily goal** with the +/− steppers
- Toggle **desktop notifications** on/off
- Back up your data:
  - **Save/Load** → syncs history & settings to your Chrome/Google account
  - **Export/Import** → downloads/restores a JSON backup file (handy for moving to another Mac or browser)
- **Clear All** permanently deletes your recorded history

## 🛠️ Tech

Plain HTML/CSS/JS, no build step, no dependencies — just Chrome's `storage`, `alarms`, `notifications`, and `contextMenus` APIs under Manifest V3.
