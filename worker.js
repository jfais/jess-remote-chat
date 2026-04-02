import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QUEUE_DIR = path.join(__dirname, 'queue');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const MESSAGE_QUEUE = path.join(QUEUE_DIR, 'message-queue.json');
const RESPONSE_QUEUE = path.join(QUEUE_DIR, 'response-queue.json');

if (!fs.existsSync(QUEUE_DIR)) fs.mkdirSync(QUEUE_DIR, { recursive: true });
if (!fs.existsSync(MESSAGE_QUEUE)) fs.writeFileSync(MESSAGE_QUEUE, JSON.stringify([]));
if (!fs.existsSync(RESPONSE_QUEUE)) fs.writeFileSync(RESPONSE_QUEUE, JSON.stringify([]));

let settings = loadSettings();
let pollInterval = settings.pollInterval || 2000;

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {
      cli: 'kilo',
      memoryPath: '/home/spsadmin/www/MemoryCore',
      pollInterval: 2000
    };
  }
}

function readQueue(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeQueue(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function processCliCommand(cli, message, callback) {
  const cliCommands = {
    kilo: {
      command: 'kilo',
      args: ['ask', message.content],
      cwd: process.cwd()
    },
    claude: {
      command: 'claude',
      args: ['-p', buildClaudePrompt(message, settings.memoryPath)],
      cwd: process.cwd()
    },
    opencode: {
      command: 'opencode',
      args: [message.content],
      cwd: process.cwd()
    }
  };

  const cliConfig = cliCommands[cli] || cliCommands.kilo;
  
  console.log(`[${new Date().toISOString()}] Processing with ${cli}...`);
  
  const proc = spawn(cliConfig.command, cliConfig.args, {
    cwd: cliConfig.cwd,
    shell: true,
    env: { ...process.env, MEMORY_CORE_PATH: settings.memoryPath }
  });

  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  proc.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  proc.on('close', (code) => {
    if (code === 0) {
      callback(null, stdout.trim());
    } else {
      console.error(`[${cli}] Error:`, stderr);
      callback(stderr || `Process exited with code ${code}`);
    }
  });

  proc.on('error', (err) => {
    callback(err.message);
  });
}

function buildClaudePrompt(message, memoryPath) {
  let prompt = `You are Jess. Your MemoryCore is at: ${memoryPath}\n\n`;
  prompt += `Today's date: ${new Date().toLocaleDateString()}\n\n`;
  
  if (message.content) {
    prompt += `User message: ${message.content}\n\n`;
  }
  
  if (message.attachment) {
    prompt += `Attachment: ${message.attachment.filename} (${message.attachment.mimetype})\n`;
    if (message.attachment.mimetype.startsWith('image/')) {
      prompt += `Image file uploaded at: ${path.join(__dirname, 'uploads', path.basename(message.attachment.path))}\n`;
    } else {
      prompt += `File uploaded at: ${path.join(__dirname, 'uploads', path.basename(message.attachment.path))}\n`;
    }
  }
  
  prompt += `\nPlease respond as Jess would, being helpful, friendly, and supportive.`;
  return prompt;
}

function processMessage(message) {
  return new Promise((resolve, reject) => {
    processCliCommand(settings.cli, message, (err, response) => {
      if (err) {
        resolve({
          id: uuidv4(),
          sender: 'jess',
          content: `Error: ${err}`,
          originalId: message.id,
          timestamp: new Date().toISOString()
        });
      } else {
        resolve({
          id: uuidv4(),
          sender: 'jess',
          content: response || 'No response generated.',
          originalId: message.id,
          timestamp: new Date().toISOString()
        });
      }
    });
  });
}

async function main() {
  console.log('🎙️ Jess Remote Chat Worker');
  console.log(`📋 Using CLI: ${settings.cli}`);
  console.log(`📁 MemoryCore: ${settings.memoryPath}`);
  console.log(`⏱️ Poll Interval: ${pollInterval}ms`);
  console.log('---');

  while (true) {
    try {
      const messages = readQueue(MESSAGE_QUEUE);
      
      if (messages.length > 0) {
        const message = messages[0];
        console.log(`[${new Date().toISOString()}] Processing message: ${message.id}`);
        console.log(`  Content: ${message.content?.substring(0, 100)}${message.content?.length > 100 ? '...' : ''}`);
        
        const response = await processMessage(message);
        
        const responses = readQueue(RESPONSE_QUEUE);
        responses.push(response);
        writeQueue(RESPONSE_QUEUE, responses);
        
        writeQueue(MESSAGE_QUEUE, messages.slice(1));
        console.log(`[${new Date().toISOString()}] Response written: ${response.id}`);
        console.log('---');
      }
    } catch (err) {
      console.error('Worker error:', err);
    }
    
    settings = loadSettings();
    pollInterval = settings.pollInterval || 2000;
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}

process.on('SIGINT', () => {
  console.log('\n👋 Worker shutting down...');
  process.exit(0);
});

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
