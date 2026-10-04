'use strict';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs');
const path = require('path');

const CHROME_PATHS = [
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

const SELECTORS = {
  textarea: 'textarea[placeholder*="Message" i], textarea[placeholder*="DSeek" i]',
  deepThink: '.ds-toggle-button',
};

function findChrome() {
  return CHROME_PATHS.find(p => fs.existsSync(p));
}

function getProfileDir() {
  return path.join(process.cwd(), 'chrome-data');
}

async function launchBrowser() {
  const exe = findChrome();
  if (!exe) throw new Error('No Chrome/Chromium found. Run: ds setup');

  const userDataDir = getProfileDir();
  if (!fs.existsSync(userDataDir)) {
    throw new Error(`Profile not found at ${userDataDir}. Run: ds login`);
  }
  if (!fs.existsSync(path.join(userDataDir, 'Default'))) {
    throw new Error(`Profile incomplete. Run: ds login`);
  }

  return puppeteer.launch({
    headless: 'new',
    executablePath: exe,
    userDataDir,
    defaultViewport: { width: 800, height: 800 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=800,800',
      '--profile-directory=Default'
    ]
  });
}

// Injects stream interception. Call on every new page.
async function setupPage(page) {
  await page.setViewport({ width: 800, height: 800 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en'] });
    window.chrome = { runtime: {} };

    window.__stream = {
      seq: 0, completedSeq: 0, active: false,
      lastChunkAt: 0, lastEvent: '', text: '', msgId: null,
    };

    function __parseSSELine(line) {
      if (!line.startsWith('data: ')) return null;
      try { return JSON.parse(line.substring(6)); } catch(e) { return null; }
    }

    function __processEvent(eventName, dataObj) {
      const st = window.__stream;
      if (eventName === 'ready' && dataObj.response_message_id != null) {
        if (dataObj.response_message_id !== st.msgId) {
          st.msgId = dataObj.response_message_id;
          st.text = '';
        }
        return;
      }
      if (dataObj.v && dataObj.v.response && Array.isArray(dataObj.v.response.fragments)) {
        let content = '';
        dataObj.v.response.fragments.forEach(f => { if (f.content) content += f.content; });
        if (content) st.text = content;
        return;
      }
      if (dataObj.p === 'response/fragments/-1/content' && typeof dataObj.v === 'string') {
        st.text += dataObj.v; return;
      }
      if (typeof dataObj.v === 'string' && !dataObj.p) st.text += dataObj.v;
    }

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const url = args[0];
      const isStreamUrl = typeof url === 'string' &&
        (url.includes('/chat/completion') || url.includes('/chat/continue'));
      if (!isStreamUrl) return originalFetch.apply(this, args);

      const response = await originalFetch.apply(this, args);
      const st = window.__stream;
      st.seq += 1;
      const mySeq = st.seq;
      st.active = true;
      st.lastChunkAt = Date.now();
      st.lastEvent = '';

      (async () => {
        try {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
              if (line.startsWith('event: ')) st.lastEvent = line.substring(7).trim();
              else if (line.startsWith('data: ')) {
                const dataObj = __parseSSELine(line);
                if (dataObj) __processEvent(st.lastEvent, dataObj);
              }
            }
            st.lastChunkAt = Date.now();
          }
          if (buffer) {
            const dataObj = __parseSSELine(buffer);
            if (dataObj) __processEvent(st.lastEvent, dataObj);
          }
        } catch(e) {}
        st.active = false;
        st.completedSeq = mySeq;
      })();

      return response;
    };

    const XHR = XMLHttpRequest;
    const originalOpen = XHR.prototype.open;
    const originalSend = XHR.prototype.send;
    XHR.prototype.open = function(method, url, ...rest) {
      this.__url = url;
      return originalOpen.call(this, method, url, ...rest);
    };
    XHR.prototype.send = function(...args) {
      const isStream = this.__url && (
        this.__url.includes('/chat/completion') || this.__url.includes('/chat/continue')
      );
      if (!isStream) return originalSend.apply(this, args);
      const st = window.__stream;
      st.seq += 1;
      const mySeq = st.seq;
      st.active = true;
      st.lastChunkAt = Date.now();
      st.lastEvent = '';
      this.__mySeq = mySeq;
      this.addEventListener('progress', function() {
        if (!this.responseText) return;
        st.text = '';
        st.lastEvent = '';
        for (const line of this.responseText.split('\n')) {
          if (line.startsWith('event: ')) st.lastEvent = line.substring(7).trim();
          else if (line.startsWith('data: ')) {
            const dataObj = __parseSSELine(line);
            if (dataObj) __processEvent(st.lastEvent, dataObj);
          }
        }
        st.lastChunkAt = Date.now();
      });
      this.addEventListener('load', function() {
        st.active = false;
        st.completedSeq = mySeq;
      });
      return originalSend.apply(this, args);
    };
  });

  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
}

async function openChatTab(browser) {
  const page = await browser.newPage();
  await setupPage(page);
  await page.goto('https://chat.deepseek.com', {
    waitUntil: 'domcontentloaded', timeout: 60000
  });
  await page.waitForSelector(SELECTORS.textarea, { timeout: 15000, polling: 50 });
  return page;
}

async function checkLoggedIn(browser) {
  let page = null;
  try {
    page = await browser.newPage();
    await setupPage(page);
    await page.goto('https://chat.deepseek.com', {
      waitUntil: 'domcontentloaded', timeout: 60000
    });
    try {
      await page.waitForSelector(SELECTORS.textarea, { timeout: 10000, polling: 100 });
      return true;
    } catch(e) { return false; }
  } catch(e) { return false; }
  finally { if (page) try { await page.close(); } catch(e) {} }
}

async function isDeepThinkOn(page) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return el.getAttribute('aria-pressed') === 'true';
  }, SELECTORS.deepThink);
}

async function setDeepThink(page, enable) {
  const cur = await isDeepThinkOn(page);
  if (cur === null) return false;
  if (cur === enable) return true;
  await page.evaluate((sel) => document.querySelector(sel).click(), SELECTORS.deepThink);
  await new Promise(r => setTimeout(r, 400));
  return (await isDeepThinkOn(page)) === enable;
}

async function sendOnPage(page, message, useThinking, onChunk) {
  if (useThinking) await setDeepThink(page, true);
  else if (await isDeepThinkOn(page) === true) await setDeepThink(page, false);

  const baselineSeq = await page.evaluate(() => window.__stream.seq);

  await page.click(SELECTORS.textarea);
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(message, { delay: 0 });

  const typed = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.value : null;
  }, SELECTORS.textarea);
  if (!typed || !typed.trim()) throw new Error('Text did not land');

  await page.keyboard.press('Enter');

  let finalText = '';
  let rounds = 0;
  const MAX_ROUNDS = 15;
  let prevSeq = baselineSeq;
  let lastEmitted = '';

  while (rounds < MAX_ROUNDS) {
    rounds++;

    // Poll for text and completion
    const result = await page.evaluate(async (baseline) => {
      return new Promise((resolve) => {
        const startedAt = Date.now();
        const SILENCE_MS = 60000;
        const HARD_MS = 600000;
        const tick = setInterval(() => {
          const st = window.__stream;
          if (st.seq > baseline && st.completedSeq >= st.seq && !st.active) {
            clearInterval(tick); resolve({ ok: true, text: st.text }); return;
          }
          if (Date.now() - startedAt > HARD_MS) {
            clearInterval(tick); resolve({ ok: false, reason: 'hard-timeout', text: st.text }); return;
          }
          if (st.active && st.lastChunkAt && (Date.now() - st.lastChunkAt) > SILENCE_MS) {
            clearInterval(tick); resolve({ ok: false, reason: 'silence', text: st.text }); return;
          }
        }, 150);
      });
    }, prevSeq);

    const text = (result.text || '').replace(/FINISHED/g, '').trim();

    // Stream diffs to callback
    if (onChunk && text.length > lastEmitted.length) {
      onChunk(text.substring(lastEmitted.length));
      lastEmitted = text;
    }

    if (result.ok) {
      finalText = text;
    } else if (result.reason === 'silence' && text) {
      finalText = text;
      break;
    } else {
      break;
    }

    // Continue handling
    await new Promise(r => setTimeout(r, 700));
    const cont = await page.evaluate(() => {
      const wanted = ['Continue', 'Continue generating', 'Continue Generating'];
      const els = document.querySelectorAll('button, [role="button"], div, span');
      for (const el of els) {
        const t = (el.innerText || '').trim();
        if (!wanted.includes(t)) continue;
        if (Array.from(el.children).some(c => wanted.includes((c.innerText || '').trim()))) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return t;
      }
      return null;
    });
    if (!cont) break;

    const seqBeforeClick = await page.evaluate(() => window.__stream.seq);

    // Get coords
    const point = await page.evaluate(() => {
      const wanted = ['Continue', 'Continue generating', 'Continue Generating'];
      const els = document.querySelectorAll('button, [role="button"], div, span');
      for (const el of els) {
        const t = (el.innerText || '').trim();
        if (!wanted.includes(t)) continue;
        if (Array.from(el.children).some(c => wanted.includes((c.innerText || '').trim()))) continue;
        let target = el;
        for (let i = 0; i < 5 && target; i++) {
          if (target.tagName === 'BUTTON' || target.getAttribute('role') === 'button') break;
          target = target.parentElement;
        }
        const btn = target || el;
        try { btn.scrollIntoView({ block: 'center' }); } catch(e) {}
        const r = btn.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return null;
    });

    if (!point) break;
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await new Promise(r => setTimeout(r, 50));
    await page.mouse.up();

    let started = await page.evaluate(async (baseline) => {
      return new Promise((resolve) => {
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (window.__stream.seq > baseline) { clearInterval(iv); resolve(true); }
          else if (Date.now() - t0 > 3000) { clearInterval(iv); resolve(false); }
        }, 100);
      });
    }, seqBeforeClick);

    if (!started) {
      // Fallback: synthetic pointer events
      await page.evaluate(() => {
        const wanted = ['Continue', 'Continue generating', 'Continue Generating'];
        const els = document.querySelectorAll('button, [role="button"], div, span');
        for (const el of els) {
          const t = (el.innerText || '').trim();
          if (!wanted.includes(t)) continue;
          if (Array.from(el.children).some(c => wanted.includes((c.innerText || '').trim()))) continue;
          let target = el;
          for (let i = 0; i < 5 && target; i++) {
            if (target.tagName === 'BUTTON' || target.getAttribute('role') === 'button') break;
            target = target.parentElement;
          }
          const btn = target || el;
          const r = btn.getBoundingClientRect();
          const opts = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: 1, pointerType: 'mouse', isPrimary: true };
          btn.dispatchEvent(new PointerEvent('pointerdown', opts));
          btn.dispatchEvent(new MouseEvent('mousedown', opts));
          btn.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
          btn.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
          btn.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
          return;
        }
      });
      started = await page.evaluate(async (baseline) => {
        return new Promise((resolve) => {
          const t0 = Date.now();
          const iv = setInterval(() => {
            if (window.__stream.seq > baseline) { clearInterval(iv); resolve(true); }
            else if (Date.now() - t0 > 3000) { clearInterval(iv); resolve(false); }
          }, 100);
        });
      }, seqBeforeClick);
    }

    if (!started) break;
    prevSeq = seqBeforeClick;
    await new Promise(r => setTimeout(r, 300));
  }

  return finalText.replace(/FINISHED/g, '').trim();
}

module.exports = {
  findChrome, getProfileDir, launchBrowser, setupPage,
  openChatTab, checkLoggedIn, isDeepThinkOn, setDeepThink,
  sendOnPage, SELECTORS,
};