import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * RapidAPI Configuration Placeholder
 * If you have a RapidAPI account, insert your API key here or set RAPIDAPI_KEY in your .env file.
 * The server defaults to high-speed free public download mesh first (TikWM & Loader API).
 */
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "YOUR_KEY_HERE";

// Platform detection helper
function detectPlatform(url: string): 'youtube' | 'tiktok' | 'unknown' {
  if (!url || typeof url !== 'string') return 'unknown';
  const trimmed = url.trim();
  
  if (
    trimmed.includes('youtube.com') ||
    trimmed.includes('youtu.be') ||
    trimmed.includes('youtube-nocookie.com')
  ) {
    return 'youtube';
  }

  if (
    trimmed.includes('tiktok.com') ||
    trimmed.includes('douyin.com') ||
    trimmed.includes('vm.tiktok.com') ||
    trimmed.includes('vt.tiktok.com')
  ) {
    return 'tiktok';
  }

  return 'unknown';
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  return match ? match[1] : null;
}

/**
 * Route: /api/fetch-info
 * Detects whether the URL is YouTube or TikTok, extracts metadata (title, author, thumbnail, duration),
 * and prepares download/conversion format options.
 */
app.post('/api/fetch-info', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Please enter a valid video URL.' });
      return;
    }

    const platform = detectPlatform(url);
    if (platform === 'unknown') {
      res.status(400).json({
        error: 'Unsupported URL. Please enter a valid YouTube or TikTok video link.'
      });
      return;
    }

    // --- TIKTOK HANDLER (STRICTLY NO WATERMARK) ---
    if (platform === 'tiktok') {
      try {
        const tikwmRes = await fetch('https://www.tikwm.com/api/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          body: new URLSearchParams({
            url: url.trim(),
            count: '12',
            cursor: '0',
            web: '1',
            hd: '1'
          }),
          signal: AbortSignal.timeout(10000)
        });

        const tikwmData = await tikwmRes.json();

        if (tikwmData.code !== 0 || !tikwmData.data) {
          throw new Error(tikwmData.msg || 'Unable to parse TikTok video.');
        }

        const data = tikwmData.data;
        const host = 'https://www.tikwm.com';
        
        // Video without watermark
        const rawNoWatermark = data.play?.startsWith('http') ? data.play : `${host}${data.play}`;
        const rawHd = data.hdplay ? (data.hdplay.startsWith('http') ? data.hdplay : `${host}${data.hdplay}`) : rawNoWatermark;
        const rawAudio =
          data.music_info?.play ||
          (data.music?.startsWith('http') ? data.music : null) ||
          rawNoWatermark;
        
        const videoTitle = data.title || 'TikTok Video';
        const author = data.author?.nickname || data.author?.unique_id || 'TikTok Creator';
        const cover = data.cover?.startsWith('http') ? data.cover : `${host}${data.cover}`;

        interface FormatItem {
          id: string;
          type: 'video' | 'audio';
          label: string;
          quality: string;
          ext: 'mp4' | 'mp3';
          watermarkFree?: boolean;
          isDirect?: boolean;
          downloadUrl?: string;
          filesize?: string;
          needsConversion?: boolean;
        }

        const formats: FormatItem[] = [
          {
            id: 'tiktok-mp4-hd',
            type: 'video',
            label: 'MP4 Video (HD No Watermark)',
            quality: '1080p HD - No Watermark',
            ext: 'mp4',
            watermarkFree: true,
            isDirect: true,
            downloadUrl: rawHd,
            filesize: data.hd_size ? `${(data.hd_size / (1024 * 1024)).toFixed(1)} MB` : undefined
          },
          {
            id: 'tiktok-mp4-sd',
            type: 'video',
            label: 'MP4 Video (Standard No Watermark)',
            quality: 'Standard - No Watermark',
            ext: 'mp4',
            watermarkFree: true,
            isDirect: true,
            downloadUrl: rawNoWatermark,
            filesize: data.size ? `${(data.size / (1024 * 1024)).toFixed(1)} MB` : undefined
          }
        ];

        if (rawAudio) {
          formats.push({
            id: 'tiktok-mp3',
            type: 'audio',
            label: 'MP3 Audio (Original Sound)',
            quality: 'Audio MP3 (Highest Quality)',
            ext: 'mp3',
            watermarkFree: true,
            isDirect: true,
            downloadUrl: rawAudio,
            filesize: 'High Bitrate'
          });
        }

        res.json({
          id: data.id || `tiktok_${Date.now()}`,
          platform: 'tiktok',
          title: videoTitle,
          author: author,
          authorAvatar: data.author?.avatar,
          thumbnail: cover,
          duration: data.duration ? `${Math.floor(data.duration / 60)}:${(data.duration % 60).toString().padStart(2, '0')}` : undefined,
          views: data.play_count ? Number(data.play_count).toLocaleString() : undefined,
          originalUrl: url,
          formats,
          videoPreviewUrl: rawNoWatermark,
          audioPreviewUrl: rawAudio
        });
        return;
      } catch (err: any) {
        console.error('TikTok extraction error:', err.message);
        res.status(422).json({
          error: 'Could not fetch TikTok media. Please make sure the video is public and the link is valid.'
        });
        return;
      }
    }

    // --- YOUTUBE HANDLER ---
    if (platform === 'youtube') {
      const ytId = extractYouTubeId(url);
      if (!ytId) {
        res.status(400).json({ error: 'Invalid YouTube link or missing video ID.' });
        return;
      }

      // Fetch metadata via YouTube oEmbed
      let title = 'YouTube Video';
      let author = 'YouTube Channel';
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`;
        const oembedRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json();
          title = oembedData.title || title;
          author = oembedData.author_name || author;
        }
      } catch (e) {
        // oEmbed failed, fallback to defaults
      }

      const thumbnail = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;

      // Available formats for YouTube
      const formats = [
        {
          id: 'yt-1080',
          type: 'video' as const,
          label: 'MP4 Video (1080p Full HD)',
          quality: '1080p Full HD',
          ext: 'mp4' as const,
          watermarkFree: true,
          needsConversion: true
        },
        {
          id: 'yt-720',
          type: 'video' as const,
          label: 'MP4 Video (720p HD)',
          quality: '720p HD',
          ext: 'mp4' as const,
          watermarkFree: true,
          needsConversion: true
        },
        {
          id: 'yt-480',
          type: 'video' as const,
          label: 'MP4 Video (480p SD)',
          quality: '480p Standard',
          ext: 'mp4' as const,
          watermarkFree: true,
          needsConversion: true
        },
        {
          id: 'yt-360',
          type: 'video' as const,
          label: 'MP4 Video (360p Cepat)',
          quality: '360p Cepat (Fast)',
          ext: 'mp4' as const,
          watermarkFree: true,
          needsConversion: true
        },
        {
          id: 'yt-mp3-320',
          type: 'audio' as const,
          label: 'MP3 Audio (320 kbps HQ)',
          quality: '320 kbps (High Fidelity)',
          ext: 'mp3' as const,
          watermarkFree: true,
          needsConversion: true
        },
        {
          id: 'yt-mp3-192',
          type: 'audio' as const,
          label: 'MP3 Audio (192 kbps)',
          quality: '192 kbps (Standard)',
          ext: 'mp3' as const,
          watermarkFree: true,
          needsConversion: true
        },
        {
          id: 'yt-mp3-128',
          type: 'audio' as const,
          label: 'MP3 Audio (128 kbps)',
          quality: '128 kbps (Fast)',
          ext: 'mp3' as const,
          watermarkFree: true,
          needsConversion: true
        }
      ];

      res.json({
        id: ytId,
        platform: 'youtube',
        title,
        author,
        thumbnail,
        originalUrl: `https://www.youtube.com/watch?v=${ytId}`,
        formats
      });
      return;
    }
  } catch (error: any) {
    console.error('Fetch info error:', error);
    res.status(500).json({ error: error.message || 'Server error processing request.' });
  }
});

/**
 * Route: /api/fetch-download
 * Requests a conversion job for YouTube formats (e.g. 1080p MP4 or 320k MP3)
 * Polls the high-speed conversion API and returns the direct download link.
 */
app.post('/api/fetch-download', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, formatId, ext } = req.body;
    if (!url) {
      res.status(400).json({ error: 'Missing video URL.' });
      return;
    }

    // Map formatId to API format
    let targetFormat = '1080';
    if (formatId === 'yt-1080') targetFormat = '1080';
    else if (formatId === 'yt-720') targetFormat = '720';
    else if (formatId === 'yt-480') targetFormat = '480';
    else if (formatId === 'yt-360') targetFormat = '360';
    else if (formatId?.includes('mp3') || ext === 'mp3') targetFormat = 'mp3';

    const apiUrl = `https://loader.to/ajax/download.php?format=${targetFormat}&url=${encodeURIComponent(url)}`;
    const initRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://loader.to/'
      },
      signal: AbortSignal.timeout(8000)
    });
    const initData = await initRes.json();

    if (!initData.success) {
      throw new Error(initData.text || 'Gagal memulai konversi. Silakan coba kembali.');
    }

    // If download_url is already available immediately and non-empty
    if (initData.download_url && initData.download_url.startsWith('http')) {
      res.json({
        success: true,
        downloadUrl: initData.download_url,
        title: initData.title
      });
      return;
    }

    const progressUrl = initData.progress_url;
    if (!progressUrl) {
      throw new Error('Server konversi tidak menyediakan tracker kemajuan.');
    }

    // Return immediately to avoid Vercel 10s Serverless timeout
    res.json({
      success: true,
      isProgressPending: true,
      progressUrl: progressUrl,
      progress: 30,
      title: initData.title
    });
  } catch (err: any) {
    console.error('Fetch download error:', err.message);
    res.status(500).json({ error: err.message || 'Gagal menyiapkan konversi media.' });
  }
});

/**
 * Route: /api/check-download-progress
 * Allows frontend to poll ongoing conversion progress until direct downloadUrl is ready.
 */
app.get('/api/check-download-progress', async (req: Request, res: Response): Promise<void> => {
  try {
    const progressUrl = req.query.progressUrl as string;
    if (!progressUrl || !progressUrl.startsWith('http')) {
      res.status(400).json({ error: 'Missing or invalid progressUrl' });
      return;
    }

    const progRes = await fetch(progressUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://loader.to/'
      },
      signal: AbortSignal.timeout(5000)
    });

    const progData = await progRes.json();
    const isReady = Boolean(
      (progData.download_url && progData.download_url.startsWith('http')) ||
      progData.success === 1 ||
      progData.text === 'Finished'
    );

    let calculatedProgress = 40;
    if (progData.progress) {
      if (progData.progress >= 1000) calculatedProgress = 100;
      else if (progData.progress > 100) calculatedProgress = Math.round(progData.progress / 10);
      else calculatedProgress = progData.progress;
    }
    if (isReady && progData.download_url) calculatedProgress = 100;

    res.json({
      success: true,
      isReady,
      progress: calculatedProgress,
      downloadUrl: progData.download_url || null,
      text: progData.text || 'Memproses konversi...'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Progress check failed' });
  }
});

/**
 * Route: /api/proxy-download
 * Streams the video or audio file directly to the client with attachment headers
 * and User-Agent/Referer headers to prevent 503/403 or CORS issues.
 * Validates that the upstream file is genuine audio/video and not an error or JSON text.
 */
app.get('/api/proxy-download', async (req: Request, res: Response): Promise<void> => {
  try {
    const targetUrl = req.query.url as string;
    const filename = (req.query.filename as string) || 'download';
    const streamOnly = req.query.stream === '1';

    if (!targetUrl || !targetUrl.startsWith('http')) {
      res.status(400).send('Invalid download URL.');
      return;
    }

    // Prevent downloading progress URLs as media files
    if (targetUrl.includes('/api/progress') || targetUrl.includes('loader.to/ajax/download')) {
      res.status(422).send('Cannot stream progress tracker as media file. Please wait for conversion to finish.');
      return;
    }

    const isTikTok =
      targetUrl.includes('tikwm.com') ||
      targetUrl.includes('tiktok.com') ||
      targetUrl.includes('tiktokcdn') ||
      targetUrl.includes('byteoversea') ||
      targetUrl.includes('ibytedtos') ||
      targetUrl.includes('akamaized.net') ||
      targetUrl.includes('musical.ly');

    const isSaveNow = targetUrl.includes('savenow.to') || targetUrl.includes('loader.to');

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    if (targetUrl.includes('tikwm.com')) {
      headers['Referer'] = 'https://www.tikwm.com/';
      headers['Origin'] = 'https://www.tikwm.com';
    } else if (isTikTok) {
      headers['Referer'] = 'https://www.tiktok.com/';
      headers['Origin'] = 'https://www.tiktok.com';
    } else if (isSaveNow) {
      headers['Referer'] = 'https://loader.to/';
    } else {
      headers['Referer'] = 'https://www.google.com/';
    }

    // Forward range header if browser seeks in video
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    let upstream = await fetch(targetUrl, { headers });

    // Fallback: If 403 or forbidden on TikTok CDN, retry without Referer or with empty Referer
    if (!upstream.ok && isTikTok && upstream.status === 403) {
      const fallbackHeaders = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
      };
      if (req.headers.range) {
        (fallbackHeaders as any)['Range'] = req.headers.range;
      }
      upstream = await fetch(targetUrl, { headers: fallbackHeaders });
    }

    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status).send(`Upstream server returned error ${upstream.status}. Please try again.`);
      return;
    }

    // Validate that upstream content type is not JSON or HTML when downloading media
    const upstreamContentType = upstream.headers.get('content-type') || '';
    if (
      upstreamContentType.includes('application/json') ||
      upstreamContentType.includes('text/html')
    ) {
      res.status(422).send('Upstream server returned error page instead of media stream. The conversion may still be pending.');
      return;
    }

    // Determine content type
    let contentType = upstreamContentType || 'application/octet-stream';
    if (filename.endsWith('.mp4') || targetUrl.includes('.mp4') || (streamOnly && !filename.endsWith('.mp3'))) {
      contentType = 'video/mp4';
    }
    if (filename.endsWith('.mp3') || targetUrl.includes('.mp3') || targetUrl.includes('music')) {
      contentType = 'audio/mpeg';
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    if (!streamOnly) {
      // Safe ASCII-only fallback filename (0x20 - 0x7E, excluding quotes, backslashes, and semicolons)
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

    if (!upstream.body) {
      res.end();
      return;
    }

    // Stream response
    const reader = upstream.body.getReader();
    req.on('close', () => {
      reader.cancel();
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err: any) {
    console.error('Proxy download error:', err.message);
    if (!res.headersSent) {
      res.status(500).send('Download stream failed.');
    }
  }
});

// Configure Vite middleware in development or static serving in production
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`MediaBolt server running at http://0.0.0.0:${PORT}`);
  });
}

export default app;

if (!process.env.VERCEL) {
  startServer();
}
