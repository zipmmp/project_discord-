const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const CONFIG = {
  MAX_INACTIVITY: 15 * 60 * 1000, // 15 minutes
  SESSION_SECRET: 'your-secret-key-here',
  SESSION_NAME: 'discordSender24_7',
  APP_VERSION: '4.0.0-24-7-node',
  DEFAULT_DELAY: 5, // seconds
  DEFAULT_RETRIES: 2,
};

// In-memory storage (in a real app, use a database)
const activeSessions = {};
const sessionLogs = {};

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: CONFIG.SESSION_SECRET,
  name: CONFIG.SESSION_NAME,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Set view engine to EJS
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Routes
app.get('/', (req, res) => {
  const monitorSession = req.query.monitor;
  
  if (monitorSession && activeSessions[monitorSession]) {
    return res.render('monitor', { 
      sessionId: monitorSession,
      status: 'active',
      appVersion: CONFIG.APP_VERSION
    });
  }
  
  res.render('index', {
    appVersion: CONFIG.APP_VERSION,
    autoResume: req.session.autoResume !== false,
    is24_7Mode: req.session.is24_7Mode || false,
    inactivityTime: req.session.inactivityTime || 15,
    currentTab: req.session.currentTab || 'sender'
  });
});

app.post('/start', async (req, res) => {
  const { channelId, token, message, delay, retries } = req.body;
  
  // Validate inputs
  if (!channelId || !token || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  const sessionId = uuidv4();
  const delayMs = (parseInt(delay) || CONFIG.DEFAULT_DELAY) * 1000;
  const maxRetries = parseInt(retries) || CONFIG.DEFAULT_RETRIES;
  
  // Save session data
  req.session.senderConfig = {
    channelId,
    token,
    message,
    delay: delayMs,
    retries: maxRetries,
    isActive: true,
    sessionId,
    startedAt: new Date()
  };
  
  // Save app config
  req.session.autoResume = req.body.autoResume === 'true';
  req.session.is24_7Mode = req.body.is24_7Mode === 'true';
  req.session.inactivityTime = parseInt(req.body.inactivityTime) || 15;
  req.session.currentTab = req.body.currentTab || 'sender';
  
  // Create session in memory
  activeSessions[sessionId] = {
    config: req.session.senderConfig,
    lastActivity: Date.now(),
    isRunning: true,
    logs: []
  };
  
  // Start sending messages
  startSendingMessages(sessionId);
  
  // Generate monitor URL
  const monitorUrl = `${req.protocol}://${req.get('host')}/?monitor=${sessionId}`;
  
  res.json({
    success: true,
    sessionId,
    monitorUrl,
    message: 'Started sending messages'
  });
});

app.post('/stop', (req, res) => {
  const { sessionId } = req.body;
  
  if (!sessionId || !activeSessions[sessionId]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Stop the session
  activeSessions[sessionId].isRunning = false;
  delete activeSessions[sessionId];
  
  if (req.session.senderConfig && req.session.senderConfig.sessionId === sessionId) {
    req.session.senderConfig.isActive = false;
  }
  
  res.json({ success: true, message: 'Stopped sending messages' });
});

app.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!activeSessions[sessionId]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    isActive: activeSessions[sessionId].isRunning,
    lastActivity: activeSessions[sessionId].lastActivity,
    logs: activeSessions[sessionId].logs.slice(-20) // Return last 20 logs
  });
});

app.post('/ping', (req, res) => {
  const { sessionId } = req.body;
  
  if (!sessionId || !activeSessions[sessionId]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Update last activity
  activeSessions[sessionId].lastActivity = Date.now();
  
  res.json({ success: true, timestamp: Date.now() });
});

// Helper function to send Discord messages
async function sendDiscordMessage(config) {
  let attempts = 0;
  let lastError;
  
  while (attempts <= config.retries) {
    try {
      const response = await axios.post(
        `https://discord.com/api/v9/channels/${config.channelId}/messages`,
        { content: config.message },
        {
          headers: {
            'Authorization': config.token,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          }
        }
      );
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      lastError = error;
      attempts++;
      
      if (attempts <= config.retries) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  
  throw lastError;
}

// Main message sending loop
async function startSendingMessages(sessionId) {
  const session = activeSessions[sessionId];
  
  while (session.isRunning) {
    try {
      const result = await sendDiscordMessage(session.config);
      
      // Log success
      addLog(sessionId, 'Message sent successfully', 'success', result.data);
      
      // Check if session is still active
      if (!session.isRunning) break;
      
      // Wait for the delay period
      await new Promise(r => setTimeout(r, session.config.delay));
      
      // Check inactivity
      const inactiveTime = Date.now() - session.lastActivity;
      if (inactiveTime > CONFIG.MAX_INACTIVITY) {
        addLog(sessionId, `Session stopped due to inactivity (${Math.floor(inactiveTime/1000)} seconds)`, 'warning');
        session.isRunning = false;
        delete activeSessions[sessionId];
        break;
      }
    } catch (error) {
      addLog(sessionId, `Failed to send message: ${error.message}`, 'error');
      
      // Wait before retrying
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// Add log to session
function addLog(sessionId, message, level = 'info', data = null) {
  if (!activeSessions[sessionId]) return;
  
  const logEntry = {
    timestamp: new Date(),
    message,
    level,
    data
  };
  
  activeSessions[sessionId].logs.push(logEntry);
  console.log(`[${sessionId}] [${level}] ${message}`);
}

// Cleanup inactive sessions periodically
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const sessionId in activeSessions) {
    const session = activeSessions[sessionId];
    const inactiveTime = now - session.lastActivity;
    
    if (inactiveTime > CONFIG.MAX_INACTIVITY) {
      addLog(sessionId, `Session cleaned up due to inactivity (${Math.floor(inactiveTime/1000)} seconds)`, 'warning');
      session.isRunning = false;
      delete activeSessions[sessionId];
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} inactive sessions`);
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Start server
app.listen(PORT, () => {
  console.log(`Discord Sender Pro 24/7 running on port ${PORT}`);
  console.log(`Version: ${CONFIG.APP_VERSION}`);
});
