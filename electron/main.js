const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let tray;
let serverProcess;

// Determine paths based on environment
const isPackaged = app.isPackaged;
const appPath = isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..');
const serverPath = path.join(appPath, 'index.js');
const publicPath = path.join(appPath, 'public');

function startServer() {
  if (!fs.existsSync(serverPath)) {
    console.error('Server file not found:', serverPath);
    return;
  }

  serverProcess = spawn('node', [serverPath], {
    cwd: appPath,
    stdio: 'pipe',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });
  
  serverProcess.stdout.on('data', (data) => console.log(`Server: ${data}`));
  serverProcess.stderr.on('data', (data) => console.error(`Server Error: ${data}`));
}

function createWindow() {
  const iconPath = path.join(publicPath, 'icon.png');
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL('http://localhost:3000');
  mainWindow.on('closed', () => { mainWindow = null; });
  createTray();
}

function createTray() {
  const iconPath = path.join(publicPath, 'icon.png');
  if (!fs.existsSync(iconPath)) return;

  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow.show() },
    { label: 'Quit', click: () => {
      if (serverProcess) serverProcess.kill();
      app.quit();
    }}
  ]);
  tray.setToolTip('Cloud Share');
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  startServer();
  setTimeout(createWindow, 3000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (serverProcess) serverProcess.kill();
    app.quit();
  }
});
