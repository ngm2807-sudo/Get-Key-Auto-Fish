const axios = require('axios');

/**
 * Link work.ink TĨNH (tạo thủ công trong dashboard, đích đến mặc định dạng
 * https://yourdomain.com/claim/workink-callback?wiToken={TOKEN}). Dùng làm
 * nền cho Link Override bên dưới — override chỉ GẮN THÊM ?sr=... vào link
 * này, không thay thế nó.
 */
function getStaticWorkInkLink() {
  const link = process.env.WORKINK_BASE_LINK;
  if (!link) throw new Error('WORKINK_BASE_LINK chưa được cấu hình trong .env');
  return link;
}

/**
 * Xác thực token work.ink tự sinh sau khi user vượt checkpoint.
 * deleteToken=1 => token chỉ dùng được đúng 1 lần.
 * Endpoint này LUÔN trả HTTP 200 — field "valid" mới là thứ quyết định.
 */
async function verifyWorkInkToken(wiToken) {
  const { data } = await axios.get(
    `https://work.ink/_api/v2/token/isValid/${encodeURIComponent(wiToken)}`,
    { params: { deleteToken: 1 } },
  );
  return data; // { valid, deleted, info: { byIp, linkId, ... } }
}

/**
 * Link Override API — cho phép override đích đến của 1 LẦN click cụ thể
 * trên link work.ink tĩnh, để nhét thẳng session token của mình vào URL
 * callback. Nhờ vậy route /claim/workink-callback nhận diện đúng phiên
 * 100% chắc chắn, KHÔNG cần đoán qua byIp nữa (byIp của work.ink luôn là
 * IPv4, trong khi IP mà server mình thấy có thể là IPv6 tùy nhà mạng —
 * 2 giá trị này có thể không bao giờ khớp dù đúng 1 người, nên so IP vốn
 * không đáng tin cậy).
 *
 * Docs: https://blog.work.ink/how-to-override-link-destinations-on-the-fly/
 *
 * GET https://work.ink/_api/v2/override?destination=<url cần redirect tới>
 * -> { "sr": "<chuỗi mã hoá>" }
 * Gắn chuỗi đó vào link work.ink tĩnh dạng ?sr=... thì click đó sẽ redirect
 * tới đúng `destination` thay vì đích đến mặc định cấu hình trong dashboard.
 *
 * Nếu endpoint này yêu cầu xác thực tài khoản (một số action trong dashboard
 * work.ink cần X-Api-Key, lấy tại Developer > API Keys), set WORKINK_API_KEY
 * trong .env — không set thì request vẫn gửi, chỉ là không kèm header đó.
 */
async function createWorkInkOverride(destinationUrl) {
  const headers = process.env.WORKINK_API_KEY
    ? { 'X-Api-Key': process.env.WORKINK_API_KEY }
    : undefined;
  const { data } = await axios.get('https://work.ink/_api/v2/override', {
    params: { destination: destinationUrl },
    headers,
  });
  if (!data?.sr) throw new Error('work.ink override API không trả về field "sr"');
  return data.sr;
}

/** Gắn chuỗi override (sr) vào link work.ink tĩnh. */
function buildOverriddenWorkInkLink(sr) {
  const base = getStaticWorkInkLink();
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}sr=${encodeURIComponent(sr)}`;
}

module.exports = {
  getStaticWorkInkLink,
  verifyWorkInkToken,
  createWorkInkOverride,
  buildOverriddenWorkInkLink,
};
