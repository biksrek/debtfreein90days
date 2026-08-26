const terms = document.getElementById('terms');
const buyButton = document.getElementById('buy-button');
const statusEl = document.getElementById('payment-status');
const setStatus = (message) => { if (statusEl) statusEl.textContent = message; };
if (terms && buyButton) terms.addEventListener('change', () => { buyButton.disabled = !terms.checked; });
buyButton?.addEventListener('click', async () => {
  if (!terms?.checked) return;
  buyButton.disabled = true; setStatus('Creating your secure order…');
  try {
    const response = await fetch('/api/create-order', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:'debt-free-in-90-days'})});
    const order = await response.json();
    if (!response.ok) throw new Error(order.error || 'Could not create the order.');
    if (!window.Razorpay) throw new Error('Razorpay Checkout did not load. Please refresh and try again.');
    const rzp = new Razorpay({key:order.key_id,amount:order.amount,currency:order.currency,name:'Debt-Free in 90 Days',description:'Debt-Free in 90 Days — Guide + 90-Day Toolkit',order_id:order.order_id,prefill:{name:order.prefill_name||'',email:order.prefill_email||''},notes:{product:'debt-free-in-90-days'},theme:{color:'#d8a92e'},modal:{ondismiss:()=>{buyButton.disabled=false;setStatus('Payment window closed. You can try again.');}},handler:async function(payment){
      setStatus('Verifying payment securely…');
      const verifyResponse=await fetch('/api/verify-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payment)});
      const result=await verifyResponse.json();
      if(!verifyResponse.ok||!result.success) throw new Error(result.error||'Payment could not be verified.');
      window.location.href=result.redirect_url||'/success.html';
    }});
    rzp.open();
  } catch(error){console.error(error);setStatus(error.message||'Something went wrong. Please try again.');buyButton.disabled=false;}
});
