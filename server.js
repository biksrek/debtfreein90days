import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const required = ['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','PRODUCT_PRICE_INR'];
for (const name of required) {
  if (!process.env[name]) console.warn(`Missing environment variable: ${name}`);
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

app.post('/api/create-order', async (req, res) => {
  try {
    if (req.body?.product !== 'debt-free-in-90-days') return res.status(400).json({error:'Invalid product.'});
    const amount = Math.round(Number(process.env.PRODUCT_PRICE_INR) * 100);
    if (!amount || amount < 100) return res.status(500).json({error:'Product price is not configured.'});

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `df90_${Date.now()}`,
      notes: {product: 'debt-free-in-90-days'}
    });

    res.json({order_id: order.id, amount: order.amount, currency: order.currency, key_id: process.env.RAZORPAY_KEY_ID});
  } catch (error) {
    console.error(error);
    res.status(500).json({error:'Unable to create payment order.'});
  }
});

app.post('/api/verify-payment', async (req, res) => {
  try {
    const {razorpay_order_id, razorpay_payment_id, razorpay_signature} = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({error:'Missing payment verification data.'});

    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
    if (!valid) return res.status(400).json({error:'Payment signature verification failed.'});

    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.order_id !== razorpay_order_id || payment.status !== 'captured') {
      return res.status(400).json({error:'Payment has not been captured.'});
    }

    // IMPORTANT: In production, create a short-lived signed download token here
    // after confirming the payment amount/currency/product. Do not expose raw files
    // from the public repository.
    const tokenPayload = `${razorpay_order_id}.${razorpay_payment_id}.${Date.now()}`;
    const token = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(tokenPayload).digest('hex');
    // Replace this with a database-backed purchase record in production.
    res.json({success:true, redirect_url:`/success.html?order_id=${encodeURIComponent(razorpay_order_id)}&token=${encodeURIComponent(token)}`});
  } catch (error) {
    console.error(error);
    res.status(500).json({error:'Unable to verify payment.'});
  }
});

app.get('/health', (_req,res) => res.json({ok:true}));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Debt-Free in 90 Days listening on ${port}`));
