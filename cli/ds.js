#!/usr/bin/env node
'use strict';

const cmd = (process.argv[2] || '').toLowerCase();
const args = process.argv.slice(3);

function printHelp() {
  console.log(`
🚀 dseek-cli — DSeek (DeepSeek) from your terminal

USAGE
  ds <command> [args]

COMMANDS
  setup                  Check environment & dependencies
  login                  Open a headed browser to log in (saves ./chrome-data)
  start                  Start a persistent daemon (browser stays alive)
  start --server         Start an OpenAI-compatible HTTP server
  stop                   Stop the running daemon
  send <message>         Send a one-shot message (no thinking)
  think <message>        Send a one-shot message (Deep thinking on)
  chat                   Interactive chat REPL
  help, --help, -h       Show this help

EXAMPLES
  ds setup
  ds login
  ds start                     # daemon in this terminal
  # (in another terminal)
  ds send "hello"
  ds think "explain quicksort"
  ds start --server            # OpenAI-compatible API on :8080

OPENAI SERVER
  POST http://localhost:<port>/v1/chat/completions
  Models: "chat" (no thinking), "think" (Deep thinking)
  Auth:   Authorization: Bearer <your-key>
`);
}

switch (cmd) {
  case '':
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    process.exit(0);
    break;
  case 'setup':  require('./setup.js'); break;
  case 'login':  require('./login.js'); break;
  case 'start':  require('./start.js')(args); break;
  case 'stop':   require('./stop.js'); break;
  case 'send':   require('./send.js')(false, args); break;
  case 'think':  require('./send.js')(true, args); break;
  case 'chat':   require('./chat.js')(args); break;
  default:
    console.error(`❌ Unknown command: ${cmd}\n`);
    printHelp();
    process.exit(1);
}
