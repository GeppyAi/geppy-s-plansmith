require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const os = require('os');

const projectsRouter = require('./routes/projects');
const assetsRouter = require('./routes/assets');
const githubRouter = require('./routes/github');
const aiRouter = require('./routes/ai');
const exportRouter = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded vault assets static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/projects', projectsRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/github', githubRouter);
app.use('/api/ai', aiRouter);
app.use('/api/export', exportRouter);

// System Status Endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    app: 'PlanSmith Local Suite',
    version: '1.0.0',
    gemini_key_configured: !!process.env.GEMINI_API_KEY,
    github_token_configured: !!process.env.GITHUB_TOKEN,
    timestamp: new Date().toISOString()
  });
});

// Helper to find local IPv4 network addresses
function getLocalNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// Start Server
app.listen(PORT, HOST, () => {
  const ips = getLocalNetworkIPs();
  console.log(`=======================================================`);
  console.log(` 🛠️  PlanSmith Local Suite is running!`);
  console.log(`-------------------------------------------------------`);
  console.log(` 💻 Local Access:        http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(` 🌐 Local Network:       http://${ip}:${PORT}`);
  });
  console.log(` 🔑 Gemini API Configured: ${process.env.GEMINI_API_KEY ? 'YES' : 'NO (Manual mode active)'}`);
  console.log(`=======================================================`);
});
