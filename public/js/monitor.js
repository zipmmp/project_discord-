class SessionMonitor {
  constructor() {
    this.sessionId = new URLSearchParams(window.location.search).get('monitor');
    this.pingInterval = null;
    this.logs = document.getElementById('logs');
    
    if (!this.sessionId) {
      window.location.href = '/';
      return;
    }
    
    this.startMonitoring();
  }
  
  startMonitoring() {
    // Start pinging the server to keep session alive
    this.pingInterval = setInterval(() => {
      this.pingServer();
    }, 2 * 60 * 1000); // Ping every 2 minutes
    
    // Ping immediately
    this.pingServer();
    
    // Also start checking session status
    this.checkSessionStatus();
    setInterval(() => this.checkSessionStatus(), 10000); // Check every 10 seconds
    
    // Add event listeners to ping on user activity
    document.addEventListener('mousemove', () => this.pingServer());
    document.addEventListener('keydown', () => this.pingServer());
  }
  
  async pingServer() {
    try {
      const response = await fetch('/ping', {
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
        throw new Error(data.error || 'Ping failed');
      }
      
      this.addLog(`Session kept alive at ${new Date(data.timestamp).toLocaleTimeString()}`, 'success');
      
    } catch (error) {
      this.addLog(`Ping failed: ${error.message}`, 'error');
    }
  }
  
  async checkSessionStatus() {
    try {
      const response = await fetch(`/status/${this.sessionId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Status check failed');
      }
      
      // Update logs
      if (data.logs && data.logs.length > 0) {
        data.logs.forEach(log => {
          this.addLog(log.message, log.level);
        });
      }
      
      if (!data.isActive) {
        this.addLog('Session is no longer active', 'warning');
        clearInterval(this.pingInterval);
      }
      
    } catch (error) {
      this.addLog(`Status check failed: ${error.message}`, 'error');
    }
  }
  
  addLog(message, level = 'info') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${level}`;
    logEntry.innerHTML = `
      <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
      ${message}
    `;
    this.logs.prepend(logEntry);
    
    // Keep a reasonable number of logs
    if (this.logs.children.length > 50) {
      this.logs.removeChild(this.logs.lastChild);
    }
  }
}

// Initialize monitor when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new SessionMonitor();
});
