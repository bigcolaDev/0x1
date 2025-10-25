import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import redeemvouchers from "@prakrit_m/tmn-voucher";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// ฟังก์ชันจัดการ Error จากการแลกคูปอง
function handleVoucherError(response) {
  switch (response.code) {
    case "VOUCHER_NOT_FOUND":
      return "🔍 ไม่พบ VOUCHER";
    case "VOUCHER_EXPIRED":
      return "⏳ VOUCHER หมดอายุ";
    case "VOUCHER_OUT_OF_STOCK":
      return "❌ VOUCHER ถูกใช้ไปแล้ว";
    case "CANNOT_GET_OWN_VOUCHER":
      return "🚫 ไม่สามารถใช้ VOUCHER ของตัวเองได้";
    case "CONDITION_NOT_MET":
      return "🚫 ไม่ตรงเงื่อนไข";
    default:
      return `⚠️ ทำรายการล้มเหลว: ${response.message}`;
  }
}

// Routes
app.post('/api/redeem', async (req, res) => {
  try {
    const { mobile_number, voucher_link, amount } = req.body;

    // Validation
    if (!mobile_number || !voucher_link) {
      return res.status(400).json({
        success: false,
        error: "ต้องระบุ mobile_number และ voucher_link"
      });
    }

    const options = {};
    if (amount) {
      options.amount = amount;
    }

    const response = await redeemvouchers(mobile_number, voucher_link, options);
    
    if (response.success) {
      return res.json({
        success: true,
        message: `🎉 ทำรายการสำเร็จ: ${response.amount}`,
        data: response
      });
    } else {
      const errorMessage = handleVoucherError(response);
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: response.code
      });
    }
  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาดในการทำรายการ:", error);
    return res.status(500).json({
      success: false,
      error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์"
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});