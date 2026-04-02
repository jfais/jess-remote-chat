# Jess Remote Chat

Remote web chat interface for AI CLI tools (Kilo/Jess, Claude Code, OpenCode) via Tailscale network.

## Features

- **Multi-CLI Support** - Switch between Kilo, Claude Code, and OpenCode
- **Real-time Chat** - Message queue system with polling
- **Dark/Light Mode** - Toggle with persistent preference
- **File Attachments** - Support images (JPG, PNG, GIF, WebP) and PDFs
- **Message History** - localStorage persistence
- **Markdown Rendering** - Code blocks, bold, italic, lists
- **Keyboard Shortcuts** - Enter to send, Shift+Enter for newline
- **Copy Messages** - One-click copy responses
- **Settings Page** - Configure CLI tool and MemoryCore path
- **Responsive Design** - Mobile-first UI
- **Connection Status** - Online/offline indicator
- **Typing Indicator** - Shows when waiting for response

## Architecture

```
📱 Browser (Mobile/Laptop)
       ↓ (Tailscale Network)
🖥️ Jess PC (100.x.x.x)
   ├── Fastify Server (port 3000)
   ├── /api/send → queue/message-queue.json
   ├── /api/poll ← queue/response-queue.json
   ├── /api/settings → settings.json
   └── 📄 Chat UI
           ↓
      ┌────┴────┐
      │         │
   Settings   Worker (CLI Processor)
   (settings.json)     │
      │         ├── Kilo
      │         ├── Claude Code
      │         └── OpenCode
      └──┘
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Server

```bash
npm start
```

### 3. Start Worker (separate terminal)

```bash
npm run worker
```

### 4. Access via Tailscale

```
http://[YOUR-TAILSCALE-IP]:3000
```

### 5. Configure CLI Tool

Open Settings page: `http://[YOUR-TAILSCALE-IP]:3000/settings.html`

Select your preferred CLI tool:
- **Kilo CLI** - Jess AI Companion with MemoryCore
- **Claude Code** - Anthropic's AI assistant
- **OpenCode** - Open source AI coding tool

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/send` | Send text message |
| POST | `/api/upload` | Upload file with optional text |
| GET | `/api/poll` | Poll for new responses |
| DELETE | `/api/clear` | Clear all queues |
| GET | `/api/status` | Server status check |
| GET | `/api/settings` | Get current settings |
| POST | `/api/settings` | Update settings |
| GET | `/api/cli-info` | Get CLI tool info |

## Configuration

Settings are stored in `settings.json`:

```json
{
  "cli": "kilo",
  "memoryPath": "/home/spsadmin/www/MemoryCore",
  "pollInterval": 2000,
  "autoStart": true
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| cli | kilo | CLI tool to use (kilo, claude, opencode) |
| memoryPath | /home/spsadmin/www/MemoryCore | Path to MemoryCore directory |
| pollInterval | 2000 | Worker poll interval in ms |

## CLI Tools

### Kilo CLI (Default)
```bash
kilo ask "message"
```
Jess AI Companion with full MemoryCore integration.

### Claude Code
```bash
claude -p "prompt"
```
Anthropic's CLI for AI-assisted coding.

### OpenCode
```bash
opencode "message"
```
Open source AI coding assistant.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |

## Tech Stack

- **Server**: Fastify 5.x
- **Plugins**: @fastify/cors, @fastify/multipart, @fastify/static
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **IPC**: JSON file queues
- **Worker**: Node.js CLI processor

## License

MIT
