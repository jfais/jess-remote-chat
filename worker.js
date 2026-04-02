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
const CONVERSATION_FILE = path.join(QUEUE_DIR, 'conversation.json');

const SAVE_KEYWORDS = ['save', 'project', 'commit', 'git', 'memory', 'important', 'remember', 'todo', 'wip', 'bug', 'fix', 'feature', 'new project', 'complete', 'finish'];

const AUTO_SAVE_THRESHOLDS = {
  messageCount: 10,
  activeMinutes: 15
};

let settings = loadSettings();
let pollInterval = settings.pollInterval || 2000;

let conversationState = {
  startTime: null,
  lastActivityTime: null,
  messageCount: 0,
  messages: [],
  saved: true
};

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

function initConversation() {
  if (!fs.existsSync(CONVERSATION_FILE)) {
    writeQueue(CONVERSATION_FILE, conversationState);
  } else {
    conversationState = readQueue(CONVERSATION_FILE);
  }
}

function updateConversation(msg, isUser = true) {
  conversationState.lastActivityTime = new Date().toISOString();
  
  if (isUser) {
    if (!conversationState.startTime) {
      conversationState.startTime = new Date().toISOString();
      conversationState.saved = false;
    }
    conversationState.messageCount++;
    conversationState.messages.push({
      role: 'user',
      content: msg.content,
      timestamp: msg.timestamp
    });
  } else {
    conversationState.messages.push({
      role: 'jess',
      content: msg.content,
      timestamp: msg.timestamp
    });
  }
  
  writeQueue(CONVERSATION_FILE, conversationState);
}

function shouldAutoSave() {
  if (conversationState.saved || conversationState.messages.length === 0) {
    return false;
  }
  
  const now = new Date();
  const startTime = new Date(conversationState.startTime);
  const activeMinutes = (now - startTime) / (1000 * 60);
  
  if (conversationState.messageCount >= AUTO_SAVE_THRESHOLDS.messageCount) {
    console.log(`[SAVE] Auto-save triggered: ${conversationState.messageCount} messages`);
    return true;
  }
  
  if (activeMinutes >= AUTO_SAVE_THRESHOLDS.activeMinutes) {
    console.log(`[SAVE] Auto-save triggered: ${activeMinutes.toFixed(0)} minutes active`);
    return true;
  }
  
  return false;
}

function containsSaveKeyword(content) {
  if (!content) return false;
  const lower = content.toLowerCase();
  return SAVE_KEYWORDS.some(keyword => lower.includes(keyword));
}

function shouldSaveNow(content) {
  if (!content) return false;
  const lower = content.toLowerCase();
  return lower.includes('save') || lower.includes('save conversation') || lower.includes('jess save');
}

function formatConversationForMemoryCore() {
  const state = conversationState;
  if (state.messages.length === 0) return null;
  
  const date = new Date().toISOString().split('T')[0];
  const startTime = new Date(state.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const endTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  
  let content = `# 📅 Daily Diary - ${date} (Remote Chat Session)\n\n`;
  content += `## Session Info\n`;
  content += `- **Date**: ${date}\n`;
  content += `- **Time**: ${startTime} - ${endTime}\n`;
  content += `- **Mode**: Remote Chat (jess-remote-chat)\n`;
  content += `- **Messages**: ${state.messages.length}\n\n`;
  
  content += `## Conversation Summary\n\n`;
  
  let userMsgs = state.messages.filter(m => m.role === 'user');
  let summary = userMsgs.slice(-5).map(m => `- **You**: ${m.content.substring(0, 150)}${m.content.length > 150 ? '...' : ''}`).join('\n');
  content += summary + '\n\n';
  
  content += `## Full Conversation\n\n`;
  
  state.messages.forEach(msg => {
    const time = new Date(msg.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (msg.role === 'user') {
      content += `**You** (${time}): ${msg.content}\n\n`;
    } else {
      content += `**Jess** (${time}): ${msg.content}\n\n`;
    }
  });
  
  content += `---\n\n`;
  content += `*Saved from jess-remote-chat on ${date} at ${endTime}*\n`;
  
  return content;
}

function triggerSave(callback) {
  console.log('[SAVE] Preparing to save conversation...');
  
  const formatted = formatConversationForMemoryCore();
  if (!formatted) {
    console.log('[SAVE] No messages to save');
    return;
  }
  
  const date = new Date().toISOString().split('T')[0];
  const filename = `remote-${date}-${Date.now()}.md`;
  const diaryPath = path.join(settings.memoryPath, 'daily-diary', filename);
  
  try {
    fs.writeFileSync(diaryPath, formatted, 'utf8');
    console.log(`[SAVE] ✅ Saved to ${diaryPath}`);
    
    conversationState.saved = true;
    conversationState.messages = [];
    conversationState.startTime = null;
    conversationState.messageCount = 0;
    writeQueue(CONVERSATION_FILE, conversationState);
    
    callback(null, `✅ Conversation saved to MemoryCore as ${filename}`);
  } catch (err) {
    console.error('[SAVE] Error:', err);
    callback(err.message, null);
  }
}

function processCliCommand(cli, message, callback) {
  let command, args, cwd;
  
  if (cli === 'kilo') {
    command = 'kilo';
    args = ['run'];
    cwd = settings.memoryPath || process.cwd();
  } else if (cli === 'claude') {
    command = 'claude';
    args = ['-p', buildClaudePrompt(message, settings.memoryPath)];
    cwd = process.cwd();
  } else if (cli === 'opencode') {
    command = 'opencode';
    args = [message.content];
    cwd = process.cwd();
  } else {
    command = 'kilo';
    args = ['run'];
    cwd = settings.memoryPath || process.cwd();
  }
  
  console.log(`[${new Date().toISOString()}] Processing with ${cli}...`);
  
  const proc = spawn(command, args, {
    cwd: cwd,
    stdio: cli === 'kilo' ? [ 'pipe', 'pipe', 'pipe' ] : [ 'ignore', 'pipe', 'pipe' ]
  });
  
  if (cli === 'kilo') {
    proc.stdin.write(message.content + '\n');
    proc.stdin.end();
  }

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

async function processMessage(message) {
  const isUserMessage = !message.sender || message.sender === 'user' || message.type === 'text';
  
  if (isUserMessage) {
    updateConversation(message, true);
    
    if (shouldSaveNow(message.content)) {
      console.log('[SAVE] Manual save requested');
      return new Promise((resolve) => {
        triggerSave((err, saveMsg) => {
          processCliCommand(settings.cli, message, (cliErr, response) => {
            const fullResponse = err 
              ? `I tried to save but encountered an error: ${err}`
              : `${response}\n\n${saveMsg}`;
            
            resolve({
              id: uuidv4(),
              sender: 'jess',
              content: fullResponse,
              originalId: message.id,
              timestamp: new Date().toISOString()
            });
          });
        });
      });
    }
    
    if (shouldAutoSave() || containsSaveKeyword(message.content)) {
      console.log('[SAVE] Auto-save condition detected, saving...');
      triggerSave(() => {});
    }
  }
  
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
        const resp = {
          id: uuidv4(),
          sender: 'jess',
          content: response || 'No response generated.',
          originalId: message.id,
          timestamp: new Date().toISOString()
        };
        
        if (isUserMessage) {
          updateConversation(resp, false);
        }
        
        resolve(resp);
      }
    });
  });
}

async function main() {
  initConversation();
  
  console.log('🎙️ Jess Remote Chat Worker (with Auto-Save)');
  console.log(`📋 Using CLI: ${settings.cli}`);
  console.log(`📁 MemoryCore: ${settings.memoryPath}`);
  console.log(`⏱️ Poll Interval: ${pollInterval}ms`);
  console.log(`📊 Auto-Save: ${AUTO_SAVE_THRESHOLDS.messageCount} messages OR ${AUTO_SAVE_THRESHOLDS.activeMinutes} minutes`);
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
  if (!conversationState.saved && conversationState.messages.length > 0) {
    console.log('[SAVE] Saving unsaved conversation before exit...');
    triggerSave(() => {
      console.log('👋 Goodbye!');
      process.exit(0);
    });
  } else {
    console.log('👋 Goodbye!');
    process.exit(0);
  }
});

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
