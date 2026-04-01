const API_BASE = '';
const POLL_INTERVAL = 2000;
const MAX_RETRIES = 3;

let sessionId = localStorage.getItem('jessSessionId') || crypto.randomUUID();
localStorage.setItem('jessSessionId', sessionId);

let messages = JSON.parse(localStorage.getItem('jessMessages') || '[]');
let lastResponseId = localStorage.getItem('jessLastResponseId') || '0';
let pendingFile = null;
let isConnected = false;
let pollTimer = null;
let retryCount = 0;

const elements = {
  app: document.getElementById('app'),
  messages: document.getElementById('messages'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  charCount: document.getElementById('charCount'),
  clearBtn: document.getElementById('clearBtn'),
  themeToggle: document.getElementById('themeToggle'),
  statusIndicator: document.getElementById('statusIndicator'),
  typingIndicator: document.getElementById('typingIndicator'),
  scrollBottom: document.getElementById('scrollBottom'),
  chatContainer: document.getElementById('chatContainer'),
  attachmentPreview: document.getElementById('attachmentPreview'),
  fileInput: document.getElementById('fileInput')
};

function init() {
  loadTheme();
  loadMessages();
  setupEventListeners();
  checkConnection();
  startPolling();
}

function loadTheme() {
  const saved = localStorage.getItem('jessTheme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('jessTheme', next);
}

function loadMessages() {
  if (messages.length === 0) {
    renderEmptyState();
  } else {
    messages.forEach(renderMessage);
  }
  scrollToBottom();
}

function saveMessages() {
  localStorage.setItem('jessMessages', JSON.stringify(messages));
}

function renderEmptyState() {
  elements.messages.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
      </svg>
      <p>Start a conversation with Jess</p>
    </div>
  `;
}

function renderMessage(msg) {
  const emptyState = elements.messages.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const isUser = msg.sender === 'user';
  const div = document.createElement('div');
  div.className = `message ${isUser ? 'user' : 'jess'}`;
  div.dataset.id = msg.id;

  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const content = isUser ? escapeHtml(msg.content) : renderMarkdown(msg.content);

  let attachmentHtml = '';
  if (msg.attachment) {
    attachmentHtml = renderAttachment(msg.attachment);
  }

  div.innerHTML = `
    <div class="message-header">
      <span>${isUser ? 'You' : 'Jess'}</span>
      <span>·</span>
      <span>${time}</span>
    </div>
    ${attachmentHtml}
    <div class="message-content">${content}</div>
    ${!isUser ? '<button class="copy-btn" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>' : ''}
  `;

  if (!isUser) {
    div.querySelector('.copy-btn')?.addEventListener('click', () => copyMessage(div.querySelector('.copy-btn'), msg.content));
  }

  elements.messages.appendChild(div);
  return div;
}

function renderAttachment(att) {
  if (att.mimetype.startsWith('image/')) {
    return `<img src="${att.path}" alt="${att.filename}" class="attachment-thumbnail" style="margin-bottom: 8px; border-radius: 8px; max-width: 200px;">`;
  }
  return `<div class="attachment-item" style="margin-bottom: 8px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg><span>${escapeHtml(att.filename)}</span></div>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(text) {
  if (!text) return '';
  
  let html = text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<strong>$1</strong>')
    .replace(/^# (.+)$/gm, '<strong>$1</strong>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  
  return `<p>${html}</p>`;
}

function copyMessage(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
    }, 2000);
  });
}

function scrollToBottom() {
  setTimeout(() => {
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
  }, 50);
}

function checkScrollPosition() {
  const { scrollTop, scrollHeight, clientHeight } = elements.chatContainer;
  elements.scrollBottom.classList.toggle('visible', scrollHeight - scrollTop - clientHeight > 100);
}

async function checkConnection() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    if (res.ok) {
      isConnected = true;
      retryCount = 0;
      elements.statusIndicator.className = 'status-indicator online';
    } else {
      throw new Error('Server error');
    }
  } catch {
    isConnected = false;
    elements.statusIndicator.className = 'status-indicator';
    scheduleRetry();
  }
}

function scheduleRetry() {
  if (retryCount < MAX_RETRIES) {
    retryCount++;
    setTimeout(checkConnection, 2000 * retryCount);
  }
}

function startPolling() {
  poll();
  pollTimer = setInterval(poll, POLL_INTERVAL);
}

async function poll() {
  if (!isConnected) return;

  try {
    elements.statusIndicator.classList.add('connecting');
    const res = await fetch(`${API_BASE}/api/poll?lastId=${lastResponseId}`);
    const data = await res.json();

    if (data.success && data.responses.length > 0) {
      data.responses.forEach(resp => {
        messages.push(resp);
        renderMessage(resp);
        lastResponseId = resp.id;
        localStorage.setItem('jessLastResponseId', lastResponseId);
      });
      saveMessages();
      scrollToBottom();
      hideTyping();
    }

    elements.statusIndicator.classList.remove('connecting');
    if (isConnected) elements.statusIndicator.classList.add('online');
  } catch {
    elements.statusIndicator.classList.remove('connecting');
  }
}

function showTyping() {
  elements.typingIndicator.classList.add('visible');
  scrollToBottom();
}

function hideTyping() {
  elements.typingIndicator.classList.remove('visible');
}

async function sendMessage() {
  const content = elements.messageInput.value.trim();
  
  if (!content && !pendingFile) return;
  if (!isConnected) {
    alert('Not connected to server');
    return;
  }

  const msg = {
    id: crypto.randomUUID(),
    sender: 'user',
    type: pendingFile ? 'attachment' : 'text',
    content,
    timestamp: new Date().toISOString()
  };

  if (pendingFile) {
    msg.attachment = pendingFile;
  }

  messages.push(msg);
  renderMessage(msg);
  saveMessages();
  scrollToBottom();

  elements.messageInput.value = '';
  elements.charCount.textContent = '0/5000';
  resetTextarea();
  clearAttachment();
  showTyping();

  try {
    if (pendingFile) {
      const formData = new FormData();
      formData.append('file', pendingFile.file);
      formData.append('content', content);
      formData.append('sessionId', sessionId);
      await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
    } else {
      await fetch(`${API_BASE}/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, sessionId })
      });
    }
  } catch (err) {
    console.error('Send error:', err);
    hideTyping();
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    alert('Only images and PDFs are allowed');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    alert('File size must be under 10MB');
    return;
  }

  pendingFile = {
    file,
    filename: file.name,
    size: file.size,
    type: file.type
  };

  renderAttachmentPreview();
}

function renderAttachmentPreview() {
  if (!pendingFile) {
    elements.attachmentPreview.classList.remove('has-file');
    return;
  }

  elements.attachmentPreview.classList.add('has-file');
  
  let preview = '';
  if (pendingFile.type.startsWith('image/')) {
    const url = URL.createObjectURL(pendingFile.file);
    preview = `<img src="${url}" class="attachment-thumbnail" alt="Preview">`;
  } else {
    preview = `<div class="attachment-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg></div>`;
  }

  elements.attachmentPreview.innerHTML = `
    <div class="attachment-item">
      ${preview}
      <div class="attachment-info">
        <div class="attachment-name">${escapeHtml(pendingFile.filename)}</div>
        <div class="attachment-size">${formatSize(pendingFile.size)}</div>
      </div>
      <button class="attachment-remove" id="removeAttachment">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `;

  document.getElementById('removeAttachment')?.addEventListener('click', clearAttachment);
}

function clearAttachment() {
  pendingFile = null;
  elements.fileInput.value = '';
  elements.attachmentPreview.classList.remove('has-file');
  elements.attachmentPreview.innerHTML = '';
}

function resetTextarea() {
  elements.messageInput.style.height = 'auto';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function autoResizeTextarea() {
  elements.messageInput.style.height = 'auto';
  elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 120) + 'px';
}

async function clearChat() {
  if (!confirm('Clear all messages?')) return;
  
  messages = [];
  lastResponseId = '0';
  localStorage.removeItem('jessMessages');
  localStorage.removeItem('jessLastResponseId');
  
  elements.messages.innerHTML = '';
  renderEmptyState();
  
  try {
    await fetch(`${API_BASE}/api/clear`, { method: 'DELETE' });
  } catch (err) {
    console.error('Clear error:', err);
  }
}

function setupEventListeners() {
  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.clearBtn.addEventListener('click', clearChat);
  elements.sendBtn.addEventListener('click', sendMessage);
  elements.fileInput.addEventListener('change', handleFileSelect);
  
  elements.messageInput.addEventListener('input', () => {
    const len = elements.messageInput.value.length;
    elements.charCount.textContent = `${len}/5000`;
    autoResizeTextarea();
  });

  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  elements.chatContainer.addEventListener('scroll', checkScrollPosition);
  elements.scrollBottom.addEventListener('click', scrollToBottom);

  elements.statusIndicator.classList.add('connecting');
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(pollTimer);
    } else {
      checkConnection();
      startPolling();
    }
  });
}

init();
