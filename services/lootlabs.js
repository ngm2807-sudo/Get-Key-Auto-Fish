const axios = require('axios');

const API_URL = 'https://creators.lootlabs.gg/api/public/content_locker';

/**
 * Tạo 1 link content-locker của LootLabs.
 * Theo tài liệu chính thức:
 * https://help.lootlabs.gg/en/article/lootlabs-api-documentation-1k0hn73/
 *
 * destinationUrl: nơi người dùng được chuyển tới SAU KHI hoàn thành đủ
 *                 `numberOfTasks` checkpoint (ở đây là /claim/:token của bot).
 * numberOfTasks:  1-5, số checkpoint/ads bắt buộc trước khi redirect.
 * puid:           token phiên của bot, gắn vào link để (nếu bật Postback
 *                 trong panel LootLabs) LootLabs trả lại đúng giá trị này
 *                 qua tham số `click_id` khi gọi webhook xác nhận.
 */
async function createLootLabsLink({ destinationUrl, numberOfTasks, title = 'Get your key', puid }) {
  const token = process.env.LOOTLABS_API_TOKEN;
  if (!token) throw new Error('LOOTLABS_API_TOKEN chưa được cấu hình trong .env');

  const { data } = await axios.post(
    API_URL,
    {
      title: title.slice(0, 30), // API giới hạn tối đa 30 ký tự
      url: destinationUrl,
      tier_id: 1, // 1 = Trending & Recommended
      number_of_tasks: numberOfTasks,
      theme: 1, // 1 = Classic
    },
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (data.type === 'error') {
    throw new Error(`LootLabs API error: ${JSON.stringify(data.message)}`);
  }

  // LootLabs trả "message" là MẢNG (kể cả khi chỉ tạo 1 link), không phải
  // object trực tiếp — vd: { type: "created", message: [{ loot_url, ... }] }
  const entry = Array.isArray(data.message) ? data.message[0] : data.message;
  let lootUrl = entry?.loot_url;
  if (!lootUrl) {
    throw new Error(`LootLabs API trả về không có loot_url: ${JSON.stringify(data)}`);
  }
  if (puid) {
    const separator = lootUrl.includes('?') ? '&' : '?';
    lootUrl = `${lootUrl}${separator}puid=${encodeURIComponent(puid)}`;
  }
  return lootUrl;
}

module.exports = { createLootLabsLink };
