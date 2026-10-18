// Mamba Mentality — Windows desktop shell (Electron). Loads the bundled offline app.
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');

app.setName('Mamba Mentality');
app.setAppUserModelId('com.heisenberg0066.mambamentality');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 380,
    minHeight: 600,
    resizable: true,
    title: 'Mamba Mentality',
    backgroundColor: '#0b0b0b',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.setMenuBarVisibility(false);
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle('Mamba Mentality'); });
  win.once('ready-to-show', () => win.show());

  // External links open in the default browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });

  // .ics and JSON backup exports: always show a Save dialog.
  win.webContents.session.on('will-download', (_e, item) => {
    const name = item.getFilename();
    const ext = path.extname(name).toLowerCase();
    const filters = ext === '.ics'
      ? [{ name: 'Calendar (.ics)', extensions: ['ics'] }]
      : ext === '.json' ? [{ name: 'Backup (.json)', extensions: ['json'] }] : [];
    item.setSaveDialogOptions({
      title: ext === '.ics' ? 'Save calendar file' : 'Save file',
      defaultPath: path.join(app.getPath('downloads'), name),
      filters: filters.concat([{ name: 'All files', extensions: ['*'] }]),
    });
  });

  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); });
app.on('window-all-closed', () => app.quit());
