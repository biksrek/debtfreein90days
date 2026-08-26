import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.post('/api/razorpay-webhook', express.raw({type:'application/json'}), (req,res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!signature || !secret) return res.status(400).send('Webhook not configured');
    const expected = crypto.createHmac('sha256',secret).update(req.body).digest('hex');
    if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature))) return res.status(400).send('Invalid signature');
    const event = JSON.parse(req.body.toString('utf8'));
    console.log('Razorpay webhook received:',event.event);
    return res.sendStatus(200);
  } catch (error) { console.error(error); return res.sendStatus(400); }
});

app.use(express.json());
app.use(express.static(__dirname));

const required=['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','PRODUCT_PRICE_INR'];
for(const name of required) if(!process.env[name]) console.warn(`Missing environment variable: ${name}`);
const razorpay=new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET});
const tokenSecret=process.env.DOWNLOAD_TOKEN_SECRET||process.env.RAZORPAY_KEY_SECRET;
const pricePaise=()=>Math.round(Number(process.env.PRODUCT_PRICE_INR)*100);

app.post('/api/create-order',async(req,res)=>{
  try{
    if(req.body?.product!=='debt-free-in-90-days') return res.status(400).json({error:'Invalid product.'});
    const amount=pricePaise();
    if(!amount||amount<100) return res.status(500).json({error:'Product price is not configured.'});
    const order=await razorpay.orders.create({amount,currency:'INR',receipt:`df90_${Date.now()}`,notes:{product:'debt-free-in-90-days'}});
    res.json({order_id:order.id,amount:order.amount,currency:order.currency,key_id:process.env.RAZORPAY_KEY_ID});
  }catch(error){console.error(error);res.status(500).json({error:'Unable to create payment order.'});}
});

function makeToken(orderId,paymentId){const expires=Date.now()+60*60*1000;const payload=`${orderId}.${paymentId}.${expires}`;const sig=crypto.createHmac('sha256',tokenSecret).update(payload).digest('hex');return Buffer.from(`${payload}.${sig}`).toString('base64url');}
function parseToken(token,orderId,paymentId){try{const decoded=Buffer.from(token,'base64url').toString('utf8');const parts=decoded.split('.');if(parts.length!==4||parts[0]!==orderId||parts[1]!==paymentId||Number(parts[2])<Date.now())return false;const expected=crypto.createHmac('sha256',tokenSecret).update(`${parts[0]}.${parts[1]}.${parts[2]}`).digest('hex');return expected.length===parts[3].length&&crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(parts[3]));}catch{return false;}}

app.post('/api/verify-payment',async(req,res)=>{
  try{
    const {razorpay_order_id,razorpay_payment_id,razorpay_signature}=req.body||{};
    if(!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)return res.status(400).json({error:'Missing payment verification data.'});

    // Retrieve the order created by this server. Do not trust the order amount/product from the browser.
    const order=await razorpay.orders.fetch(razorpay_order_id);
    if(order.status!=='created'&&order.status!=='attempted'&&order.status!=='paid')return res.status(400).json({error:'Invalid Razorpay order.'});
    if(order.amount!==pricePaise()||order.currency!=='INR'||order.notes?.product!=='debt-free-in-90-days')return res.status(400).json({error:'Order does not match this product.'});

    const expected=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    const valid=expected.length===razorpay_signature.length&&crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(razorpay_signature));
    if(!valid)return res.status(400).json({error:'Payment signature verification failed.'});

    const payment=await razorpay.payments.fetch(razorpay_payment_id);
    if(payment.order_id!==razorpay_order_id||payment.status!=='captured'||payment.currency!=='INR'||payment.amount!==pricePaise())return res.status(400).json({error:'Payment has not been captured for the expected product amount.'});

    const token=makeToken(razorpay_order_id,razorpay_payment_id);
    res.json({success:true,redirect_url:`/success.html?order_id=${encodeURIComponent(razorpay_order_id)}&payment_id=${encodeURIComponent(razorpay_payment_id)}&token=${encodeURIComponent(token)}`});
  }catch(error){console.error(error);res.status(500).json({error:'Unable to verify payment.'});}
});

app.get('/api/downloads',async(req,res)=>{
  try{
    const {order_id,payment_id,token}=req.query;
    if(!order_id||!payment_id||!token||!parseToken(token,order_id,payment_id))return res.status(403).json({error:'Download link is invalid or expired.'});
    const order=await razorpay.orders.fetch(order_id);
    const payment=await razorpay.payments.fetch(payment_id);
    if(order.status!=='paid'||order.amount!==pricePaise()||order.notes?.product!=='debt-free-in-90-days'||payment.order_id!==order_id||payment.status!=='captured'||payment.amount!==pricePaise())return res.status(403).json({error:'Purchase could not be verified.'});
    const files=[{label:'Normal PDF',url:process.env.DOWNLOAD_NORMAL_PDF_URL},{label:'Mobile PDF',url:process.env.DOWNLOAD_MOBILE_PDF_URL},{label:'EPUB',url:process.env.DOWNLOAD_EPUB_URL}].filter(x=>x.url);
    if(files.length!==3)return res.status(500).json({error:'Download files are not configured yet.'});
    res.json({files});
  }catch(error){console.error(error);res.status(500).json({error:'Unable to load downloads.'});}
});

app.get('/health',(_req,res)=>res.json({ok:true}));
const port=process.env.PORT||3000;
app.listen(port,()=>console.log(`Debt-Free in 90 Days listening on ${port}`));
