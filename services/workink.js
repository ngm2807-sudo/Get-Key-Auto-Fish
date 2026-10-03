const axios = require('axios');

/**
 * Work.ink Key System KHÔNG có API tạo link động — link phải tạo thủ công
 * trong dashboard (https://dashboard.work.ink/) với đích đến cố định dạng
 * https://yourdomain.com/claim/workink-callback?wiToken={TOKEN}
 * (xem Key Link Creation trong docs chính thức). Vì vậy không có hàm
 * createWorkInkLink ở đây nữa — chỉ cần đọc link tĩnh từ .env.
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

module.exports = { getStaticWorkInkLink, verifyWorkInkToken };
