# dseek-cli

> ⚠️ **Unofficial, unaffiliated project.**
> `dseek-cli` is **not** made by, endorsed by, or connected to DeepSeek, DSeek, or any of their affiliates. It is an independent web-scraping tool that drives a headless Chrome instance to interact with the public `chat.deepseek.com` web interface.
>
> It relies on the site's current HTML/DOM structure and internal API endpoints, **both of which may change at any time and break this tool without warning.** Use it at your own risk.
>
> By using this tool you are automating a website that may prohibit automation in its Terms of Service. **You are solely responsible for how you use it.** Do not use it for spam, abuse, rate-limit evasion, or anything that violates DeepSeek's Terms of Service or applicable law.

A terminal client and OpenAI-compatible HTTP server for DSeek (DeepSeek). No API key required — it drives your own logged-in browser session.

## Install

```bash
npm install -g dseek-cli
```

Requires **Node.js ≥ 18** and **Chrome or Chromium** installed system-wide.

## Quick start

```bash
ds setup     # verify environment
ds login     # log in once (saves ./chrome-data)
ds chat      # start chatting
```

## Commands

| Command | Description |
|---|---|
| `ds setup` | Checks Chromium, deps, and where `chrome-data/` will live |
| `ds login` | Opens a headed browser to log in. Saves session to `./chrome-data/` |
| `ds start` | Starts a persistent daemon (browser stays alive, ~2-3s per message) |
| `ds start --server` | Starts an OpenAI-compatible HTTP server |
| `ds stop` | Stops the running daemon |
| `ds send <message>` | One-shot message, no thinking |
| `ds think <message>` | One-shot message, with Deep thinking |
| `ds chat` | Interactive REPL |
| `ds chat think` | Interactive REPL with Deep thinking |
| `ds help` | Show help |

## In-chat commands

Once inside `ds chat`:

| Command | Description |
|---|---|
| `<message>` | Send a message |
| `exit` / `quit` | Leave chat mode |

## Modes

### One-shot (`ds send` / `ds think`)

```bash
ds send "what's the capital of France"
ds think "explain quicksort"
```

If a daemon is running, it uses it. Otherwise, it cold-spawns a browser for that single message and closes it (~8-10s).

### Daemon (`ds start`)

Fast path for repeated use. Run it in one terminal and keep it alive:

```bash
# terminal 1
ds start

# terminal 2
ds send "hello"
ds think "explain quicksort"
ds chat
```

Each `ds send` on the daemon path takes ~2-3s instead of ~8-10s because the browser is already warm.

Stop with `ds stop` or `Ctrl+C` in the daemon terminal.

### OpenAI server (`ds start --server`)

Runs an HTTP server that speaks the OpenAI Chat Completions API. Every request opens a fresh browser tab, sends the prompt, and returns the response.

```bash
ds start --server
# Port [8080]: 8080
# API key (leave empty to disable auth): deepseek
```

Then any OpenAI client works:

```bash
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer deepseek" \
  -H "Content-Type: application/json" \
  -d '{"model":"chat","messages":[{"role":"user","content":"hello"}]}'
```

**Models:**
- `chat` — regular DeepSeek
- `think` — Deep thinking enabled

**Endpoint:** `POST /v1/chat/completions`
**Also:** `GET /v1/models`

**Streaming:** not supported. The server ignores `stream: true` and returns a regular JSON response.

#### Python

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8080/v1", api_key="deepseek")

r = client.chat.completions.create(
    model="chat",
    messages=[{"role": "user", "content": "hello"}]
)
print(r.choices[0].message.content)
```

#### Node

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://127.0.0.1:8080/v1',
  apiKey: 'deepseek',
});

const r = await client.chat.completions.create({
  model: 'chat',
  messages: [{ role: 'user', content: 'hello' }],
});
console.log(r.choices[0].message.content);
```

## Files created at runtime

Running `ds` in a directory creates:

```
your-project/
├── chrome-data/           # browser session (from ds login)
│   ├── Default/
│   └── cookies-backup.json
└── .dseek/                # daemon state (from ds start)
    └── daemon.json
```

Each directory has its own session. To use the same login everywhere, run `ds` from the same directory, or copy `chrome-data/` where you need it.

## Requirements

- **Node.js ≥ 18**
- **Chrome or Chromium**
  - Ubuntu/Debian: `sudo apt install chromium-browser`
  - macOS: `brew install --cask google-chrome`
  - Windows: https://www.google.com/chrome/

## Notes

- On a headless server, `ds login` needs a display. Log in on a laptop and copy `chrome-data/` over.
- If the site layout changes, selectors may break. Update `SELECTORS` in `cli/browser.js`.
- The CLI detects an unauthenticated session by looking for the `Message DSeek` input. If it's missing, it tells you to run `ds login`.

## Disclaimer

- **Unofficial.** Not affiliated with DeepSeek in any way.
- **Fragile.** Relies on the site's DOM and internal endpoints. May break at any time.
- **Your responsibility.** Automating DeepSeek may violate their Terms of Service. Use only with your own account and at your own risk.
- **No warranty.** Provided as-is, no support, no guarantees.

## License

MIT
