'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const browserLib = require('./browser.js');

const STATE_DIR = path.join(process.cwd(), '.dseek');
const STATE_FILE = path.join(STATE_DIR, 'daemon.json');

function log(...args) { console.log('[daemon]', ...args); }

(async () => {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  // If a daemon is already running, refuse
  if (fs.existsSync(STATE_FILE)) {
    try {
      const old = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      // Probe it
      await new Promise((res, rej) => {
        const s = net.connect(old.port, '127.0.0.1');
        s.on('connect', () => { s.destroy(); res(); });
        s.on('error', () => { s.destroy(); rej(); });
        setTimeout(() => { s.destroy(); rej(); }, 500);
      });
      console.error(`❌ Daemon already running (pid ${old.pid}, port ${old.port}).`);
      console.error(`   Run: ds stop`);
      process.exit(1);
    } catch (e) {
      // Stale — remove
      try { fs.unlinkSync(STATE_FILE); } catch(e) {}
    }
  }

  log('launching browser...');
  const browser = await browserLib.launchBrowser();

  log('checking login...');
  const ok = await browserLib.checkLoggedIn(browser);
  if (!ok) {
    console.error('❌ Not logged in. Run: ds login');
    await browser.close();
    process.exit(1);
  }
  log('logged in');

  // Pre-warm a tab
  let warmPage = await browserLib.openChatTab(browser);
  log('ready');

  const server = net.createServer((socket) => {
    let buf = '';
    socket.on('data', async (data) => {
      buf += data.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        try {
          const req = JSON.parse(line);
          await handleRequest(socket, req);
        } catch (e) {
          socket.write(JSON.stringify({ type: 'error', message: e.message }) + '\n');
        }
      }
    });
  });

  async function handleRequest(socket, req) {
    const { type, id, message, thinking } = req;

    if (type === 'ping') {
      socket.write(JSON.stringify({ type: 'pong', id }) + '\n');
      return;
    }
    if (type === 'stop') {
      socket.write(JSON.stringify({ type: 'stopping', id }) + '\n');
      setTimeout(shutdown, 100);
      return;
    }
    if (type === 'send') {
      let page = null;
      try {
        // Reuse warm page, then replace it
        page = warmPage;
        warmPage = null;

        const text = await browserLib.sendOnPage(page, message, !!thinking, (chunk) => {
          socket.write(JSON.stringify({ type: 'chunk', id, text: chunk }) + '\n');
        });

        socket.write(JSON.stringify({ type: 'done', id, text }) + '\n');

        // Close the used page and open a fresh one for the next request
        try { await page.close(); } catch(e) {}
        warmPage = await browserLib.openChatTab(browser);
      } catch (e) {
        try { if (page) await page.close(); } catch(_) {}
        try { warmPage = await browserLib.openChatTab(browser); } catch(_) {}
        socket.write(JSON.stringify({ type: 'error', id, message: e.message }) + '\n');
      }
      return;
    }
    socket.write(JSON.stringify({ type: 'error', id, message: `Unknown type: ${type}` }) + '\n');
  }

  async function shutdown() {
    log('shutting down...');
    try { await browser.close(); } catch(e) {}
    try { fs.unlinkSync(STATE_FILE); } catch(e) {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000);
  }

  // Listen on random port, 127.0.0.1 only
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      pid: process.pid, port, startedAt: Date.now(),
    }, null, 2));
    log(`listening on 127.0.0.1:${port} (pid ${process.pid})`);
    log('Ctrl+C to stop');
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch(e => {
  console.error('❌ Daemon error:', e.message);
  process.exit(1);
});