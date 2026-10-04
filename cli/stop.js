'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.cwd(), '.dseek', 'daemon.json');

if (!fs.existsSync(STATE_FILE)) {
  console.log('No daemon running.');
  process.exit(0);
}

let info;
try { info = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
catch(e) {
  console.log('Stale daemon file, removing.');
  fs.unlinkSync(STATE_FILE);
  process.exit(0);
}

console.log(`Stopping daemon (pid ${info.pid}, port ${info.port})...`);

const socket = net.connect(info.port, '127.0.0.1');
let done = false;
socket.on('connect', () => {
  socket.write(JSON.stringify({ type: 'stop' }) + '\n');
});
socket.on('data', () => { done = true; });
socket.on('error', () => {
  if (!done) {
    console.log('Daemon not reachable, cleaning up file.');
    try { fs.unlinkSync(STATE_FILE); } catch(e) {}
  }
  process.exit(0);
});
setTimeout(() => {
  try { process.kill(info.pid, 0); process.kill(info.pid, 'SIGTERM'); } catch(e) {}
  try { fs.unlinkSync(STATE_FILE); } catch(e) {}
  console.log('Stopped.');
  process.exit(0);
}, 2000);