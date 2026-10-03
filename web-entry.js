// Entry point để chạy web (/claim, callback work.ink, webhook lootlabs) như
// 1 server bình thường, DÀNH CHO TRƯỜNG HỢP KHÔNG dùng Vercel (vd tự thuê
// VPS có domain/port thật). Nếu dùng Vercel, KHÔNG cần file này — Vercel
// chạy qua api/index.js + vercel.json thay vì app.listen().
//
// Chạy: node web-entry.js
require('dotenv').config();
const app = require('./web/app');

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🌐 Web server listening on port ${port}`));
