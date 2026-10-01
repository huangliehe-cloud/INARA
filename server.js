/**
 * MediaBolt - Standalone Node.js & Express Downloader Server
 * 
 * Run with:
 *   node server.js
 * 
 * Features:
 *  - Automatic URL platform detection (YouTube / TikTok)
 *  - TikTok watermark-free MP4 & high quality MP3 extraction via TikWM
 *  - YouTube high-definition MP4 (1080p, 720p, 480p) & MP3 conversion via Loader API
 *  - Direct streaming proxy with attachment headers to bypass CORS & CDN hotlink limits
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.static(__dirname));

/**
 * RapidAPI Configuration Placeholder
 * If you wish to plug in your RapidAPI key for YouTube or TikTok scrapers:
 */
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "YOUR_KEY_HERE";

function detectPlatform(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  const trimmed = url.trim();
  if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) return 'youtube';
  if (trimmed.includes('tiktok.com') || trimmed.includes('douyin.com')) return 'tiktok';
  return 'unknown';
}

function extractYouTubeId(url) {
  const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  return match ? match[1] : null;
}

// Route: Fetch Info & Prepare Formats
app.post('/api/fetch-info', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Please enter a valid URL.' });

    const platform = detectPlatform(url);
    if (platform === 'unknown') {
      return res.status(400).json({ error: 'Please enter a valid YouTube or TikTok URL.' });
    }

    // TikTok Handler (strictly watermark-free)
    if (platform === 'tiktok') {
      const tikwmRes = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
        },
        body: new URLSearchParams({ url: url.trim(), hd: '1' }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await tikwmRes.json();
      if (data.code !== 0 || !data.data) {
        return res.status(422).json({ error: data.msg || 'Unable to parse TikTok video.' });
      }

      const item = data.data;
      const host = 'https://www.tikwm.com';
      const playUrl = item.play?.startsWith('http') ? item.play : `${host}${item.play}`;
      const hdUrl = item.hdplay ? (item.hdplay.startsWith('http') ? item.hdplay : `${host}${item.hdplay}`) : playUrl;
      const audioUrl =
        item.music_info?.play ||
        (item.music?.startsWith('http') ? item.music : null) ||
        playUrl;
      const cover = item.cover?.startsWith('http') ? item.cover : `${host}${item.cover}`;

      return res.json({
        id: item.id || `tiktok_${Date.now()}`,
        platform: 'tiktok',
        title: item.title || 'TikTok Video',
        author: item.author?.nickname || 'TikTok Creator',
        thumbnail: cover,
        duration: item.duration ? `${Math.floor(item.duration / 60)}:${(item.duration % 60).toString().padStart(2, '0')}` : undefined,
        formats: [
          {
            id: 'tiktok-mp4-hd',
            type: 'video',
            label: 'MP4 Video (HD No Watermark)',
            quality: '1080p HD - No Watermark',
            ext: 'mp4',
            watermarkFree: true,
            isDirect: true,
            downloadUrl: hdUrl
          },
          {
            id: 'tiktok-mp4-sd',
            type: 'video',
            label: 'MP4 Video (Standard No Watermark)',
            quality: 'Standard - No Watermark',
            ext: 'mp4',
            watermarkFree: true,
            isDirect: true,
            downloadUrl: playUrl
          },
          ...(audioUrl ? [{
            id: 'tiktok-mp3',
            type: 'audio',
            label: 'MP3 Audio (Original Sound)',
            quality: 'Audio MP3',
            ext: 'mp3',
            watermarkFree: true,
            isDirect: true,
            downloadUrl: audioUrl
          }] : [])
        ],
        videoPreviewUrl: playUrl,
        audioPreviewUrl: audioUrl
      });
    }

    // YouTube Handler
    if (platform === 'youtube') {
      const ytId = extractYouTubeId(url);
      if (!ytId) return res.status(400).json({ error: 'Invalid YouTube link.' });

      let title = 'YouTube Video';
      let author = 'YouTube Channel';
      try {
        const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
        if (oembed.ok) {
          const d = await oembed.json();
          title = d.title || title;
          author = d.author_name || author;
        }
      } catch (e) {}

      return res.json({
        id: ytId,
        platform: 'youtube',
        title,
        author,
        thumbnail: `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`,
        formats: [
          { id: 'yt-1080', type: 'video', label: 'MP4 Video (1080p Full HD)', quality: '1080p Full HD', ext: 'mp4', needsConversion: true },
          { id: 'yt-720', type: 'video', label: 'MP4 Video (720p HD)', quality: '720p HD', ext: 'mp4', needsConversion: true },
          { id: 'yt-480', type: 'video', label: 'MP4 Video (480p SD)', quality: '480p Standard', ext: 'mp4', needsConversion: true },
          { id: 'yt-mp3-320', type: 'audio', label: 'MP3 Audio (320 kbps HQ)', quality: '320 kbps (High Fidelity)', ext: 'mp3', needsConversion: true },
          { id: 'yt-mp3-192', type: 'audio', label: 'MP3 Audio (192 kbps)', quality: '192 kbps (Standard)', ext: 'mp3', needsConversion: true },
          { id: 'yt-mp3-128', type: 'audio', label: 'MP3 Audio (128 kbps)', quality: '128 kbps (Fast)', ext: 'mp3', needsConversion: true }
        ]
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// Route: Conversion Job for YouTube Formats
app.post('/api/fetch-download', async (req, res) => {
  try {
    const { url, formatId, ext } = req.body;
    let format = '1080';
    if (formatId === 'yt-720') format = '720';
    else if (formatId === 'yt-480') format = '480';
    else if (formatId?.includes('mp3') || ext === 'mp3') format = 'mp3';

    const apiUrl = `https://loader.to/ajax/download.php?format=${format}&url=${encodeURIComponent(url)}`;
    const initRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://loader.to/'
      }
    });
    const initData = await initRes.json();

    if (!initData.success) throw new Error(initData.text || 'Conversion failed.');
    if (initData.download_url && initData.download_url.startsWith('http')) {
      return res.json({ success: true, downloadUrl: initData.download_url, title: initData.title });
    }

    const progressUrl = initData.progress_url;
    let finalUrl = null;
    let lastProgress = 35;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        const pRes = await fetch(progressUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://loader.to/'
          }
        });
        const pData = await pRes.json();
        if (pData.progress) {
          lastProgress = Math.min(Math.round(pData.progress / 10), 99);
        }
        if (pData.download_url && pData.download_url.startsWith('http')) {
          finalUrl = pData.download_url;
          break;
        }
      } catch (e) {}
    }

    if (finalUrl) {
      return res.json({ success: true, downloadUrl: finalUrl, title: initData.title });
    }

    res.json({
      success: true,
      isProgressPending: true,
      progressUrl,
      progress: lastProgress,
      title: initData.title
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Download preparation failed.' });
  }
});

app.get('/api/check-download-progress', async (req, res) => {
  try {
    const progressUrl = req.query.progressUrl;
    if (!progressUrl || !progressUrl.startsWith('http')) {
      return res.status(400).json({ error: 'Invalid progressUrl' });
    }
    const progRes = await fetch(progressUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://loader.to/'
      }
    });
    const progData = await progRes.json();
    const isReady = Boolean(progData.download_url && progData.download_url.startsWith('http'));
    res.json({
      success: true,
      isReady,
      progress: progData.progress ? Math.min(Math.round(progData.progress / 10), 100) : 50,
      downloadUrl: isReady ? progData.download_url : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Progress check failed' });
  }
});

// Route: Proxy Download to Bypass CORS & Set Attachment Header
app.get('/api/proxy-download', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    const filename = (req.query.filename || 'download').replace(/[/\\?%*:|"<>]/g, '_');
    const isStream = req.query.stream === '1';

    if (!targetUrl || !targetUrl.startsWith('http')) {
      return res.status(400).send('Invalid download URL.');
    }

    if (targetUrl.includes('/api/progress') || targetUrl.includes('loader.to/ajax/download')) {
      return res.status(422).send('Cannot stream progress tracker as media file.');
    }

    const isTikTok =
      targetUrl.includes('tikwm.com') ||
      targetUrl.includes('tiktok.com') ||
      targetUrl.includes('tiktokcdn') ||
      targetUrl.includes('byteoversea') ||
      targetUrl.includes('ibytedtos') ||
      targetUrl.includes('akamaized.net') ||
      targetUrl.includes('musical.ly');

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
    };
    if (targetUrl.includes('tikwm.com')) {
      headers['Referer'] = 'https://www.tikwm.com/';
      headers['Origin'] = 'https://www.tikwm.com';
    } else if (isTikTok) {
      headers['Referer'] = 'https://www.tiktok.com/';
      headers['Origin'] = 'https://www.tiktok.com';
    } else if (targetUrl.includes('savenow.to') || targetUrl.includes('loader.to')) {
      headers['Referer'] = 'https://loader.to/';
    } else {
      headers['Referer'] = 'https://www.google.com/';
    }

    if (req.headers.range) headers['Range'] = req.headers.range;

    let upstream = await fetch(targetUrl, { headers });

    // Fallback if 403 on TikTok CDN
    if (!upstream.ok && isTikTok && upstream.status === 403) {
      const fallbackHeaders = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15'
      };
      if (req.headers.range) fallbackHeaders['Range'] = req.headers.range;
      upstream = await fetch(targetUrl, { headers: fallbackHeaders });
    }

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).send(`Upstream server returned error ${upstream.status}`);
    }

    const upstreamContentType = upstream.headers.get('content-type') || '';
    if (upstreamContentType.includes('application/json') || upstreamContentType.includes('text/html')) {
      return res.status(422).send('File is not ready yet or returned error.');
    }

    let contentType = upstreamContentType || 'application/octet-stream';
    if (filename.endsWith('.mp4') || targetUrl.includes('.mp4') || (isStream && !filename.endsWith('.mp3'))) {
      contentType = 'video/mp4';
    }
    if (filename.endsWith('.mp3') || targetUrl.includes('.mp3') || targetUrl.includes('music')) {
      contentType = 'audio/mpeg';
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (!isStream) {
      const asciiFallback = filename
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/["\\;]/g, '_')
        .trim() || 'media_download';
      const encodedFilename = encodeURIComponent(filename);

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`
      );
    }

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Streaming error.');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MediaBolt standalone running on http://localhost:${PORT}`);
});
