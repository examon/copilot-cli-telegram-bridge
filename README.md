# Copilot CLI Telegram Bridge

A GitHub Copilot CLI extension that bridges Telegram messages bidirectionally with a CLI session -- send messages from Telegram, get agent responses back.

## Prerequisites

- [GitHub Copilot CLI](https://github.com/github/copilot-cli) installed and working
- Extensions enabled (experimental feature -- run `/experimental on`)
- A Telegram account
- Node.js 18+ (the extension uses the built-in `fetch` API)

## Install

### Plugin install (recommended)

1. In Copilot CLI, run:
   ```
   /plugin install examon/copilot-cli-telegram-bridge
   ```
2. Restart Copilot CLI
3. Run the install skill to copy the extension into place:
   ```
   /copilot-cli-telegram-bridge:telegram-install
   ```
4. Restart Copilot CLI again (the extension loads on startup)

### Manual install

1. Clone the repo and copy the extension file:
   ```bash
   git clone https://github.com/examon/copilot-cli-telegram-bridge.git
   mkdir -p ~/.copilot/extensions/copilot-cli-telegram-bridge
   cp copilot-cli-telegram-bridge/extension.mjs ~/.copilot/extensions/copilot-cli-telegram-bridge/
   ```
2. Restart Copilot CLI

## Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a display name and a username (must end in `bot`)
4. BotFather replies with a token like `123456789:ABCdefGHI...` -- copy it

## Setup and Connect

1. Register the bot in Copilot CLI:
   ```
   /telegram setup mybot
   ```
2. Paste the bot token when prompted -- the extension validates it against the Telegram API
3. Connect to the bot:
   ```
   /telegram connect mybot
   ```
4. Open Telegram and send any message to your bot
5. The bot replies asking you to check the Copilot CLI terminal for a pairing code
6. Type the 6-character pairing code back to the bot in Telegram (case-insensitive, expires after 5 minutes)
7. Done -- messages now flow both ways between Telegram and your CLI session

## Commands

| Command | Description |
|---|---|
| `/telegram setup <name>` | Register a new bot with a local alias |
| `/telegram connect <name>` | Connect this session to the named bot |
| `/telegram connect <name> --takeover` | Explicitly replace another live session holding the bot |
| `/telegram connect` | List all registered bots with their status |
| `/telegram disconnect` | Disconnect from the current bot |
| `/telegram status` | Show all bots, availability, and paired users |
| `/telegram remove <name>` | Remove a bot from the registry |


## Runtime behavior

### Live response streaming

While Copilot is generating a response, the bridge streams `assistant.message_delta` events to Telegram by creating a draft message and editing it at a throttled pace. This avoids a long-lived `typing...` indicator with no visible progress. When Copilot emits the final `assistant.message`, the bridge replaces the draft with the final first chunk and sends any remaining chunks as follow-up messages.

## Multiple Bots

You can register as many bots as you want with `/telegram setup`. Each Copilot CLI session connects to one bot at a time, but multiple sessions can run different bots simultaneously.

If a new session connects to a bot that another session already holds, the bridge refuses by default. Use `/telegram connect <name> --takeover` when you intentionally want the new session to replace the old one.

Access control is shared -- pairing with any bot grants access to all bots managed by this extension.

## Troubleshooting

- **Extension not loading** -- make sure you enabled the EXTENSIONS feature flag (`/experimental` in the CLI). Then verify the file exists at `~/.copilot/extensions/copilot-cli-telegram-bridge/extension.mjs`
- **Bot not responding** -- check that the token is valid. Try `/telegram disconnect` then `/telegram connect` again
- **The response appears stuck on typing** -- recent bridge versions stream assistant deltas into an edited draft message. If you still only see typing, Copilot may be blocked on a CLI permission prompt rather than generating text. Check the Copilot terminal for an approval picker.
- **Startup fails with `Extension "unknown" was denied permission access`** -- newer Copilot CLI builds may require explicit permission for extensions that participate in permission handling. Start Copilot CLI with `--allow-tool extension-permission-access` and then reconnect with `/telegram connect <name>`.
- **Pairing code expired** -- codes expire after 5 minutes. Send a new message to the bot to get a fresh one
- **"Another session has this bot"** -- the bot is locked by another CLI session. Reconnect with `/telegram connect <name> --takeover` only if you intentionally want to replace that active session.
- **Bot shows locked by an old session** -- recent versions refresh `lock.json` while polling and treat locks as stale when the heartbeat expires, the PID exits, or Linux detects PID reuse. On non-Linux platforms, stale detection still uses the heartbeat and PID liveness checks. Reconnect with `/telegram connect <name>` to replace the stale lock safely.


### Stale lock recovery

The bridge lock file includes a heartbeat and process identity. A lock is treated as stale when the owner process exits, the heartbeat expires, or, on Linux, the stored process start token no longer matches the current process. This prevents dead sessions and PID reuse from leaving a bot permanently locked.

## Security

Bot tokens are stored **in plain text** in `bots.json` (with restricted file permissions -- owner read/write only). Anyone with read access to that file can control your bot. Keep this in mind:

- Do not commit `bots.json` to version control
- Do not share or back up the extension directory without removing `bots.json` first
- If a token is compromised, revoke it immediately via @BotFather (`/revoke`) and register a new one with `/telegram setup`
- If you start Copilot CLI with broad permissions such as `--allow-all-tools`, pairing a Telegram user gives that user remote access to the same Copilot session and tool approvals available in the local CLI. Only pair trusted users and use the narrowest Copilot permissions that fit your workflow.

## Uninstall

1. Disconnect if connected: `/telegram disconnect`
2. Remove the extension:
   ```bash
   rm -rf ~/.copilot/extensions/copilot-cli-telegram-bridge
   ```
3. If installed via plugin:
   ```
   /plugin uninstall copilot-cli-telegram-bridge
   ```
