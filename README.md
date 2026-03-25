# Kapruka Goal Dashboard

## Files
- `kapruka_v4.html` — Open this in your browser (the dashboard)
- `server.js` — Backend API (deploy on Render)
- `schema.sql` — Run this in Supabase SQL Editor first
- `.env` — Your credentials (already filled in)

## Setup Steps

### 1. Supabase
- Go to supabase.com → your project → SQL Editor
- Paste schema.sql → Run

### 2. Deploy backend on Render
- Push this folder to GitHub
- Go to render.com → New Web Service → connect repo
- Build command: npm install
- Start command: node server.js
- Add all env vars from .env file

### 3. Update dashboard
- Open kapruka_v4.html in Notepad
- Replace YOUR-APP.onrender.com with your actual Render URL
- Open in Chrome

### 4. Sync data
- Click the Sync button in the dashboard
- Or call POST https://YOUR-APP.onrender.com/api/sync
