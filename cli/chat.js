'use strict';

const readline = require('readline');
const send = require('./send.js');

module.exports = function chat(args) {
  const useThink = args && args[0] && args[0].toLowerCase() === 'think';

  console.log(`💬 dseek-cli chat${useThink ? ' (Deep thinking ON)' : ''}`);
  console.log('   Type your message. "exit" or "quit" to leave.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[36m📝 You: \x1b[0m',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const msg = line.trim();

    if (!msg) { rl.prompt(); return; }
    if (msg === 'exit' || msg === 'quit') {
      console.log('👋 Bye.');
      rl.close();
      process.exit(0);
    }

    rl.pause();
    process.stdout.write('\n🤖 DSeek: ');

    try {
      await send(useThink, msg.split(' '), { silentHeader: true, exitOnDone: false });
    } catch (e) {
      process.stderr.write(`\n❌ ${e.message}`);
    }

    process.stdout.write('\n\n');
    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
};
