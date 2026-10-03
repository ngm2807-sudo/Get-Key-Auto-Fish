const axios = require('axios');

const API = 'https://discord.com/api/v10';

function authHeader() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN chưa được cấu hình trong .env');
  return { Authorization: `Bot ${token}` };
}

/**
 * Gửi DM cho 1 user bằng REST API thuần — không cần kết nối gateway
 * (WebSocket) như discord.js Client. Dùng được từ bất kỳ process nào có
 * cùng DISCORD_TOKEN, kể cả khi process đó không phải là bot chính đang
 * online trên Discord (vd: web server chạy tách riêng ở host khác).
 */
async function sendDM(discordId, content) {
  const { data: dmChannel } = await axios.post(
    `${API}/users/@me/channels`,
    { recipient_id: discordId },
    { headers: authHeader() },
  );
  await axios.post(
    `${API}/channels/${dmChannel.id}/messages`,
    { content },
    { headers: authHeader() },
  );
}

async function sendChannelMessage(channelId, content) {
  await axios.post(
    `${API}/channels/${channelId}/messages`,
    { content },
    { headers: authHeader() },
  );
}

module.exports = { sendDM, sendChannelMessage };
