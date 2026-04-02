const API_BASE = '';

let settings = {};

const elements = {
  statusMsg: document.getElementById('statusMsg'),
  saveBtn: document.getElementById('saveBtn'),
  themeToggle: document.getElementById('themeToggle'),
  currentCli: document.getElementById('currentCli'),
  memoryPath: document.getElementById('memoryPath'),
  pollInterval: document.getElementById('pollInterval'),
  cliOptions: document.querySelectorAll('.cli-option')
};

function init() {
  loadTheme();
  loadSettings();
  setupEventListeners();
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

async function loadSettings() {
  try {
    const res = await fetch(`${API_BASE}/api/settings`);
    const data = await res.json();
    
    if (data.success) {
      settings = data.settings;
      applySettings(settings);
    }
  } catch (err) {
    showStatus('Failed to load settings', 'error');
  }
}

function applySettings(s) {
  elements.memoryPath.value = s.memoryPath || '';
  elements.pollInterval.value = s.pollInterval || 2000;
  
  elements.cliOptions.forEach(opt => {
    const cli = opt.dataset.cli;
    opt.classList.toggle('selected', cli === s.cli);
    opt.querySelector('input').checked = cli === s.cli;
  });
  
  elements.currentCli.textContent = getCliLabel(s.cli);
}

function getCliLabel(cli) {
  const labels = {
    kilo: 'Kilo CLI (Jess)',
    claude: 'Claude Code',
    opencode: 'OpenCode'
  };
  return labels[cli] || cli;
}

function showStatus(msg, type) {
  elements.statusMsg.textContent = msg;
  elements.statusMsg.className = `status-msg ${type}`;
  setTimeout(() => {
    elements.statusMsg.className = 'status-msg';
  }, 3000);
}

async function saveSettings() {
  elements.saveBtn.disabled = true;
  elements.saveBtn.textContent = 'Saving...';

  const newSettings = {
    memoryPath: elements.memoryPath.value.trim(),
    pollInterval: parseInt(elements.pollInterval.value) || 2000,
    cli: document.querySelector('input[name="cli"]:checked')?.value || 'kilo'
  };

  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings)
    });
    
    const data = await res.json();
    
    if (data.success) {
      settings = data.settings;
      applySettings(settings);
      showStatus('Settings saved successfully!', 'success');
    } else {
      showStatus(data.error || 'Failed to save settings', 'error');
    }
  } catch (err) {
    showStatus('Failed to save settings', 'error');
  }

  elements.saveBtn.disabled = false;
  elements.saveBtn.textContent = 'Save Settings';
}

function setupEventListeners() {
  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.saveBtn.addEventListener('click', saveSettings);
  
  elements.cliOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      elements.cliOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      opt.querySelector('input').checked = true;
      elements.currentCli.textContent = getCliLabel(opt.dataset.cli);
    });
  });
}

init();
