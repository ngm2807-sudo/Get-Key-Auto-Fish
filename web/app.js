const express = require('express');
const crypto = require('crypto');
const Session = require('../models/Session');
const Key = require('../models/Key');
const Settings = require('../models/Settings');
const Blacklist = require('../models/Blacklist');
const { generateLicenseKey, computeExpiry } = require('../utils/keygen');
const {
  getStaticWorkInkLink,
  verifyWorkInkToken,
  createWorkInkOverride,
  buildOverriddenWorkInkLink,
} = require('../services/workink');
const { sendDM, sendChannelMessage } = require('../services/discordRest');
const { connectDB } = require('./db');

// Nếu bật "Hash User IP" trong dashboard work.ink, byIp trả về là SHA-256 của
// IP thay vì IP thô — nên khớp cả 2 dạng để không phụ thuộc cấu hình đó.
function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

// Vercel/Node đôi khi trả IPv4 dưới dạng IPv4-mapped IPv6 ("::ffff:1.2.3.4")
// tùy tầng proxy, trong khi work.ink luôn trả IPv4 thuần ("1.2.3.4"). Chuẩn
// hoá về 1 dạng trước khi lưu/so sánh để tránh lệch IP giả (false mismatch).
function normalizeIp(ip) {
  if (!ip) return ip;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function buildClaimPageHtml({ title, message, success, keyValue }) {
  const keyBlock = keyValue ? `<div class="key">${keyValue}</div>` : '';
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#1e1f22; font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#e3e5e8; }
  .card { background:#2b2d31; padding:40px; border-radius:12px; max-width:420px; text-align:center;
          box-shadow:0 10px 30px rgba(0,0,0,.4); }
  .icon { font-size:48px; margin-bottom:12px; }
  h1 { font-size:20px; margin:0 0 12px; }
  p { color:#b5bac1; line-height:1.5; margin:0; }
  .key { margin-top:16px; padding:12px; background:#1e1f22; border-radius:8px; font-family: monospace;
         font-size:16px; letter-spacing:1px; color:#5865f2; word-break: break-all; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '✅' : '⚠️'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${keyBlock}
  </div>
</body>
</html>`;
}

/**
 * Đánh dấu 1 session checkpoint là hoàn thành (đúng 1 lần), sinh key, DM
 * người dùng, và ghi log. An toàn khi gọi từ cả route redirect lẫn route
 * postback của provider — filter status:'pending' trong findOneAndUpdate
 * đảm bảo chỉ lệnh gọi đầu tiên thắng, tránh sinh 2 key cho cùng 1 session.
 */
async function finalizeSession(token) {
  const session = await Session.findOneAndUpdate(
    { token, status: 'pending' },
    { status: 'completed' },
    { new: false }, // trả về document TRƯỚC khi update để biết nó từng pending
  );
  if (!session) return null; // đã xử lý rồi, hết hạn, hoặc token không tồn tại

  let key;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateLicenseKey();
    // eslint-disable-next-line no-await-in-loop
    const exists = await Key.exists({ key: candidate });
    if (!exists) {
      key = candidate;
      break;
    }
  }
  if (!key) throw new Error('không tạo được key duy nhất sau 5 lần thử');

  const expiresAt = computeExpiry('hour', session.durationHours);
  await Key.create({
    key,
    discordId: session.discordId,
    durationType: 'hour',
    durationValue: session.durationHours,
    expiresAt,
    source: 'checkpoint',
  });

  // DM + log là best-effort: lỗi ở đây không được làm hỏng response HTTP.
  // Dùng REST thuần (services/discordRest.js), không cần gateway Client —
  // nhờ vậy web app này chạy độc lập hoàn toàn với process bot Discord.
  try {
    await sendDM(
      session.discordId,
      `🔑 Key **${session.durationHours}h** của bạn:\n\`\`\`${key}\`\`\`\n` +
        `Hết hạn: <t:${Math.floor(expiresAt.getTime() / 1000)}:F>`,
    );
  } catch (err) {
    console.error('[finalizeSession] không DM được user:', err.response?.data || err.message);
  }

  try {
    const settings = await Settings.findById('global');
    if (settings?.logChannelId) {
      await sendChannelMessage(
        settings.logChannelId,
        `📥 <@${session.discordId}> vừa nhận key qua **${session.provider}** ` +
          `(${session.durationHours}h): \`${key}\``,
      );
    }
  } catch (err) {
    console.error('[finalizeSession] không gửi log được:', err.response?.data || err.message);
  }

  return key;
}

const app = express();

// true = tin mọi lớp proxy đứng trước app (đúng cho Vercel, vì edge network
// của Vercel tự set đúng x-forwarded-for, client không spoof được header đó
// một khi đã qua Vercel). Nếu sau này tự host trên VPS và expose PORT thẳng
// ra internet không qua proxy nào, đặt TRUST_PROXY=false trong .env.
app.set('trust proxy', process.env.TRUST_PROXY === 'false' ? false : true);

// Đảm bảo có kết nối MongoDB trước khi xử lý route nào — rẻ nếu đã kết nối
// sẵn (xem web/db.js), cần thiết vì trên Vercel mỗi cold start là 1 process mới.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('[db] lỗi kết nối MongoDB:', err.message);
    res.status(503).send('Database unavailable, thử lại sau.');
  }
});

// Đích đến cuối cùng sau khi người dùng vượt xong checkpoint trên trình duyệt.
app.get('/claim/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const session = await Session.findOne({ token });

    if (!session) {
      return res.status(404).send(
        buildClaimPageHtml({
          title: 'Không tìm thấy phiên',
          message: 'Link này không hợp lệ. Hãy dùng lệnh /get key trong Discord để lấy link mới.',
          success: false,
        }),
      );
    }

    if (session.status === 'completed') {
      return res.send(
        buildClaimPageHtml({
          title: 'Đã nhận key rồi',
          message: 'Phiên này đã được xử lý trước đó — key đã được gửi trong Discord DM của bạn.',
          success: true,
        }),
      );
    }

    if (session.expiresAt < new Date()) {
      session.status = 'expired';
      await session.save();
      return res.send(
        buildClaimPageHtml({
          title: 'Link đã hết hạn',
          message: 'Link này đã hết hạn sau 30 phút. Dùng lại lệnh /get key trong Discord để lấy link mới.',
          success: false,
        }),
      );
    }

    // Dùng Link Override API của work.ink để nhét thẳng session token của
    // mình vào URL callback — nhờ vậy /claim/workink-callback nhận diện
    // đúng 100% phiên này, không cần đoán qua IP (vốn có thể sai do IPv4
    // vs IPv6, VPN, hay nhiều người cùng vượt checkpoint 1 lúc).
    // clientIp vẫn lưu lại — chỉ để xem log/đối chiếu thủ công khi cần,
    // không còn dùng để match phiên nữa.
    if (session.provider === 'workink') {
      session.clientIp = normalizeIp(req.ip);
      await session.save();

      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (!publicBaseUrl) {
        throw new Error('PUBLIC_BASE_URL chưa được cấu hình trong .env (vd: https://ten-app.vercel.app)');
      }
      const destination =
        `${publicBaseUrl}/claim/workink-callback` +
        `?wiToken={TOKEN}&session=${encodeURIComponent(token)}`;

      const sr = await createWorkInkOverride(destination);
      return res.redirect(302, buildOverriddenWorkInkLink(sr));
    }

    const key = await finalizeSession(token);
    if (!key) {
      return res.send(
        buildClaimPageHtml({
          title: 'Đã nhận key rồi',
          message: 'Phiên này đã được xử lý — key đã được gửi trong Discord DM của bạn.',
          success: true,
        }),
      );
    }

    return res.send(
      buildClaimPageHtml({
        title: 'Hoàn thành!',
        message: 'Key của bạn đã được gửi qua Discord DM. Bạn cũng có thể copy key bên dưới.',
        success: true,
        keyValue: key,
      }),
    );
  } catch (err) {
    console.error('[GET /claim/:token]', err);
    return res.status(500).send(
      buildClaimPageHtml({
        title: 'Lỗi server',
        message: 'Có lỗi xảy ra, thử lại sau hoặc báo owner.',
        success: false,
      }),
    );
  }
});

// Đích đến mà Link Override (xem services/workink.js + route /claim/:token
// phía trên) trỏ về sau khi user hoàn thành checkpoint — work.ink tự thay
// {TOKEN} bằng token thật, còn `session` là session token của CHÍNH MÌNH
// được nhét sẵn vào URL lúc tạo override, nên không cần đoán qua IP nữa.
app.get('/claim/workink-callback', async (req, res) => {
  const wiToken = req.query.wiToken;
  const sessionToken = req.query.session;

  if (!wiToken || !sessionToken) {
    return res.status(400).send(
      buildClaimPageHtml({
        title: 'Thiếu tham số xác thực',
        message: 'Link này thiếu wiToken hoặc session — đừng truy cập thẳng, hãy dùng lệnh /get key trong Discord.',
        success: false,
      }),
    );
  }

  let verify;
  try {
    verify = await verifyWorkInkToken(wiToken);
  } catch (err) {
    console.error('[claim/workink-callback] lỗi gọi isValid:', err.response?.status, err.message);
    return res.status(502).send(
      buildClaimPageHtml({
        title: 'Lỗi xác thực work.ink',
        message: 'Không liên hệ được work.ink để xác thực. Thử bấm lại link sau ít phút.',
        success: false,
      }),
    );
  }

  if (!verify?.valid) {
    return res.status(403).send(
      buildClaimPageHtml({
        title: 'Token work.ink không hợp lệ',
        message:
          'Token đã hết hạn, đã dùng rồi, hoặc không hợp lệ. Dùng lại /get key trong Discord để lấy link mới.',
        success: false,
      }),
    );
  }

  // Khớp session TRỰC TIẾP theo token của chính mình — gắn sẵn vào URL
  // callback qua Link Override lúc redirect user sang work.ink (route
  // /claim/:token). Không còn so IP (byIp work.ink luôn là IPv4, trong khi
  // IP server mình thấy có thể là IPv6 tùy nhà mạng — 2 giá trị này có thể
  // không bao giờ khớp dù đúng 1 người), và cũng không còn bug lấy nhầm
  // session "mới nhất" khi có nhiều người cùng vượt checkpoint 1 lúc.
  const session = await Session.findOne({
    token: sessionToken,
    provider: 'workink',
    status: 'pending',
  });

  if (!session) {
    return res.status(409).send(
      buildClaimPageHtml({
        title: 'Không tìm thấy phiên',
        message:
          'Xác thực work.ink thành công nhưng phiên /get key tương ứng không còn pending (có thể đã được xử lý trước đó hoặc đã hết hạn). Dùng lại /get key trong Discord.',
        success: false,
      }),
    );
  }

  const key = await finalizeSession(session.token);
  if (!key) {
    return res.send(
      buildClaimPageHtml({
        title: 'Đã nhận key rồi',
        message: 'Phiên này đã được xử lý — key đã được gửi trong Discord DM của bạn.',
        success: true,
      }),
    );
  }

  return res.send(
    buildClaimPageHtml({
      title: 'Hoàn thành!',
      message: 'Key của bạn đã được gửi qua Discord DM. Bạn cũng có thể copy key bên dưới.',
      success: true,
      keyValue: key,
    }),
  );
});

// Tăng cường chống bypass (tùy chọn): đặt đúng URL này làm Postback URL
// trong tab Advanced của panel LootLabs để nhận thêm xác nhận server-to-
// server, độc lập với redirect trình duyệt ở trên.
// Docs: https://help.lootlabs.gg/en/article/postback-api-1ndz3i2/
app.get('/webhook/lootlabs', async (req, res) => {
  const token = req.query.click_id;
  if (!token) return res.status(400).send('missing click_id');
  try {
    await finalizeSession(token);
    return res.send('ok');
  } catch (err) {
    console.error('[GET /webhook/lootlabs]', err);
    return res.status(500).send('error');
  }
});

/**
 * Endpoint cho client (script AHK) gọi lên để kiểm tra key + bind/khớp HWID.
 *
 * GET /api/validate?key=XXXXX-...&hwid=...
 *
 * Trả về text thuần dạng "field=value", mỗi dòng 1 field — KHÔNG trả JSON,
 * vì AutoHotkey v2 không có sẵn thư viện parse JSON, trong khi parse text
 * kiểu này chỉ cần StrSplit 2 lần, không cần cài thêm gì ở phía client.
 *
 * reason có thể là: ok | missing_params | not_found | revoked | expired |
 *                    hwid_mismatch | hwid_blacklisted
 *
 * Lần đầu 1 key được verify (hwid hiện đang null), server tự BIND hwid gửi
 * lên vào key đó luôn — đây chính là lúc "khoá" key vào máy.
 */
app.get('/api/validate', async (req, res) => {
  res.type('text/plain');
  const { key, hwid } = req.query;

  if (!key || !hwid) {
    return res.send('valid=false\nreason=missing_params');
  }

  const blacklisted = await Blacklist.findOne({ hwid });
  if (blacklisted) {
    return res.send('valid=false\nreason=hwid_blacklisted');
  }

  const doc = await Key.findOne({ key });
  if (!doc) {
    return res.send('valid=false\nreason=not_found');
  }
  if (doc.status === 'revoked') {
    return res.send('valid=false\nreason=revoked');
  }
  if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) {
    return res.send('valid=false\nreason=expired');
  }

  if (!doc.hwid) {
    // Lần verify đầu tiên — bind luôn hwid này vào key.
    doc.hwid = hwid;
    await doc.save();
  } else if (doc.hwid !== hwid) {
    return res.send('valid=false\nreason=hwid_mismatch');
  }

  const expiresAtMs = doc.expiresAt ? doc.expiresAt.getTime() : 0; // 0 = vĩnh viễn
  return res.send(`valid=true\nreason=ok\nexpiresAt=${expiresAtMs}`);
});

app.get('/', (req, res) => res.send('Key bot web service is running.'));

module.exports = app;
module.exports.finalizeSession = finalizeSession;
