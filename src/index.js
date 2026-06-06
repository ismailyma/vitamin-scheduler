const express = require('express');
const admin = require('firebase-admin');
const cron = require('node-cron');
const webpush = require('web-push');

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

// ── WEB PUSH VAPID ─────────────────────────────────────────────────────────
webpush.setVapidDetails(
  'mailto:ismail@drivaa.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

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
    const snap = await db.ref('vitamin_push_subs').once('value');
    const subs = snap.val();

    if (!subs) { console.log('No subscriptions registered'); return; }

    const subList = Object.entries(subs);
    console.log(`Sending to ${subList.length} subscriptions...`);

    const isMorning = timeOfDay === 'morning';
    const payload = JSON.stringify({
      title: isMorning ? '💊 Morning vitamins' : '💊 Afternoon vitamins',
      body: isMorning
        ? 'Good morning Ismail & Zaynab! Time to take your vitamins.'
        : "Afternoon reminder — don't forget your vitamins!"
    });

    const results = await Promise.allSettled(
      subList.map(([deviceId, sub]) =>
        webpush.sendNotification(sub, payload)
          .then(() => ({ deviceId, success: true }))
          .catch(err => ({ deviceId, success: false, status: err.statusCode }))
      )
    );

    let success = 0, failed = 0;
    const toRemove = [];

    results.forEach(r => {
      if (r.value?.success) {
        success++;
      } else {
        failed++;
        // Remove expired/invalid subscriptions (410 = gone, 404 = not found)
        if (r.value?.status === 410 || r.value?.status === 404) {
          toRemove.push(r.value.deviceId);
        }
      }
    });

    if (toRemove.length > 0) {
      const updates = {};
      toRemove.forEach(id => updates[id] = null);
      await db.ref('vitamin_push_subs').update(updates);
      console.log(`Removed ${toRemove.length} expired subscriptions`);
    }

    console.log(`[${new Date().toISOString()}] ${timeOfDay} — Success: ${success}, Failed: ${failed}`);
  } catch (err) {
    console.error('Send error:', err.message);
  }
}

// ── SCHEDULES ──────────────────────────────────────────────────────────────
cron.schedule('0 8 * * *', () => {
  console.log('8am — sending morning reminder');
  sendVitaminReminder('morning');
}, { timezone: 'Europe/London' });

cron.schedule('0 15 * * *', () => {
  console.log('3pm — sending afternoon reminder');
  sendVitaminReminder('afternoon');
}, { timezone: 'Europe/London' });

// ── REGISTER SUBSCRIPTION ──────────────────────────────────────────────────
app.post('/register', async (req, res) => {
  const { subscription, deviceId } = req.body;
  if (!subscription || !deviceId) {
    return res.status(400).json({ error: 'Missing subscription or deviceId' });
  }
  try {
    await db.ref('vitamin_push_subs/' + deviceId).set(subscription);
    console.log('Subscription registered for device:', deviceId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TEST ───────────────────────────────────────────────────────────────────
app.get('/test', async (req, res) => {
  await sendVitaminReminder('morning');
  res.json({ success: true, message: 'Test notification sent' });
});

// ── VAPID PUBLIC KEY ───────────────────────────────────────────────────────
app.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
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

  // Keep alive ping every 14 minutes
  setInterval(() => {
    fetch('https://vitamin-scheduler.onrender.com/')
      .then(() => console.log('Keep-alive ping sent'))
      .catch(() => {});
  }, 14 * 60 * 1000);
});
