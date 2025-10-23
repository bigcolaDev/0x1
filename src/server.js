// server.js
import express from 'express';
import morgan from 'morgan';
import axios from 'axios';
import { URL } from 'url';
import 'dotenv/config'; // โหลด .env อัตโนมัติ

const app = express();
app.use(express.json());
app.use(morgan('combined'));

/**
 * ดึง campaign code จากลิงก์หลายรูปแบบ
 * @param {string} campaignLink
 * @returns {string|null}
 */
function extractCampaignCode(campaignLink) {
  if (!campaignLink || typeof campaignLink !== 'string') return null;

  // 1) หากเป็น URL ที่ parse ได้ ให้ลองดึงพารามิเตอร์ v=
  try {
    const parsed = new URL(campaignLink);
    const v = parsed.searchParams.get('v');
    if (v) return v;

    // ถ้า path มีรูปแบบ /campaign/vouchers/{code}/redeem หรือ /campaign/vouchers/{code}
    const path = parsed.pathname || '';
    // match vouchers/<code>
    const m1 = path.match(/vouchers\/([^\/]+)/i);
    if (m1 && m1[1]) return m1[1];

    // บางครั้ง code อาจอยู่เป็น segment สุดท้าย
    const segs = path.split('/').filter(Boolean);
    if (segs.length) {
      const last = segs[segs.length - 1];
      // ถ้า last ไม่ใช่ 'redeem' หรือ 'vouchers' ให้ถือเป็น code
      if (!/redeem|vouchers|campaign|compaign/i.test(last)) return last;
    }
  } catch (e) {
    // ไม่ใช่ URL ที่ parse ได้ -> fallback ลงด้านล่าง
  }

  // 2) พยายาม regex จาก string ตรงๆ (เช่น ?v=CODE หรือ v=CODE)
  const rxV = campaignLink.match(/[?&]v=([^&\/\s]+)/i);
  if (rxV && rxV[1]) return rxV[1];

  // 3) พยายามหา pattern vouchers/{code}
  const rxVouchers = campaignLink.match(/vouchers\/([^\/\s]+)/i);
  if (rxVouchers && rxVouchers[1]) return rxVouchers[1];

  // 4) fallback replace ตามรูปแบบที่ผู้ใช้อาจส่ง (จากตัวอย่างเดิม)
  const cleaned = campaignLink
    .replace('https://gift.truemoney.com/compaign?v=', '')
    .replace('https://gift.truemoney.com/campaign?v=', '')
    .replace('https://gift.truemoney.com/campaign/vouchers/', '')
    .replace('/redeem', '')
    .trim();
  if (cleaned) return cleaned;

  return null;
}

/**
 * ฟังก์ชันหลักทำงานเหมือน NewRequestCampaign ใน Go
 * คืนค่าเป็น object (resp.data) หรือ throw error
 *
 * @param {string} mobileNumber
 * @param {string} campaignLink
 * @returns {Promise<any>}
 */
async function newRequestCampaign(mobileNumber, campaignLink) {
  if (!mobileNumber || !campaignLink) {
    throw new Error('mobileNumber and campaignLink are required');
  }

  const campaignCode = extractCampaignCode(campaignLink);
  if (!campaignCode) {
    throw new Error('Cannot extract campaign code from campaignLink');
  }

  const campaignUrl = `https://gift.truemoney.com/campaign/vouchers/${encodeURIComponent(campaignCode)}/redeem`;
  const payload = { mobile: mobileNumber };

  try {
    const resp = await axios.post(campaignUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: Number(process.env.REQUEST_TIMEOUT_MS ?? 10000), // ค่าเริ่มต้น 10s
    });
    return resp.data;
  } catch (err) {
    // แสดงรายละเอียด error ที่เป็นประโยชน์
    if (err.response) {
      // เซิร์ฟเวอร์ตอบกลับ (status code)
      const status = err.response.status;
      const data = err.response.data;
      const msg = `HTTP ${status} - ${JSON.stringify(data)}`;
      const e = new Error(msg);
      e.status = status;
      e.responseData = data;
      throw e;
    } else if (err.request) {
      // request ส่งไปแล้วแต่ไม่มี response
      const e = new Error('No response from campaign server');
      e.cause = err;
      throw e;
    } else {
      // อื่น ๆ
      throw err;
    }
  }
}

// Endpoint ตัวอย่าง
app.post('/redeem', async (req, res) => {
  const { mobile_number: mobileNumber, campaign_link: campaignLink } = req.body;

  if (!mobileNumber || !campaignLink) {
    return res.status(400).json({ success: false, error: 'mobile_number and campaign_link are required' });
  }

  try {
    const data = await newRequestCampaign(mobileNumber, campaignLink);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('redeem error:', err?.message ?? err);
    const status = err?.status ?? 500;
    const payload = {
      success: false,
      error: err?.message ?? 'unknown error',
    };
    // แนบข้อมูล response จาก upstream ถ้ามี (ไม่จำเป็นแต่ช่วย debug)
    if (err?.responseData) payload.upstream = err.responseData;
    return res.status(status).json(payload);
  }
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
