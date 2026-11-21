// Ledgy desktop app: runs the same Express server as the Docker image, on this computer only,
// and shows it in a window. No login (nobody else can reach it) and the data lives in the user's app-data folder.
import { app, BrowserWindow, shell, dialog } from 'electron';
import net from 'node:net';

const PREFERRED_PORT = 47821; // fixed so the page keeps the same origin (and its saved settings) between launches
const HOST = '127.0.0.1';

const canListen = (port) => new Promise((resolve) => {
  const s = net.createServer();
  s.once('error', () => resolve(false));
  s.listen(port, HOST, () => s.close(() => resolve(true)));
});
const pickPort = async () => {
  if (await canListen(PREFERRED_PORT)) return PREFERRED_PORT;
  return new Promise((resolve) => { const s = net.createServer().listen(0, HOST, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
};

// A second copy would fight over the database file, so focus the existing window instead.
if (!app.requestSingleInstanceLock()) app.quit();

let win;
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

async function startServer() {
  const port = await pickPort();
  Object.assign(process.env, {
    PORT: String(port),
    BIND_ADDR: HOST,
    DATA_DIR: app.getPath('userData'), // ~/Library/Application Support/Ledgy, %APPDATA%\Ledgy
    ALLOW_NO_AUTH: '1',
    NODE_ENV: 'production',
    NODE_NO_WARNINGS: '1',
  });
  const { server } = await import('../server.js');
  if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return port;
}

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    const origin = `http://${HOST}:${port}`;
    win = new BrowserWindow({ width: 1280, height: 860, minWidth: 900, minHeight: 600, title: 'Ledgy', backgroundColor: '#ffffff' });
    // Anything that is not Ledgy itself (links in the app) opens in the normal browser.
    const external = (url) => { if (!url.startsWith(origin)) { shell.openExternal(url); return true; } return false; };
    win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (e, url) => { if (external(url)) e.preventDefault(); });
    win.on('closed', () => { win = null; });
    await win.loadURL(origin);
  } catch (e) {
    dialog.showErrorBox('Ledgy could not start', String(e?.stack || e));
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
