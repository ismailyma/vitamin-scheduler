const express = require('express');
const admin = require('firebase-admin');
const cron = require('node-cron');

const app = express();
app.use(express.json());

// ── CORS ───────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── FIREBASE ADMIN ─────────────────────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
    universe_domain: 'googleapis.com'
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

// ── SEND NOTIFICATIONS ─────────────────────────────────────────────────────
async function sendVitaminReminder(timeOfDay) {
  try {
    const snap = await db.ref('vitamin_tokens').once('value');
    const tokens = snap.val();

    if (!tokens) { console.log('No tokens registered'); return; }

    const tokenList = Object.values(tokens).filter(Boolean);
    if (tokenList.length === 0) { console.log('Token list empty'); return; }

    const isMorning = timeOfDay === 'morning';
    const message = {
      notification: {
        title: isMorning ? '💊 Morning vitamins' : '💊 Afternoon vitamins',
        body: isMorning
          ? 'Good morning Ismail & Zaynab! Time to take your vitamins.'
          : 'Afternoon reminder — don\'t forget your vitamins!'
      },
      webpush: {
        notification: {
          icon: 'https://iz-vitamins-default-rtdb.firebaseio.com/icon.png',
          requireInteraction: false
        },
        fcmOptions: { link: '/' }
      },
      tokens: tokenList
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[${new Date().toISOString()}] ${timeOfDay} reminder — Success: ${response.successCount}, Failed: ${response.failureCount}`);

    // Remove invalid tokens
    if (response.failureCount > 0) {
      const updates = {};
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const failedToken = tokenList[idx];
          Object.entries(tokens).forEach(([key, val]) => {
            if (val === failedToken) updates[key] = null;
          });
        }
      });
      if (Object.keys(updates).length > 0) {
        await db.ref('vitamin_tokens').update(updates);
      }
    }
  } catch (err) {
    console.error('Send error:', err.message);
  }
}

// ── SCHEDULES (Europe/London) ──────────────────────────────────────────────
cron.schedule('0 8 * * *', () => {
  console.log('8am — sending morning reminder');
  sendVitaminReminder('morning');
}, { timezone: 'Europe/London' });

cron.schedule('0 15 * * *', () => {
  console.log('3pm — sending afternoon reminder');
  sendVitaminReminder('afternoon');
}, { timezone: 'Europe/London' });

// ── REGISTER TOKEN ─────────────────────────────────────────────────────────
app.post('/register-token', async (req, res) => {
  const { token, deviceId } = req.body;
  if (!token || !deviceId) return res.status(400).json({ error: 'Missing token or deviceId' });
  try {
    await db.ref('vitamin_tokens/' + deviceId).set(token);
    console.log('Token registered for device:', deviceId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TEST ENDPOINT ──────────────────────────────────────────────────────────
app.get('/test', async (req, res) => {
  await sendVitaminReminder('morning');
  res.json({ success: true, message: 'Test notification sent' });
});

// ── HEALTH ─────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: '✅ running',
    service: 'Vitamin Reminder Scheduler',
    schedules: ['08:00 Europe/London', '15:00 Europe/London'],
    time: new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Vitamin scheduler running on port ${PORT}`);
  console.log('8:00am and 3:00pm reminders scheduled (Europe/London)');

  // Keep alive
  setInterval(() => {
    fetch('https://vitamin-scheduler.onrender.com/')
      .then(() => console.log('Keep-alive ping sent'))
      .catch(() => {});
  }, 14 * 60 * 1000);
});
