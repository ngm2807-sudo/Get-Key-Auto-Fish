require('dotenv').config();
const app = require('../web/app');

// Vercel's Node.js runtime gọi hàm export này với (req, res) y hệt 1 route
// handler bình thường — và vì Express app tự nó là 1 hàm (req,res)=>{...},
// chỉ cần export thẳng app là đủ, không cần code thêm gì khác ở đây.
module.exports = app;
