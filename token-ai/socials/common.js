// token-ai/socials/common.js

import fs from 'fs';
import path from 'path';
import { getTwitterConfig } from './config.js';

const tc = getTwitterConfig();
export const TWITTER_SESSION_PATH = tc.session_path;
// New beta reports location under token-ai/socials
export const REPORTS_DIR = path.join(process.cwd(), 'token-ai', 'socials', 'reports');

export function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

export function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/:/g, '-').replace(/\./g, '-');
}

export function parseMetricCount(countStr) {
  if (countStr == null) return null;
  const str = String(countStr).trim();
  const num = str.replace(/[^0-9.KMB]/gi, '');
  if (/K$/i.test(num)) return Math.round(parseFloat(num) * 1_000);
  if (/M$/i.test(num)) return Math.round(parseFloat(num) * 1_000_000);
  if (/B$/i.test(num)) return Math.round(parseFloat(num) * 1_000_000_000);
  const digits = str.replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

export function normalizeJoinDate(joinText) {
  if (!joinText) return null;
  const text = String(joinText);
  const m = text.match(/Joined\s+([A-Za-z]+)\s+(\d{4})/i) || text.match(/([A-Za-z]+)\s+(\d{4})/i);
  if (!m) return text;
  const monthName = m[1].toLowerCase();
  const year = m[2];
  const months = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12'
  };
  const key = monthName.slice(0, 3);
  const mm = months[monthName] || months[key];
  return mm ? `${year}-${mm}` : text;
}
