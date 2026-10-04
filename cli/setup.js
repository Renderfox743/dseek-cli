'use strict';

const fs = require('fs');
const path = require('path');

const CHROME_PATHS = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

const chrome = CHROME_PATHS.find(p => fs.existsSync(p));
const cwd = process.cwd();
const profileDir = path.join(cwd, 'chrome-data');

console.log('🔧 dseek-cli setup\n');

console.log(`📁 Working directory: ${cwd}`);
console.log(`📁 Profile will be:   ${profileDir}`);
console.log(`   exists:            ${fs.existsSync(profileDir)}`);
console.log('');

if (chrome) {
  console.log(`✅ Chrome/Chromium found: ${chrome}`);
} else {
  console.log('❌ No Chrome/Chromium found.');
  console.log('   Install one of:');
  console.log('   • Ubuntu/Debian:  sudo apt install chromium-browser');
  console.log('   • macOS:          brew install --cask google-chrome');
  console.log('   • Windows:        https://www.google.com/chrome/');
}

try {
  require.resolve('puppeteer-core');
  require.resolve('puppeteer-extra');
  require.resolve('puppeteer-extra-plugin-stealth');
  console.log('✅ Dependencies installed (puppeteer-core, puppeteer-extra, stealth).');
} catch (e) {
  console.log('❌ Missing dependencies. Run: npm install');
}

console.log('');
if (chrome && fs.existsSync(profileDir)) {
  console.log('🎉 Ready. Try: ds chat');
} else if (chrome) {
  console.log('👉 Next: ds login');
} else {
  console.log('👉 Install Chrome, then run: ds login');
}
