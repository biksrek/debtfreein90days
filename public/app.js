// Analytics: initialize Google Analytics 4 and Meta Pixel on the live asset served by Cloudflare.
(function initAnalytics(){
  // GA4
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', 'G-MK8R97Y2EW');
  if (!document.querySelector('script[data-ga4="G-MK8R97Y2EW"]')) {
    const ga = document.createElement('script');
    ga.async = true;
    ga.src = 'https://www.googletagmanager.com/gtag/js?id=G-MK8R97Y2EW';
    ga.dataset.ga4 = 'G-MK8R97Y2EW';
    document.head.appendChild(ga);
  }

  // Meta Pixel
  if (!window.fbq) {
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;
      n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
      t=b.createElement(e);t.async=!0;t.src=v;
      s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)
    }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init','1775090887165030');
    window.fbq('track','PageView');
  }
})();

const terms=document.getElementById('terms');const buyButton=document.getElementById('buy-button');const statusEl=document.getElementById('payment-status');const emailInput=document.getElementById('customer-email');const setStatus=m=>{if(statusEl)statusEl.textContent=m};const isValidEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());const updateButton=()=>{if(buyButton)buyButton.disabled=!terms?.checked};terms?.addEventListener('change',updateButton);emailInput?.addEventListener('input',updateButton);updateButton();buyButton?.addEventListener('click',async()=>{if(!terms?.checked){setStatus('Please accept the no-refund digital product terms.');return}const customerEmail=emailInput?.value.trim().toLowerCase()||'';if(!isValidEmail(customerEmail)){setStatus('Please enter a valid email address.');emailInput?.focus();return}buyButton.disabled=true;setStatus('Creating your secure order…');try{const response=await fetch('/api/create-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:'debt-free-in-90-days',email:customerEmail})});const order=await response.json();if(!response.ok)throw new Error(order.error||'Could not create the order.');
if(window.gtag){window.gtag('event','begin_checkout',{currency:order.currency||'USD',value:(Number(order.amount)||999)/100,items:[{item_id:'debt-free-in-90-days',item_name:'Debt-Free in 90 Days'}]});}
if(window.fbq){window.fbq('track','InitiateCheckout',{currency:order.currency||'USD',value:(Number(order.amount)||999)/100,content_ids:['debt-free-in-90-days'],content_name:'Debt-Free in 90 Days',content_type:'product'});}
if(!window.Razorpay)throw new Error('Razorpay Checkout did not load. Please refresh and try again.');const rzp=new Razorpay({key:order.key_id,amount:order.amount,currency:order.currency,name:'Debt-Free in 90 Days',description:'Debt-Free in 90 Days — Guide + 90-Day Toolkit',order_id:order.order_id,prefill:{name:'',email:customerEmail},notes:{product:'debt-free-in-90-days',customer_email:customerEmail},theme:{color:'#d8a92e'},modal:{ondismiss:()=>{buyButton.disabled=false;setStatus('Payment window closed. You can try again.')}},handler:async payment=>{setStatus('Verifying payment securely…');const verifyResponse=await fetch('/api/verify-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payment,customer_email:customerEmail})});const result=await verifyResponse.json();if(!verifyResponse.ok||!result.success)throw new Error(result.error||'Payment could not be verified.');
if(window.gtag){window.gtag('event','purchase',{transaction_id:payment.razorpay_payment_id,value:(Number(order.amount)||999)/100,currency:order.currency||'USD',items:[{item_id:'debt-free-in-90-days',item_name:'Debt-Free in 90 Days',price:(Number(order.amount)||999)/100,quantity:1}]});}
if(window.fbq){window.fbq('track','Purchase',{value:(Number(order.amount)||999)/100,currency:order.currency||'USD',content_ids:['debt-free-in-90-days'],content_name:'Debt-Free in 90 Days',content_type:'product'});}
window.location.href=result.redirect_url||'/success.html'}});rzp.open()}catch(error){console.error(error);setStatus(error.message||'Something went wrong. Please try again.');buyButton.disabled=false}});