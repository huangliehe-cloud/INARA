import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Music,
  Video,
  Sparkles,
  Link2,
  Check,
  AlertCircle,
  X,
  Play,
  Pause,
  ExternalLink,
  History,
  Copy,
  ChevronRight,
  ShieldCheck,
  Zap,
  Volume2,
  RefreshCw,
  Clock,
  Trash2,
  Flame
} from 'lucide-react';
import { MediaInfo, MediaFormat, DownloadHistoryItem, PlatformType } from './types';
import appIcon from './assets/images/mediabolt_icon_1790820899431.jpg';

const SAMPLE_URLS = [
  {
    name: 'YouTube: Never Gonna Give You Up',
    platform: 'youtube' as PlatformType,
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  },
  {
    name: 'TikTok: Cute Dog Viral Video',
    platform: 'tiktok' as PlatformType,
    url: 'https://www.tiktok.com/@scout2015/video/6718335390845095173'
  }
];

export default function App() {
  const [inputUrl, setInputUrl] = useState('');
  const [detectedPlatform, setDetectedPlatform] = useState<PlatformType>('unknown');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'video' | 'audio'>('all');
  
  // Downloading / Processing state per format
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgressText, setDownloadProgressText] = useState<string>('');
  
  // Media Preview Player
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // History state
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('mediabolt_history');
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load history', e);
    }
  }, []);

  const saveToHistory = (item: DownloadHistoryItem) => {
    setHistory(prev => {
      const filtered = prev.filter(h => h.id !== item.id);
      const updated = [item, ...filtered].slice(0, 20);
      try {
        localStorage.setItem('mediabolt_history', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('mediabolt_history');
    } catch (e) {}
  };

  // Detect platform on input change
  useEffect(() => {
    const trimmed = inputUrl.trim().toLowerCase();
    if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
      setDetectedPlatform('youtube');
    } else if (trimmed.includes('tiktok.com') || trimmed.includes('douyin.com')) {
      setDetectedPlatform('tiktok');
    } else {
      setDetectedPlatform('unknown');
    }
  }, [inputUrl]);

  // Client-side fallback if backend API is not available (e.g. static hosting on Vercel)
  const clientSideFetchMedia = async (url: string): Promise<MediaInfo> => {
    const isTiktok = url.includes('tiktok.com') || url.includes('douyin.com') || url.includes('vt.tiktok.com');

    if (isTiktok) {
      const tikRes = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ url: url.trim(), hd: '1' })
      });
      const json = await tikRes.json();
      if (json.code !== 0 || !json.data) {
        throw new Error(json.msg || 'Gagal memproses video TikTok. Pastikan link video valid dan publik.');
      }
      const item = json.data;
      const host = 'https://www.tikwm.com';
      const rawNoWatermark = item.play?.startsWith('http') ? item.play : `${host}${item.play}`;
      const rawHd = item.hdplay ? (item.hdplay.startsWith('http') ? item.hdplay : `${host}${item.hdplay}`) : rawNoWatermark;
      const rawAudio =
        item.music_info?.play ||
        (item.music?.startsWith('http') ? item.music : null) ||
        rawNoWatermark;
      const cover = item.cover?.startsWith('http') ? item.cover : `${host}${item.cover}`;

      return {
        id: item.id || `tiktok_${Date.now()}`,
        title: item.title || 'TikTok Video (Tanpa Tanda Air)',
        author: item.author?.nickname || item.author?.unique_id || 'TikTok Creator',
        thumbnail: cover,
        duration: item.duration ? `${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}` : '0:30',
        platform: 'tiktok',
        originalUrl: url,
        videoPreviewUrl: rawNoWatermark,
        audioPreviewUrl: rawAudio,
        formats: [
          {
            id: 'tiktok-mp4-hd',
            label: 'MP4 HD (Tanpa Tanda Air)',
            quality: '1080p / 720p',
            ext: 'mp4',
            type: 'video',
            watermarkFree: true,
            downloadUrl: rawHd
          },
          {
            id: 'tiktok-mp4-sd',
            label: 'MP4 Standar (Tanpa Tanda Air)',
            quality: 'Original Clean',
            ext: 'mp4',
            type: 'video',
            watermarkFree: true,
            downloadUrl: rawNoWatermark
          },
          {
            id: 'tiktok-mp3',
            label: 'MP3 Audio (Suara Asli)',
            quality: 'High Bitrate',
            ext: 'mp3',
            type: 'audio',
            watermarkFree: true,
            downloadUrl: rawAudio
          }
        ]
      };
    }

    // YouTube Client-side Fallback using oEmbed
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const videoId = ytMatch ? ytMatch[1] : null;

    if (videoId) {
      let title = 'YouTube Video';
      let author = 'YouTube Creator';
      try {
        const oeRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (oeRes.ok) {
          const oeData = await oeRes.json();
          title = oeData.title || title;
          author = oeData.author_name || author;
        }
      } catch (e) {}

      return {
        id: videoId,
        title,
        author,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: 'HD',
        platform: 'youtube',
        originalUrl: url,
        videoPreviewUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
        formats: [
          {
            id: 'yt-720p',
            label: 'MP4 Video (720p HD)',
            quality: '720p HD',
            ext: 'mp4',
            type: 'video',
            watermarkFree: true,
            needsConversion: true
          },
          {
            id: 'yt-mp3-320',
            label: 'MP3 Audio (320 kbps HQ)',
            quality: '320 kbps (HQ)',
            ext: 'mp3',
            type: 'audio',
            watermarkFree: true,
            needsConversion: true
          }
        ]
      };
    }

    throw new Error('Format tautan tidak dikenali. Silakan tempel tautan YouTube atau TikTok.');
  };

  // Handle URL fetch submission
  const handleFetchMedia = async (targetUrl?: string) => {
    const urlToFetch = (targetUrl || inputUrl).trim();
    if (!urlToFetch) {
      setErrorMsg('Silakan tempel tautan YouTube atau TikTok untuk melanjutkan.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);
    setLoadingStep('Mendeteksi platform dan menghubungkan ke server media...');
    setProgressPercent(15);
    setIsPlayingPreview(false);

    try {
      const stepTimer1 = setTimeout(() => {
        setLoadingStep('Menganalisis metadata video & mengekstrak stream...');
        setProgressPercent(55);
      }, 500);

      const stepTimer2 = setTimeout(() => {
        setLoadingStep('Menyiapkan stream tanpa tanda air & track MP3...');
        setProgressPercent(85);
      }, 1200);

      let data: MediaInfo | null = null;

      try {
        const res = await fetch('/api/fetch-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlToFetch })
        });

        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          data = await res.json();
          if (data && (data as any).error) {
            throw new Error((data as any).error);
          }
        } else {
          // If backend returned HTML (e.g. 404 from Vercel static router), run client-side parser
          data = await clientSideFetchMedia(urlToFetch);
        }
      } catch (backendErr: any) {
        // Fallback to direct client-side fetch
        data = await clientSideFetchMedia(urlToFetch);
      }

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setProgressPercent(100);

      if (!data) {
        throw new Error('Gagal mengambil data video. Silakan periksa kembali tautan Anda.');
      }

      setMediaInfo(data);
      setLoadingStep('Siap diunduh!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses link. Pastikan tautan YouTube atau TikTok valid.');
    } finally {
      setLoading(false);
      setProgressPercent(0);
    }
  };

  // Handle Clipboard Paste
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputUrl(text);
        handleFetchMedia(text);
      }
    } catch (err) {
      // In case clipboard permission is denied
      const fallback = prompt('Paste your YouTube or TikTok link here:');
      if (fallback) {
        setInputUrl(fallback);
        handleFetchMedia(fallback);
      }
    }
  };

  // Initiate Download for a format with live byte streaming into Blob
  const handleDownload = async (format: MediaFormat) => {
    if (!mediaInfo) return;
    setDownloadingId(format.id);
    setDownloadProgressText('Menghubungkan ke server media...');

    try {
      let finalUrl = format.downloadUrl;

      // If YouTube format requires high-speed conversion
      if (format.needsConversion && (!finalUrl || finalUrl.includes('/api/progress'))) {
        setDownloadProgressText('Memulai konversi stream kualitas tinggi...');
        const convRes = await fetch('/api/fetch-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: mediaInfo.originalUrl,
            formatId: format.id,
            ext: format.ext
          })
        });

        const convData = await convRes.json();
        if (!convRes.ok || !convData.success) {
          throw new Error(convData.error || 'Server konversi sedang sibuk. Silakan coba kembali.');
        }

        if (convData.downloadUrl && convData.downloadUrl.startsWith('http')) {
          finalUrl = convData.downloadUrl;
        } else if (convData.isProgressPending && convData.progressUrl) {
          // Poll conversion progress until real media file is ready
          let isComplete = false;
          let attempts = 0;
          const maxPollAttempts = 30;

          while (!isComplete && attempts < maxPollAttempts) {
            attempts++;
            await new Promise(r => setTimeout(r, 1500));
            
            try {
              const checkRes = await fetch(`/api/check-download-progress?progressUrl=${encodeURIComponent(convData.progressUrl)}`);
              const checkData = await checkRes.json();

              if (checkData.progress) {
                setDownloadProgressText(`Mengonversi ${format.ext.toUpperCase()} (${checkData.progress}%)...`);
              }

              if (checkData.isReady && checkData.downloadUrl) {
                finalUrl = checkData.downloadUrl;
                isComplete = true;
                break;
              }
            } catch (pollErr) {
              // keep polling until timeout
            }
          }

          if (!isComplete || !finalUrl) {
            throw new Error('Proses konversi memerlukan waktu lebih lama. Silakan klik Download kembali untuk mengulang.');
          }
        }
      }

      if (!finalUrl || finalUrl.includes('/api/progress')) {
        throw new Error('File belum siap. Silakan klik tombol Download kembali dalam beberapa detik.');
      }

      setDownloadProgressText('Mendownload file media asli ke browser...');

      // Build clean filename with MediaBolt tag to avoid opening old corrupted files in Downloads folder
      const safeTitle = mediaInfo.title
        .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
        .replace(/[/\\?%*:|"<>#]/g, '')
        .slice(0, 50)
        .trim();
      const ext = format.ext;
      const filename = `[MediaBolt] ${safeTitle || 'Media'}.${ext}`;

      const downloadProxyUrl = `/api/proxy-download?url=${encodeURIComponent(finalUrl)}&filename=${encodeURIComponent(filename)}`;

      // Fetch the binary stream with live progress and build a Blob
      let fileRes: Response | null = null;
      try {
        fileRes = await fetch(downloadProxyUrl);
        const contentType = fileRes.headers.get('content-type') || '';
        if (!fileRes.ok || contentType.includes('text/html')) {
          throw new Error('Proxy not available or returned HTML');
        }
      } catch (fetchErr) {
        // Fallback: trigger direct download using finalUrl if proxy returned error / 404
        const directUrl = (finalUrl && finalUrl.startsWith('http')) ? finalUrl : downloadProxyUrl;
        const fallbackLink = document.createElement('a');
        fallbackLink.href = directUrl;
        fallbackLink.setAttribute('download', filename);
        fallbackLink.setAttribute('target', '_blank');
        document.body.appendChild(fallbackLink);
        fallbackLink.click();
        document.body.removeChild(fallbackLink);
        setDownloadProgressText('Mengalihkan unduhan langsung ke browser...');
        setTimeout(() => {
          setDownloadingId(null);
          setDownloadProgressText('');
        }, 2500);
        return;
      }

      const contentLengthHeader = fileRes.headers.get('content-length');
      const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
      
      const reader = fileRes.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream tidak didukung di browser ini.');
      }

      const chunks: BlobPart[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
          const mbReceived = (receivedBytes / (1024 * 1024)).toFixed(1);
          if (totalBytes > 0) {
            const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
            const pct = Math.round((receivedBytes / totalBytes) * 100);
            setDownloadProgressText(`Mengunduh: ${mbReceived} MB / ${mbTotal} MB (${pct}%)...`);
          } else {
            setDownloadProgressText(`Mengunduh: ${mbReceived} MB...`);
          }
        }
      }

      // Validate downloaded blob size
      if (receivedBytes < 20000) {
        throw new Error('Ukuran file yang diterima terlalu kecil atau belum selesai dirender. Silakan coba kembali.');
      }

      const mimeType = ext === 'mp4' ? 'video/mp4' : 'audio/mpeg';
      const blob = new Blob(chunks, { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);

      setDownloadProgressText('Menyimpan file ke perangkat Anda...');

      const link = document.createElement('a');
      link.href = objectUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up object URL after a brief delay
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 30000);

      // Save to download history
      saveToHistory({
        id: `${mediaInfo.id}_${format.id}_${Date.now()}`,
        title: filename,
        thumbnail: mediaInfo.thumbnail,
        platform: mediaInfo.platform,
        formatLabel: `${format.label} (${(receivedBytes / (1024 * 1024)).toFixed(1)} MB)`,
        ext: format.ext,
        timestamp: Date.now(),
        downloadUrl: downloadProxyUrl
      });

      setDownloadProgressText('File berhasil tersimpan!');
      setTimeout(() => {
        setDownloadingId(null);
        setDownloadProgressText('');
      }, 2500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengunduh file. Silakan coba kualitas lain.');
      setDownloadingId(null);
      setDownloadProgressText('');
    }
  };

  const handleCopyLink = (format: MediaFormat) => {
    if (!mediaInfo) return;
    const direct = format.downloadUrl || mediaInfo.originalUrl;
    navigator.clipboard.writeText(direct);
    setCopiedId(format.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredFormats = mediaInfo?.formats.filter(f => {
    if (activeTab === 'video') return f.type === 'video';
    if (activeTab === 'audio') return f.type === 'audio';
    return true;
  }) || [];

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-black">
      {/* Top Bar Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#080C14]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand Zone */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center p-0.5 shadow-lg shadow-cyan-500/20">
              <img
                src={appIcon}
                alt="MediaBolt Logo"
                className="w-full h-full object-cover rounded-[10px]"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight font-display bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              MediaBolt
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            <button
              onClick={() => handleFetchMedia(SAMPLE_URLS[0].url)}
              className="hover:text-cyan-400 transition-colors cursor-pointer"
            >
              YouTube to MP3 / MP4
            </button>
            <button
              onClick={() => handleFetchMedia(SAMPLE_URLS[1].url)}
              className="hover:text-cyan-400 transition-colors cursor-pointer"
            >
              TikTok No-Watermark
            </button>
            <a href="#features" className="hover:text-slate-200 transition-colors">
              Features
            </a>
            <a href="#faq" className="hover:text-slate-200 transition-colors">
              FAQ
            </a>
          </nav>

          {/* Primary Action Zone */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 rounded-lg transition-colors cursor-pointer"
              title="Recent Downloads"
            >
              <History className="w-3.5 h-3.5 text-cyan-400" />
              <span>Downloads</span>
              {history.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300">
                  {history.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 md:py-12 flex flex-col items-center">
        {/* Hero Section */}
        <section className="text-center max-w-2xl mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-300 text-xs font-medium mb-4">
            <Flame className="w-3.5 h-3.5 text-cyan-400" />
            <span>High-Speed 4K & MP3 Downloader · 100% Free</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold font-display tracking-tight text-white mb-3 text-balance">
            Ultimate Video & <span className="bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 bg-clip-text text-transparent">MP3 Downloader</span>
          </h1>

          <p className="text-slate-400 text-sm sm:text-base leading-relaxed text-balance">
            Paste any YouTube video or TikTok link to download high-definition MP4 videos without watermarks or extract crystal-clear 320kbps MP3 audio.
          </p>
        </section>

        {/* Downloader Card Box */}
        <section className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl relative backdrop-blur-sm glow-cyan mb-8">
          {/* Error Alert Banner */}
          {errorMsg && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-950/60 border border-red-800/60 flex items-start justify-between gap-3 text-red-200 text-xs sm:text-sm animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                onClick={() => setErrorMsg(null)}
                className="text-red-400 hover:text-red-200 p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleFetchMedia();
            }}
            className="flex flex-col sm:flex-row items-stretch gap-2.5"
          >
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                {detectedPlatform === 'youtube' ? (
                  <span className="text-xs font-bold text-red-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    YouTube
                  </span>
                ) : detectedPlatform === 'tiktok' ? (
                  <span className="text-xs font-bold text-cyan-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    TikTok
                  </span>
                ) : (
                  <Link2 className="w-5 h-5 text-slate-500" />
                )}
              </div>

              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Paste YouTube or TikTok URL here..."
                disabled={loading}
                className="w-full pl-24 pr-20 py-3.5 sm:py-4 bg-[#0B101D] text-slate-100 placeholder-slate-500 rounded-xl border border-slate-700/80 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 text-sm sm:text-base transition-all"
              />

              {/* Paste & Clear Helper Controls inside input */}
              <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1">
                {inputUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      setInputUrl('');
                      setDetectedPlatform('unknown');
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="Clear input"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    className="px-2.5 py-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/60 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                    title="Paste from clipboard"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Paste</span>
                  </button>
                )}
              </div>
            </div>

            {/* Fetch Button */}
            <button
              type="submit"
              disabled={loading || !inputUrl.trim()}
              className="sm:w-auto px-6 py-3.5 sm:py-4 bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 transition-all cursor-pointer whitespace-nowrap"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Fetch Video / Download</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Sample Links */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="text-slate-500">Quick Test:</span>
            {SAMPLE_URLS.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setInputUrl(sample.url);
                  handleFetchMedia(sample.url);
                }}
                className="px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/50 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${sample.platform === 'youtube' ? 'bg-red-400' : 'bg-cyan-400'}`} />
                <span>{sample.name}</span>
              </button>
            ))}
          </div>

          {/* Loading Animation & Step Status */}
          {loading && (
            <div className="mt-6 pt-4 border-t border-slate-800 animate-in fade-in duration-300">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="flex items-center gap-2 text-cyan-400 font-medium">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  {loadingStep}
                </span>
                <span className="font-mono">{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Visual Preview Block & Media Options (Output) */}
        {mediaInfo && !loading && (
          <section className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm mb-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Visual Preview Header */}
            <div className="flex flex-col md:flex-row gap-5 items-start pb-6 border-b border-slate-800">
              {/* Thumbnail Container */}
              <div className="relative group w-full md:w-64 aspect-video sm:aspect-[16/10] md:aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shrink-0 shadow-lg">
                <img
                  src={mediaInfo.thumbnail}
                  alt={mediaInfo.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80';
                  }}
                />
                
                {/* Platform Badge Overlay */}
                <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide uppercase bg-black/75 backdrop-blur-sm border border-white/10 text-white flex items-center gap-1.5">
                  {mediaInfo.platform === 'tiktok' ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span>TikTok · Clean</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      <span>YouTube · HD</span>
                    </>
                  )}
                </div>

                {/* Duration Badge */}
                {mediaInfo.duration && (
                  <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded text-[11px] font-mono bg-black/80 backdrop-blur-sm text-slate-200">
                    {mediaInfo.duration}
                  </div>
                )}

                {/* Preview Play Overlay Button */}
                {mediaInfo.videoPreviewUrl && (
                  <button
                    onClick={() => setIsPlayingPreview(!isPlayingPreview)}
                    className="absolute inset-0 bg-black/40 hover:bg-black/20 flex items-center justify-center transition-colors cursor-pointer group"
                    title={isPlayingPreview ? 'Hide preview' : 'Play in-app preview'}
                  >
                    <div className="w-12 h-12 rounded-full bg-cyan-500/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      {isPlayingPreview ? (
                        <Pause className="w-5 h-5 text-white" />
                      ) : (
                        <Play className="w-5 h-5 text-white ml-0.5" />
                      )}
                    </div>
                  </button>
                )}
              </div>

              {/* Title, Channel & Metadata */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5">
                    <span>{mediaInfo.author}</span>
                    {mediaInfo.views && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{mediaInfo.views} plays</span>
                      </>
                    )}
                  </div>

                  <h2 className="text-lg sm:text-xl font-bold font-display text-white leading-snug line-clamp-2 mb-3">
                    {mediaInfo.title}
                  </h2>

                  {/* Watermark Free Guarantee Highlight */}
                  {mediaInfo.platform === 'tiktok' && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 text-xs font-semibold mb-3">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Strictly No Watermark (High Definition)</span>
                    </div>
                  )}

                  {mediaInfo.platform === 'youtube' && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-950/60 border border-blue-800/50 text-blue-300 text-xs font-semibold mb-3">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Full HD 1080p & 320kbps MP3 Available</span>
                    </div>
                  )}
                </div>

                {/* Direct Action Toolbar */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {mediaInfo.videoPreviewUrl && (
                    <button
                      onClick={() => setIsPlayingPreview(!isPlayingPreview)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {isPlayingPreview ? (
                        <>
                          <Pause className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Close Preview</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Play In-App</span>
                        </>
                      )}
                    </button>
                  )}

                  <a
                    href={mediaInfo.originalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Original Source</span>
                  </a>
                </div>
              </div>
            </div>

            {/* In-App Preview Player (collapsible) */}
            {isPlayingPreview && (
              <div className="my-6 p-4 rounded-xl bg-black border border-slate-800 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-cyan-400" />
                    In-Browser Clean Media Preview
                  </span>
                  <button
                    onClick={() => setIsPlayingPreview(false)}
                    className="text-slate-400 hover:text-white text-xs"
                  >
                    Close
                  </button>
                </div>
                {mediaInfo.videoPreviewUrl && activeTab !== 'audio' ? (
                  <video
                    ref={videoRef}
                    src={`/api/proxy-download?url=${encodeURIComponent(mediaInfo.videoPreviewUrl)}&stream=1&filename=preview.mp4`}
                    controls
                    autoPlay
                    playsInline
                    className="w-full max-h-96 rounded-lg bg-black mx-auto"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-4 bg-slate-950/80 rounded-lg border border-slate-800">
                    <p className="text-xs text-cyan-400 font-semibold mb-3 flex items-center gap-2">
                      <Music className="w-4 h-4" />
                      In-Browser Audio Player
                    </p>
                    <audio
                      ref={audioRef}
                      src={`/api/proxy-download?url=${encodeURIComponent(mediaInfo.audioPreviewUrl || mediaInfo.videoPreviewUrl || '')}&stream=1&filename=preview.mp3`}
                      controls
                      autoPlay
                      className="w-full max-w-lg"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Media Format Filter Tabs */}
            <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    activeTab === 'all'
                      ? 'bg-cyan-500 text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Options ({mediaInfo.formats.length})
                </button>
                <button
                  onClick={() => setActiveTab('video')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'video'
                      ? 'bg-cyan-500 text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Video (MP4)</span>
                </button>
                <button
                  onClick={() => setActiveTab('audio')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'audio'
                      ? 'bg-cyan-500 text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>Audio (MP3)</span>
                </button>
              </div>

              {downloadingId && (
                <div className="text-xs text-cyan-400 flex items-center gap-1.5 bg-cyan-950/80 border border-cyan-800/60 px-3 py-1 rounded-lg">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>{downloadProgressText}</span>
                </div>
              )}
            </div>

            {/* Formats Grid */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredFormats.map((format) => {
                const isThisDownloading = downloadingId === format.id;
                const isCopied = copiedId === format.id;

                return (
                  <div
                    key={format.id}
                    className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 flex flex-col justify-between transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            format.type === 'video'
                              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                              : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {format.type === 'video' ? (
                            <Video className="w-4 h-4" />
                          ) : (
                            <Music className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">
                            {format.label}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                            <span className="font-mono text-slate-300">{format.quality}</span>
                            {format.filesize && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{format.filesize}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Watermark Free or Fast Tag */}
                      {format.watermarkFree && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 uppercase">
                          No Watermark
                        </span>
                      )}
                    </div>

                    {/* Action Buttons for this Format */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60">
                      <button
                        onClick={() => handleDownload(format)}
                        disabled={isThisDownloading}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          format.type === 'video'
                            ? 'bg-blue-600 hover:bg-blue-500 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        } disabled:opacity-60`}
                      >
                        {isThisDownloading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Memproses...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>Download {format.ext.toUpperCase()}</span>
                          </>
                        )}
                      </button>

                      {format.downloadUrl && (
                        <a
                          href={`/api/proxy-download?url=${encodeURIComponent(format.downloadUrl)}&stream=1`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-cyan-300 hover:text-white transition-colors cursor-pointer"
                          title="Buka / Putar Langsung di Browser"
                        >
                          <Play className="w-4 h-4" />
                        </a>
                      )}

                      <button
                        onClick={() => handleCopyLink(format)}
                        className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        title="Copy direct stream link"
                      >
                        {isCopied ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Feature Highlights Section */}
        <section id="features" className="w-full max-w-4xl py-6 border-t border-slate-800/60">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-3">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">Strictly No Watermark</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                TikTok clips are parsed cleanly without any logo overlays or distracting end cards.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center mb-3">
                <Volume2 className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">320kbps MP3 Audio</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Extract soundtrack, music, and voiceovers in standard high-fidelity MP3 format.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3">
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">Zero Configuration</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Instant downloads without registration, database setup, or software installation.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="w-full max-w-4xl py-6 border-t border-slate-800/60">
          <h3 className="text-lg font-bold font-display text-white mb-4">Frequently Asked Questions</h3>
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800/60">
              <h4 className="text-sm font-semibold text-slate-200 mb-1">Where are the downloaded files saved?</h4>
              <p className="text-xs text-slate-400">
                Downloaded files are sent directly to your device’s default "Downloads" directory with clean filenames.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800/60">
              <h4 className="text-sm font-semibold text-slate-200 mb-1">Are there any limits on video length or quantity?</h4>
              <p className="text-xs text-slate-400">
                No. You can convert and download unlimited videos and MP3 tracks without rate limits.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800/60">
              <h4 className="text-sm font-semibold text-slate-200 mb-1">How can I run MediaBolt on my own server?</h4>
              <p className="text-xs text-slate-400">
                Run <code className="text-cyan-300 font-mono">node server.js</code> or check the included <code className="text-cyan-300 font-mono">README.md</code> for one-line start instructions!
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* History Drawer Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-cyan-400" />
                <h3 className="text-base font-bold font-display text-white">Recent Downloads</h3>
                <span className="text-xs text-slate-500">({history.length})</span>
              </div>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                    title="Clear history"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2.5">
              {history.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No downloads yet. Your processed videos and audio files will appear here.
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-3"
                  >
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-12 h-12 rounded-lg object-cover bg-slate-900 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-semibold text-white truncate">{item.title}</h4>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span className="uppercase text-cyan-400 font-mono">{item.ext}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.formatLabel}</span>
                      </div>
                    </div>
                    <a
                      href={item.downloadUrl}
                      download
                      className="p-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 transition-colors"
                      title="Download again"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} MediaBolt. Clean media utility for personal use.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Watermark-Free TikTok</span>
            <span>·</span>
            <span>YouTube MP3/MP4</span>
            <span>·</span>
            <span>Direct Streaming Proxy</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
