// utils/format.js
// 时间格式化:支持 MM:SS.d (0.1秒精度) 和 MM:SS
function pad(n, w) {
  n = Math.max(0, Math.floor(n));
  const s = String(n);
  return s.length >= w ? s : '0'.repeat(w - s.length) + s;
}

// 数字秒 -> 文本。withTenths=true 时带一位小数
function formatTime(totalSec, withTenths) {
  if (totalSec == null || isNaN(totalSec)) return withTenths ? '00:00.0' : '00:00';
  if (totalSec < 0) totalSec = 0;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  if (withTenths) {
    const tenths = Math.floor((totalSec - Math.floor(totalSec)) * 10);
    return `${pad(m, 2)}:${pad(s, 2)}.${tenths}`;
  }
  return `${pad(m, 2)}:${pad(s, 2)}`;
}

// mm:ss -> 秒
function parseTime(str) {
  if (!str) return 0;
  const m = String(str).trim().match(/^(\d{1,3}):(\d{1,2})$/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// 时长文本 -> 秒。支持:纯数字(秒)、MM:SS、X分Y秒、X分、Y秒、XmYs
function parseDuration(str) {
  if (str == null) return null;
  str = String(str).trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  const m = str.match(/^(\d{1,3})\s*:\s*(\d{1,2})$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const m2 = str.match(/^(?:(\d+)\s*分)?\s*(?:(\d+)\s*秒)?$/);
  if (m2 && (m2[1] || m2[2])) {
    const min = m2[1] ? parseInt(m2[1], 10) : 0;
    const sec = m2[2] ? parseInt(m2[2], 10) : 0;
    return min * 60 + sec;
  }
  const m3 = str.match(/^(\d+)\s*[mM]\s*(\d+)\s*[sS]$/);
  if (m3) return parseInt(m3[1], 10) * 60 + parseInt(m3[2], 10);
  return null;
}

module.exports = { formatTime, parseTime, parseDuration, pad };
