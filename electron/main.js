const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}
const os = require('os');
const { app, BrowserWindow, Menu } = require('electron');

const widevine = require('./widevine');
const sessionState = require('./session');
const licenseProxy = require('./licenseProxy');
const windows = require('./windows');
const updater = require('./updater');
const { setupIpc } = require('./ipc');

widevine.configureWidevineFromEnv();

// Process-wide: the castLabs Widevine CDM fails to load on Windows under the OS sandbox
// ("CreateCdmFunc not available", verified on Electron 43.7.7). App windows still use
// webPreferences.sandbox, which keeps Node out of the renderer and the preload.
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('no-sandbox');
}

// Avoid "Unable to move the cache: Access denied" and "Gpu Cache Creation failed" on Windows:
// use a dedicated per-process cache directory and disable GPU shader disk cache
const cacheDir = path.join(os.tmpdir(), 'f1openviewer-cache', String(process.pid));
app.commandLine.appendSwitch('disk-cache-dir', cacheDir);
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

app.whenReady().then(async () => {
  await widevine.waitForWidevineReady();
  licenseProxy.startLicenseProxy();
  licenseProxy.installWebRequestHooks();
  setupIpc();

  await sessionState.restoreSessionOnStartup();
  sessionState.startProactiveRefreshLoop();

  Menu.setApplicationMenu(null);

  windows.createWindow();
  // Not startup-critical, so delay it past the initial load/session-restore burst.
  setTimeout(() => { updater.checkForUpdate().catch(() => {}); }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windows.createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
