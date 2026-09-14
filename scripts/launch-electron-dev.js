const { spawn } = require('child_process');
const path = require('path');

const projectDir = path.join(__dirname, '..');
const exe =
  process.platform === 'win32'
    ? path.join(projectDir, 'build', 'electron-dev', 'electron.exe')
    : require('electron');

const child = spawn(exe, [projectDir], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development', ELECTRON_DEV: '1' },
  cwd: projectDir,
});

child.on('exit', (code) => process.exit(code ?? 0));
