'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.cwd(), '.dseek', 'daemon.json');

async function tryDaemon(message, thinking) {
  if (!fs.existsSync(STATE_FILE)) return null;

  let info;
  try { info = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch(e) { return null; }

  return await new Promise((resolve) => {
    const socket = net.connect(info.port, '127.0.0.1');
    let buf = '';
    let resolved = false;
    const id = Math.random().toString(36).slice(2);

    const finish = (val) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch(e) {}
      resolve(val);
    };

    socket.on('connect', () => {
      socket.write(JSON.stringify({ type: 'send', id, message, thinking }) + '\n');
    });

    socket.on('data', (data) => {
      buf += data.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id && msg.id !== id) continue;
          if (msg.type === 'chunk') process.stdout.write(msg.text);
          else if (msg.type === 'done') {
            process.stdout.write('\n');
            finish({ ok: true, text: msg.text });
          } else if (msg.type === 'error') {
            console.error(`\n❌ ${msg.message}`);
            finish({ ok: false, error: msg.message });
          }
        } catch(e) {}
      }
    });

    socket.on('error', () => finish(null));
    socket.setTimeout(600000, () => finish({ ok: false, error: 'timeout' }));
  });
}

async function coldRun(message, thinking) {
  const browserLib = require('./browser.js');
  const browser = await browserLib.launchBrowser();
  let page = null;
  try {
    page = await browserLib.openChatTab(browser);
    const text = await browserLib.sendOnPage(page, message, thinking, (chunk) => {
      process.stdout.write(chunk);
    });
    process.stdout.write('\n');
    return { ok: true, text };
  } finally {
    try { if (page) await page.close(); } catch(e) {}
    try { await browser.close(); } catch(e) {}
  }
}

module.exports = async function send(thinking, args) {
  const message = args.join(' ').trim();
  if (!message) {
    console.error(`❌ Usage: ds ${thinking ? 'think' : 'send'} <message>`);
    process.exit(1);
  }

  process.stdout.write(`🤖 `);
  const daemonResult = await tryDaemon(message, thinking);

  if (daemonResult && daemonResult.ok) {
    process.exit(0);
  }
  if (daemonResult && !daemonResult.ok) {
    process.exit(1);
  }

  // No daemon → cold run
  process.stdout.write('(no daemon — spawning browser)\n🤖 ');
  const result = await coldRun(message, thinking);
  process.exit(result.ok ? 0 : 1);
};