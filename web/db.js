const mongoose = require('mongoose');

/**
 * Trên serverless (Vercel), mỗi lần "nguội" (cold start) code bị chạy lại
 * từ đầu, nhưng nhiều request liên tiếp có thể dùng chung 1 instance đang
 * "ấm" (warm). Nếu cứ gọi mongoose.connect() mỗi request sẽ dễ mở hàng trăm
 * kết nối dư thừa tới MongoDB Atlas và bị từ chối kết nối.
 *
 * Cách chuẩn: cache connection trên biến module-level, chỉ connect() nếu
 * chưa có hoặc đã bị ngắt.
 */
let cached = global._mongooseConn;
if (!cached) cached = global._mongooseConn = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGODB_URI, {
        dbName: process.env.MONGODB_DBNAME || 'keybot',
        bufferCommands: false,
      })
      .then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = { connectDB };
