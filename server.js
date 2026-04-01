import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = fastify({ logger: true });

const PORT = process.env.PORT || 3000;
const QUEUE_DIR = path.join(__dirname, 'queue');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MESSAGE_QUEUE = path.join(QUEUE_DIR, 'message-queue.json');
const RESPONSE_QUEUE = path.join(QUEUE_DIR, 'response-queue.json');

if (!fs.existsSync(QUEUE_DIR)) fs.mkdirSync(QUEUE_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(MESSAGE_QUEUE)) fs.writeFileSync(MESSAGE_QUEUE, JSON.stringify([]));
if (!fs.existsSync(RESPONSE_QUEUE)) fs.writeFileSync(RESPONSE_QUEUE, JSON.stringify([]));

const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

async function registerPlugins() {
  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
    attachFieldsToBody: true
  });
  await app.register(staticPlugin, { root: path.join(__dirname, 'public'), prefix: '/' });
  await app.register(staticPlugin, { root: UPLOAD_DIR, prefix: '/uploads/' });
}

function readQueue(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeQueue(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

app.post('/api/send', async (req, reply) => {
  try {
    const { content, sessionId } = req.body || {};
    const queue = readQueue(MESSAGE_QUEUE);
    const message = {
      id: uuidv4(),
      type: 'text',
      content: content || '',
      sessionId: sessionId || 'default',
      timestamp: new Date().toISOString()
    };
    queue.push(message);
    writeQueue(MESSAGE_QUEUE, queue);
    return { success: true, messageId: message.id };
  } catch (err) {
    reply.code(500);
    return { success: false, error: err.message };
  }
});

app.post('/api/upload', async (req, reply) => {
  try {
    const data = await req.file();
    if (!data || !allowedTypes.includes(data.mimetype)) {
      reply.code(400);
      return { success: false, error: 'Invalid file type' };
    }
    const ext = path.extname(data.filename);
    const filename = `${uuidv4()}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    
    const writeStream = fs.createWriteStream(filepath);
    data.file.pipe(writeStream);
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const queue = readQueue(MESSAGE_QUEUE);
    const content = req.body?.content || '';
    const sessionId = req.body?.sessionId || 'default';
    
    const message = {
      id: uuidv4(),
      type: 'attachment',
      content,
      attachment: {
        filename: data.filename,
        path: `/uploads/${filename}`,
        mimetype: data.mimetype,
        size: fs.statSync(filepath).size
      },
      sessionId,
      timestamp: new Date().toISOString()
    };
    queue.push(message);
    writeQueue(MESSAGE_QUEUE, queue);
    
    return { success: true, messageId: message.id, path: message.attachment.path };
  } catch (err) {
    reply.code(500);
    return { success: false, error: err.message };
  }
});

app.get('/api/poll', async (req, reply) => {
  try {
    const lastId = req.query.lastId;
    const responses = readQueue(RESPONSE_QUEUE);
    const newResponses = lastId
      ? responses.filter(r => r.id > lastId)
      : responses;
    return { success: true, responses: newResponses };
  } catch (err) {
    reply.code(500);
    return { success: false, error: err.message };
  }
});

app.delete('/api/clear', async (req, reply) => {
  try {
    writeQueue(MESSAGE_QUEUE, []);
    writeQueue(RESPONSE_QUEUE, []);
    return { success: true };
  } catch (err) {
    reply.code(500);
    return { success: false, error: err.message };
  }
});

app.get('/api/status', async (req, reply) => {
  const msgQueue = readQueue(MESSAGE_QUEUE);
  const respQueue = readQueue(RESPONSE_QUEUE);
  return {
    success: true,
    status: 'online',
    pendingMessages: msgQueue.length,
    pendingResponses: respQueue.length
  };
});

app.get('*', async (req, reply) => {
  return reply.sendFile('index.html');
});

async function start() {
  await registerPlugins();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🎙️ Jess Remote Chat running on http://0.0.0.0:${PORT}`);
  console.log(`📱 Access via Tailscale IP on port ${PORT}`);
}

start().catch(err => {
  app.log.error(err);
  process.exit(1);
});
