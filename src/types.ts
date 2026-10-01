export type PlatformType = 'youtube' | 'tiktok' | 'unknown';

export interface MediaFormat {
  id: string;
  type: 'video' | 'audio';
  label: string;
  quality: string;
  ext: 'mp4' | 'mp3';
  filesize?: string;
  downloadUrl?: string;
  isDirect?: boolean;
  needsConversion?: boolean;
  watermarkFree?: boolean;
}

export interface MediaInfo {
  id: string;
  platform: 'youtube' | 'tiktok';
  title: string;
  author: string;
  authorAvatar?: string;
  thumbnail: string;
  duration?: number | string;
  views?: string;
  originalUrl: string;
  formats: MediaFormat[];
  videoPreviewUrl?: string;
  audioPreviewUrl?: string;
}

export interface DownloadHistoryItem {
  id: string;
  title: string;
  thumbnail: string;
  platform: 'youtube' | 'tiktok';
  formatLabel: string;
  ext: 'mp4' | 'mp3';
  timestamp: number;
  downloadUrl: string;
}
