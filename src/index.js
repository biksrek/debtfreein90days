const encoder = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(text) {
  const bytes = encoder.encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}

async function makeDownloadToken(env, orderId, paymentId) {
  const expires = Date.now() + 60 * 60 * 1000;
  const payload = `${orderId}.${paymentId}.${expires}`;
  const signature = await hmacHex(env.DOWNLOAD_TOKEN_SECRET, payload);
  return base64UrlEncode(`${payload}.${signature}`);
}

async function validateDownloadToken(env, token, orderId, paymentId) {
  try {
    const decoded = base64UrlDecode(token);
    const parts = decoded.split('.');
    if (parts.length !== 4) return false;
    if (parts[0] !== orderId || parts[1] !== paymentId) return false;
    const expires = Number(parts[2]);
    if (!Number.isFinite(expires) || expires < Date.now()) return false;
    const expected = await hmacHex(env.DOWNLOAD_TOKEN_SECRET, `${parts[0]}.${parts[1]}.${parts[2]}`);
    return timingSafeEqual(expected, parts[3]);
  } catch {
    return false;
  }
}

function razorpayAuth(env) {
  return 'Basic ' + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
}

async function razorpayRequest(env, path, options = {}) {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    headers: {
      authorization: razorpayAuth(env),
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.description || data?.error?.reason || `Razorpay API error (${response.status})`;
    throw new Error(message);
  }
  return data;
}

async function verifyRazorpayPayment(env, payload) {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = payload || {};
  if (!orderId || !paymentId || !signature) throw new Error('Missing payment verification data.');

  const order = await razorpayRequest(env, `/orders/${encodeURIComponent(orderId)}`);
  const expectedAmount = Math.round(Number(env.PRODUCT_PRICE_USD) * 100);
  if (order.amount !== expectedAmount || order.currency !== env.PRODUCT_CURRENCY || order.notes?.product !== env.PRODUCT_ID) {
    throw new Error('Order does not match this product.');
  }

  const expectedSignature = await hmacHex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
  if (!timingSafeEqual(expectedSignature, signature)) throw new Error('Payment signature verification failed.');

  const payment = await razorpayRequest(env, `/payments/${encodeURIComponent(paymentId)}`);
  if (payment.order_id !== orderId || payment.status !== 'captured' || payment.amount !== expectedAmount || payment.currency !== env.PRODUCT_CURRENCY) {
    throw new Error('Payment has not been captured for the expected product amount.');
  }
  return { order, payment };
}

function absoluteDownloadLinks(origin, orderId, paymentId, token) {
  const base = new URL(origin);
  const params = new URLSearchParams({ order_id: orderId, payment_id: paymentId, token });
  return {
    normal: `${base.origin}/download/normal?${params.toString()}`,
    mobile: `${base.origin}/download/mobile?${params.toString()}`,
    epub: `${base.origin}/download/epub?${params.toString()}`
  };
}

async function sendPurchaseEmail(env, origin, payment, order, token) {
  if (!env.RESEND_API_KEY) {
    console.warn('purchase-email: RESEND_API_KEY is not configured');
    return;
  }
  const customerEmail = String(payment.email || '').trim().toLowerCase();
  if (!customerEmail) {
    console.warn('purchase-email: Razorpay did not return a customer email');
    return;
  }

  const links = absoluteDownloadLinks(origin, order.id, payment.id, token);
  const html = `<!doctype html><html><body style="margin:0;background:#f6f2e8;font-family:Arial,sans-serif;color:#17213a"><div style="max-width:620px;margin:32px auto;background:#fff;padding:36px;border-radius:16px"><div style="font-size:13px;letter-spacing:2px;color:#c7971d;font-weight:700">DEBT-FREE IN 90 DAYS</div><h1 style="margin:14px 0 8px">Your purchase is confirmed</h1><p>Thank you for your purchase. Your payment of <strong>$9.99 USD</strong> has been successfully verified.</p><p>Your purchase includes the complete Debt-Free in 90 Days guide and 90-Day Toolkit in three formats:</p><p><a href="${links.normal}" style="display:block;background:#d8a92e;color:#111;text-decoration:none;text-align:center;padding:14px;border-radius:8px;font-weight:700;margin:12px 0">Download Normal PDF</a><a href="${links.mobile}" style="display:block;background:#d8a92e;color:#111;text-decoration:none;text-align:center;padding:14px;border-radius:8px;font-weight:700;margin:12px 0">Download Mobile PDF</a><a href="${links.epub}" style="display:block;background:#d8a92e;color:#111;text-decoration:none;text-align:center;padding:14px;border-radius:8px;font-weight:700;margin:12px 0">Download EPUB</a></p><p style="font-size:13px;color:#667085">These secure download links expire after 1 hour. You can also access your downloads on the confirmation page you received after payment.</p><p style="font-size:13px;color:#667085">If you have any trouble, contact support@debtfreein90days.shop.</p></div></body></html>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Debt-Free in 90 Days <support@debtfreein90days.shop>',
      to: [customerEmail],
      subject: 'Your Debt-Free in 90 Days purchase is confirmed',
      html
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || `Resend API error (${response.status})`);
  console.log(`purchase-email: sent to ${customerEmail}`);
}

async function handleCreateOrder(request, env) {
  const body = await request.json().catch(() => ({}));
  if (body.product !== env.PRODUCT_ID) return json({ error: 'Invalid product.' }, 400);

  const amount = Math.round(Number(env.PRODUCT_PRICE_USD) * 100);
  if (!Number.isFinite(amount) || amount < 1) return json({ error: 'Product price is not configured.' }, 500);
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return json({ error: 'Razorpay credentials are not configured in Cloudflare.' }, 500);
  if (!env.DOWNLOAD_TOKEN_SECRET) return json({ error: 'Download token secret is not configured in Cloudflare.' }, 500);

  try {
    const order = await razorpayRequest(env, '/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        currency: env.PRODUCT_CURRENCY,
        receipt: `df90_${Date.now()}`,
        notes: { product: env.PRODUCT_ID }
      })
    });
    return json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error('create-order', error);
    return json({ error: `Razorpay order creation failed: ${error.message || 'Unknown error'}` }, 502);
  }
}

async function handleVerifyPayment(request, env, ctx) {
  try {
    const payload = await request.json();
    const { order, payment } = await verifyRazorpayPayment(env, payload);
    const token = await makeDownloadToken(env, order.id, payment.id);
    const query = new URLSearchParams({ order_id: order.id, payment_id: payment.id, token });

    // Email is sent after payment verification and does not block the customer redirect.
    ctx.waitUntil(sendPurchaseEmail(env, new URL(request.url).origin, payment, order, token).catch(error => console.error('purchase-email', error)));

    return json({ success: true, redirect_url: `/success.html?${query.toString()}` });
  } catch (error) {
    console.error('verify-payment', error);
    return json({ error: error.message || 'Unable to verify payment.' }, 400);
  }
}

async function handleDownloads(request, env) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get('order_id');
  const paymentId = url.searchParams.get('payment_id');
  const token = url.searchParams.get('token');
  if (!orderId || !paymentId || !token || !(await validateDownloadToken(env, token, orderId, paymentId))) return json({ error: 'Download link is invalid or expired.' }, 403);

  try {
    const { order, payment } = await verifyRazorpayPayment(env, {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: await hmacHex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`)
    });
    const expectedAmount = Math.round(Number(env.PRODUCT_PRICE_USD) * 100);
    if (order.amount !== expectedAmount || payment.amount !== expectedAmount) return json({ error: 'Purchase could not be verified.' }, 403);
    return json({ files: [
      { label: 'Normal PDF', url: `/download/normal?order_id=${encodeURIComponent(orderId)}&payment_id=${encodeURIComponent(paymentId)}&token=${encodeURIComponent(token)}` },
      { label: 'Mobile PDF', url: `/download/mobile?order_id=${encodeURIComponent(orderId)}&payment_id=${encodeURIComponent(paymentId)}&token=${encodeURIComponent(token)}` },
      { label: 'EPUB', url: `/download/epub?order_id=${encodeURIComponent(orderId)}&payment_id=${encodeURIComponent(paymentId)}&token=${encodeURIComponent(token)}` }
    ] });
  } catch (error) {
    console.error('downloads', error);
    return json({ error: 'Purchase could not be verified.' }, 403);
  }
}

async function handleDownload(request, env, kind) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get('order_id');
  const paymentId = url.searchParams.get('payment_id');
  const token = url.searchParams.get('token');
  if (!orderId || !paymentId || !token || !(await validateDownloadToken(env, token, orderId, paymentId))) return new Response('Download link is invalid or expired.', { status: 403 });

  try {
    await verifyRazorpayPayment(env, {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: await hmacHex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`)
    });
  } catch {
    return new Response('Purchase could not be verified.', { status: 403 });
  }

  const objects = {
    normal: ['Debt-Free-in-90-Days.pdf', 'application/pdf'],
    mobile: ['Debt-Free-in-90-Days_MOBILE.pdf', 'application/pdf'],
    epub: ['Debt-Free-in-90-Days.epub', 'application/epub+zip']
  };
  const [key, contentType] = objects[kind] || [];
  if (!key) return new Response('Not found.', { status: 404 });
  const object = await env.BOOKS.get(key);
  if (!object) return new Response('File not found.', { status: 404 });

  return new Response(object.body, { headers: {
    'content-type': contentType,
    'content-length': String(object.size),
    'content-disposition': `attachment; filename="${key}"`,
    'cache-control': 'private, no-store, max-age=0'
  }});
}

async function handleWebhook(request, env) {
  const signature = request.headers.get('x-razorpay-signature');
  if (!signature || !env.RAZORPAY_WEBHOOK_SECRET) return new Response('Webhook not configured', { status: 400 });
  const raw = await request.text();
  const expected = await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw);
  if (!timingSafeEqual(expected, signature)) return new Response('Invalid signature', { status: 400 });
  try {
    const event = JSON.parse(raw);
    console.log(`Razorpay webhook: ${event.event}`);
    return new Response('ok', { status: 200 });
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/api/create-order') return handleCreateOrder(request, env);
    if (request.method === 'POST' && url.pathname === '/api/verify-payment') return handleVerifyPayment(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/downloads') return handleDownloads(request, env);
    if (request.method === 'POST' && url.pathname === '/api/razorpay-webhook') return handleWebhook(request, env);
    if (request.method === 'GET' && url.pathname === '/download/normal') return handleDownload(request, env, 'normal');
    if (request.method === 'GET' && url.pathname === '/download/mobile') return handleDownload(request, env, 'mobile');
    if (request.method === 'GET' && url.pathname === '/download/epub') return handleDownload(request, env, 'epub');
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, product: env.PRODUCT_ID, price: env.PRODUCT_PRICE_USD, currency: env.PRODUCT_CURRENCY });
    return env.ASSETS.fetch(request);
  }
};
