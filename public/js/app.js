class DiscordSender24_7 {
  constructor() {
    this.sessionId = null;
    this.isSending = false;
    this.is24_7Mode = false;
    this.monitorUrl = '';
    this.statusCheckInterval = null;
    this.elements = {};
    
    this.initApp();
  }
  
  initApp() {
    this.cacheElements();
    this.setupEventListeners();
    
    // Check for existing session
    this.checkExistingSession();
  }
  
  cacheElements() {
    this.elements = {
      startBtn: document.getElementById('startBtn'),
      stopBtn: document.getElementById('stopBtn'),
      copyBtn: document.getElementById('copyBtn'),
      status: document.getElementById('status'),
      logs: document.getElementById('logs'),
      monitorLink: document.getElementById('monitorLink'),
      monitorLinkContainer: document.getElementById('monitorLinkContainer'),
      autoResumeCheckbox: document.getElementById('autoResumeCheckbox'),
      enable24_7Checkbox: document.getElementById('enable24_7Checkbox'),
      inactivityTime: document.getElementById('inactivityTime'),
      tabButtons: document.querySelectorAll('.tab-button'),
      tabContents: document.querySelectorAll('.tab-content'),
      inputs: {
        channelId: document.getElementById('channelId'),
        token: document.getElementById('token'),
        message: document.getElementById('message'),
        delay: document.getElementById('delay'),
        retries: document.getElementById('retries')
      }
    };
  }
  
  setupEventListeners() {
    this.elements.startBtn.addEventListener('click', () => this.startSending());
    this.elements.stopBtn.addEventListener('click', () => this.stopSending());
    this.elements.copyBtn.addEventListener('click', () => this.copyMonitorUrl());
    
    this.elements.autoResumeCheckbox.addEventListener('change', (e) => {
      this.updateConfig({ autoResume: e.target.checked });
    });
    
    this.elements.enable24_7Checkbox.addEventListener('change', (e) => {
      this.is24_7Mode = e.target.checked;
      this.updateConfig({ is24_7Mode: e.target.checked });
      
      if (this.is24_7Mode && this.isSending) {
        this.generateAndDisplayMonitorUrl();
      } else {
        this.elements.monitorLinkContainer.style.display = 'none';
      }
    });
    
    this.elements.inactivityTime.addEventListener('change', (e) => {
      this.updateConfig({ inactivityTime: parseInt(e.target.value) });
    });
    
    // Tab switching
    this.elements.tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.getAttribute('data-tab');
        this.switchTab(tabName);
      });
    });
  }
  
  checkExistingSession() {
    // In a real app, you would check with the server
    // This is just a placeholder
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('monitor')) {
      // This is a monitor page, handled by the server
      return;
    }
  }
  
  async startSending() {
    const { channelId, token, message, delay, retries } = this.elements.inputs;
    
    // Validate inputs
    if (!channelId.value.trim() || !token.value.trim() || !message.value.trim()) {
      this.addLog('All fields are required', 'error');
      return;
    }
    
    try {
      const response = await fetch('/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId: channelId.value.trim(),
          token: token.value.trim(),
          message: message.value.trim(),
          delay: delay.value,
          retries: retries.value,
          autoResume: this.elements.autoResumeCheckbox.checked,
          is24_7Mode: this.elements.enable24_7Checkbox.checked,
          inactivityTime: this.elements.inactivityTime.value,
          currentTab: document.querySelector('.tab-button.active').getAttribute('data-tab')
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start sending');
      }
      
      this.sessionId = data.sessionId;
      this.isSending = true;
      this.updateUI(true);
      
      this.addLog('Started sending messages', 'success');
      
      if (this.elements.enable24_7Checkbox.checked) {
        this.monitorUrl = data.monitorUrl;
        this.generateAndDisplayMonitorUrl();
      }
      
      // Start checking status
      this.startStatusChecker();
      
    } catch (error) {
      this.addLog(`Failed to start: ${error.message}`, 'error');
    }
  }
  
  async stopSending() {
    if (!this.sessionId) return;
    
    try {
      const response = await fetch('/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.sessionId
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to stop sending');
      }
      
      this.isSending = false;
      this.sessionId = null;
      this.updateUI(false);
      this.elements.monitorLinkContainer.style.display = 'none';
      
      this.addLog('Stopped sending messages', 'warning');
      
      // Stop checking status
      this.stopStatusChecker();
      
    } catch (error) {
      this.addLog(`Failed to stop: ${error.message}`, 'error');
    }
  }
  
  startStatusChecker() {
    if (this.statusCheckInterval) clearInterval(this.statusCheckInterval);
    
    this.statusCheckInterval = setInterval(async () => {
      if (!this.sessionId) return;
      
      try {
        const response = await fetch(`/status/${this.sessionId}`);
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to check status');
        }
        
        // Update logs
        if (data.logs && data.logs.length > 0) {
          data.logs.forEach(log => {
            this.addLog(log.message, log.level);
          });
        }
        
        // Check if session is still active
        if (!data.isActive && this.isSending) {
          this.addLog('Session stopped by server', 'warning');
          this.stopSending();
        }
        
      } catch (error) {
        console.error('Status check failed:', error);
      }
    }, 3000); // Check every 3 seconds
  }
  
  stopStatusChecker() {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }
  }
  
  generateAndDisplayMonitorUrl() {
    this.elements.monitorLink.textContent = this.monitorUrl;
    this.elements.monitorLinkContainer.style.display = 'block';
    this.elements.copyBtn.disabled = false;
    
    this.addLog('24/7 monitor URL generated', 'info');
    this.addLog(`Copy this URL to your monitoring service: ${this.monitorUrl}`, 'info');
  }
  
  copyMonitorUrl() {
    navigator.clipboard.writeText(this.monitorUrl).then(() => {
      this.addLog('Copied monitor URL to clipboard', 'success');
    }).catch(err => {
      this.addLog('Failed to copy URL: ' + err, 'error');
    });
  }
  
  updateUI(active) {
    this.isSending = active;
    this.elements.startBtn.disabled = active;
    this.elements.stopBtn.disabled = !active;
    this.elements.status.textContent = `Status: ${active ? 'Active' : 'Inactive'}`;
    this.elements.status.className = active ? 'status-active' : 'status-inactive';
  }
  
  addLog(message, level = 'info') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${level}`;
    logEntry.innerHTML = `
      <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
      ${message}
    `;
    this.elements.logs.prepend(logEntry);
    
    // Keep a reasonable number of logs
    if (this.elements.logs.children.length > 50) {
      this.elements.logs.removeChild(this.elements.logs.lastChild);
    }
  }
  
  switchTab(tabName) {
    // Update UI
    this.elements.tabButtons.forEach(button => {
      button.classList.toggle('active', button.getAttribute('data-tab') === tabName);
    });
    
    this.elements.tabContents.forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}Tab`);
    });
    
    // Save to server
    this.updateConfig({ currentTab: tabName });
  }
  
  async updateConfig(config) {
    try {
      await fetch('/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
      });
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new DiscordSender24_7();
});
