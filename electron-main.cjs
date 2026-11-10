const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    title: "FinAudit Justice - نظام تدقيق وفحص العروض المالية للصفقات العمومية"
  });

  // Hide default menu for a professional look
  win.setMenuBarVisibility(false);

  if (isDev) {
    // In dev mode, we connect to the local dev server
    // Note: This won't work in the cloud environment easily as-is,
    // but this file is meant for the user to use locally.
    win.loadURL('http://localhost:3000');
  } else {
    // In production, we load the built index.html
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
