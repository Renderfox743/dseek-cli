'use strict';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// chrome-data lives in the user's current working directory
const USER_DATA_DIR = path.join(process.cwd(), 'chrome-data');
const PROFILE_DIR = 'Default';

const CHROME_PATHS = [
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const EXECUTABLE_PATH = CHROME_PATHS.find(p => fs.existsSync(p));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

(async () => {
  console.log('🔐 dseek-cli login\n');

  if (!EXECUTABLE_PATH) {
    console.error('❌ No Chrome/Chromium found.');
    console.error('   Run: ds setup');
    process.exit(1);
  }

  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }

  console.log(`📁 Profile root: ${USER_DATA_DIR}`);
  console.log(`📁 Profile dir:  ${PROFILE_DIR}\n`);

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: EXECUTABLE_PATH,
    userDataDir: USER_DATA_DIR,
    defaultViewport: { width: 800, height: 800 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--window-size=800,800',
      '--window-position=0,0',
      `--profile-directory=${PROFILE_DIR}`
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 800 });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en'] });
    window.chrome = { runtime: {} };
  });

  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  await page.goto('https://chat.deepseek.com', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  console.log('✅ Browser open. Log in manually.');
  console.log('   When you can see the "Message DSeek" input, come back here and press ENTER.');
  console.log('   Do NOT Ctrl+C — that kills Chrome before it saves cookies.\n');

  await new Promise(resolve => rl.question('', resolve));

  console.log('\n💾 Saving cookies...');
  try {
    const cookies = await page.cookies();
    const cookiesFile = path.join(USER_DATA_DIR, 'cookies-backup.json');
    fs.writeFileSync(cookiesFile, JSON.stringify(cookies, null, 2));
    console.log(`✅ Backed up ${cookies.length} cookies to ${cookiesFile}`);
  } catch(e) {
    console.log(`⚠️ Cookie backup failed: ${e.message}`);
  }

  console.log('🔒 Closing browser gracefully...');
  await browser.close();

  const defaultProfile = path.join(USER_DATA_DIR, PROFILE_DIR);
  if (fs.existsSync(defaultProfile)) {
    const files = fs.readdirSync(defaultProfile);
    console.log(`\n✅ Profile written to ${defaultProfile}`);
    console.log(`   Files: ${files.slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}`);
    console.log(`   Cookies DB present: ${fs.existsSync(path.join(defaultProfile, 'Cookies'))}`);
    console.log('\n👉 Next: ds chat');
  } else {
    console.log(`\n⚠️ Profile dir not found: ${defaultProfile}`);
    console.log('   Chrome may have used a different profile path.');
  }

  process.exit(0);
})().catch(err => {
  console.error(`❌ Login error: ${err.message}`);
  process.exit(1);
});
