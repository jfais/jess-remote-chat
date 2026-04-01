# Jess Remote Chat

Remote web chat interface for Jess CLI via Tailscale network.

## Features

- **Real-time Chat** - Message queue system with polling
- **Dark/Light Mode** - Toggle with persist preference
- **File Attachments** - Support images (JPG, PNG, GIF, WebP) and PDFs
- **Message History** - localStorage persistence
- **Markdown Rendering** - Code blocks, bold, italic, lists
- **Keyboard Shortcuts** - Enter to send, Shift+Enter for newline
- **Copy Messages** - One-click copy Jess responses
- **Responsive Design** - Mobile-first UI
- **Connection Status** - Online/offline indicator
- **Typing Indicator** - Shows when waiting for response

## Architecture

```
📱 Mobile/Laptop (Browser)
       ↓ (Tailscale Network)
🖥️ Jess PC (100.x.x.x)
   ├── Fastify Server (port 3000)
   ├── /api/send → writes to message-queue.json
   ├── /api/upload → saves file + writes to queue
   ├── /api/poll → reads from response-queue.json
   └── 📄 Chat UI (public/index.html)
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

Server runs on `http://0.0.0.0:3000`

### 3. Access via Tailscale

From any device on your Tailscale network:

```
http://[YOUR-TAILSCALE-IP]:3000
```

## Kilo CLI Integration

To make Jess respond to messages, create a script that reads from the queue:

```bash
# Example: Process messages with Kilo CLI
while true; do
  MESSAGE=$(cat queue/message-queue.json | jq -r '.[0]')
  if [ "$MESSAGE" != "null" ]; then
    # Process with Kilo CLI
    RESPONSE=$(echo "$MESSAGE" | kilo --process)
    
    # Write response
    jq ". + [{ id: \"$(uuidgen)\", content: \"$RESPONSE\", timestamp: \"$(date -I)\" }]" \
      queue/response-queue.json > tmp.json && mv tmp.json queue/response-queue.json
    
    # Remove processed message
    jq '.[1:]' queue/message-queue.json > tmp.json && mv tmp.json queue/message-queue.json
  fi
  sleep 2
done
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/send` | Send text message |
| POST | `/api/upload` | Upload file with optional text |
| GET | `/api/poll` | Poll for new responses |
| DELETE | `/api/clear` | Clear all queues |
| GET | `/api/status` | Server status check |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |

## Tech Stack

- **Server**: Fastify 5.x
- **Plugins**: @fastify/cors, @fastify/multipart, @fastify/static
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **IPC**: JSON file queues

## License

MIT
