# Vitamin Reminder Scheduler

Daily push notification scheduler for the IZ Vitamin Tracker.

## Schedules
- 8:00am Europe/London — Morning reminder
- 3:00pm Europe/London — Afternoon reminder

## Environment Variables (set in Render)

| Variable | Value |
|---|---|
| FIREBASE_PROJECT_ID | iz-vitamins |
| FIREBASE_PRIVATE_KEY_ID | (from service account JSON) |
| FIREBASE_PRIVATE_KEY | (from service account JSON) |
| FIREBASE_CLIENT_EMAIL | (from service account JSON) |
| FIREBASE_CLIENT_ID | (from service account JSON) |
| FIREBASE_CLIENT_CERT_URL | (from service account JSON) |
| FIREBASE_DATABASE_URL | https://iz-vitamins-default-rtdb.firebaseio.com |

## Endpoints
- `GET /` — health check
- `POST /register-token` — register a device push token
- `GET /test` — send a test notification immediately
