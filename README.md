# MediaBolt - Ultimate Video & MP3 Downloader

MediaBolt is a modern, high-speed web application for downloading YouTube and TikTok videos and audio tracks. It features automatic platform detection, strictly watermark-free TikTok MP4 downloads, high-definition YouTube MP4 streams (1080p, 720p, 480p), and studio-grade 320kbps MP3 audio extraction.

---

## 🚀 Quick Start (Run Locally in 1-2 Lines)

```bash
# 1. Install dependencies
npm install

# 2. Run the development server (Express backend + Vite React frontend)
npm run dev
```

Open `http://localhost:3000` in your web browser.

### Running Standalone Node.js Express Server
If you prefer running a single-file Node.js server with the Vanilla JS frontend:
```bash
node server.js
```
Then visit `http://localhost:3000` or `http://localhost:3000/standalone.html`.

---

## ✨ Features

- **Automatic URL Detection**: Simply paste any YouTube or TikTok URL into the single input field; the system automatically detects the origin.
- **Strictly No Watermark for TikTok**: Video files are parsed and extracted cleanly without any TikTok watermark logos or end cards.
- **High-Definition Video (MP4)**: Supports 1080p Full HD, 720p HD, and standard MP4 formats.
- **Audio Extraction (MP3)**: Download audio-only tracks in 320kbps, 192kbps, or original soundtrack quality.
- **In-App Media Preview**: Watch TikTok videos or listen to audio previews in the browser before saving.
- **Direct Streaming Proxy (`/api/proxy-download`)**: Enforces `Content-Disposition: attachment; filename="..."` and proper `User-Agent`/`Referer` headers to bypass CORS limits and browser tab autoplay, ensuring files save directly to your Downloads folder.
- **Local Download History**: Keeps track of recent downloads in the browser for quick re-access.
- **Aesthetic Dark Mode**: Designed with deep slate/obsidian tones, neon cyan/electric blue accents, and responsive layout for mobile, tablet, and desktop.

---

## 🛠️ Architecture & API Endpoints

The Express server handles all extraction and streaming requests:

1. **`POST /api/fetch-info`**:
   - Accepts `{ url: string }`.
   - Parses metadata (Title, Author, High-Res Thumbnail, Duration, Available Formats).
   - Utilizes public TikWM API for watermark-free TikTok extraction and YouTube oEmbed.

2. **`POST /api/fetch-download`**:
   - Accepts `{ url: string, formatId: string, ext: 'mp4' | 'mp3' }`.
   - Prepares and polls high-speed conversion jobs for high-resolution YouTube formats.

3. **`GET /api/proxy-download`**:
   - Accepts query params: `?url=...&filename=...&stream=0|1`.
   - Bypasses CORS and CDN rate-limits by streaming media chunks with attachment headers.

---

## 🔑 RapidAPI / Custom API Key Configuration

The backend defaults to a free public downloader mesh (TikWM + high-speed Loader API), requiring zero configuration. If you wish to use a premium RapidAPI key:

1. Open `.env` or `server.ts` / `server.js`.
2. Set your key:
   ```env
   RAPIDAPI_KEY="YOUR_KEY_HERE"
   ```
3. The server code includes clean placeholder handling:
   ```js
   const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "YOUR_KEY_HERE";
   ```

---

## 📦 Deployment

You can deploy MediaBolt on any Node.js hosting platform (Cloud Run, Render, Railway, Heroku, or VPS):

```bash
npm run build
npm start
```
