const crypto = require('crypto');

const KEY_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomSegment(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += KEY_CHARSET[bytes[i] % KEY_CHARSET.length];
  }
  return out;
}

/** Sinh key dạng XXXXX-XXXXX-XXXXX (A-Z a-z 0-9). */
function generateLicenseKey() {
  return `${randomSegment(5)}-${randomSegment(5)}-${randomSegment(5)}`;
}

/** Sinh token theo dõi phiên checkpoint (dùng làm puid/click_id và path /claim/:token). */
function generateSessionToken() {
  return crypto.randomBytes(16).toString('hex'); // 32 ký tự hex
}

const MS = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000, // quy ước 1 tháng = 30 ngày
};

/**
 * Tính ngày hết hạn từ loại + số lượng thời hạn.
 * durationType: 'permanent' | 'hour' | 'day' | 'week' | 'month'
 * Trả về null nếu permanent (không hết hạn).
 */
function computeExpiry(durationType, durationValue, from = new Date()) {
  if (durationType === 'permanent') return null;
  const unitMs = MS[durationType];
  if (!unitMs) throw new Error(`Loại thời hạn không hợp lệ: ${durationType}`);
  return new Date(from.getTime() + unitMs * durationValue);
}

module.exports = { generateLicenseKey, generateSessionToken, computeExpiry, MS };
