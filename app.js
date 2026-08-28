const terms = document.getElementById('terms');
const buyButton = document.getElementById('buy-button');
const statusEl = document.getElementById('payment-status');

let emailInput = document.getElementById('customer-email');
if (!emailInput && terms) {
  const label = document.createElement('label');
  label.className = 'email-field';
  label.htmlFor = 'customer-email';
  label.innerHTML = '<span>Email address for receipt & secure download links</span>';
  emailInput = document.createElement('input');
  emailInput.id = 'customer-email';
  emailInput.name = 'customer-email';
  emailInput.type = 'email';
  emailInput.autocomplete = 'email';
  emailInput.inputMode = 'email';
  emailInput.placeholder = 'you@example.com';
  emailInput.required = true;
  label.appendChild(emailInput);
  const consentLabel = terms.closest('label');
  if (consentLabel) consentLabel.parentNode.insertBefore(label, consentLabel);
}

const setStatus = (message) => { if (statusEl) statusEl.textContent = message; };
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const updateButton = () => {
  if (buyButton) buyButton.disabled = !terms?.checked;
};
terms?.addEventListener('change', updateButton);
emailInput?.addEventListener('input', updateButton);
updateButton();

buyButton?.addEventListener('click', async () => {
  if (!terms?.checked) {
    setStatus('Please accept the no-refund digital product terms.');
    return;
  }

  let customerEmail = emailInput?.value.trim().toLowerCase() || '';
  if (!isValidEmail(customerEmail)) {
    const entered = window.prompt('Enter the email address where you want to receive your ebook and download links:');
    customerEmail = String(entered || '').trim().toLowerCase();
    if (!isValidEmail(customerEmail)) {
      setStatus('Please enter a valid email address.');
      if (emailInput) emailInput.focus();
      return;
    }
    if (emailInput) {
      emailInput.value = customerEmail;
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  buyButton.disabled = true;
  setStatus('Creating your secure order…');

  try {
    const response = await fetch('/api/create-order', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ product: 'debt-free-in-90-days', email: customerEmail })
    });
    const order = await response.json();
    if (!response.ok) throw new Error(order.error || 'Could not create the order.');
    if (!window.Razorpay) throw new Error('Razorpay Checkout did not load. Please refresh and try again.');

    // GA4: checkout started
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'begin_checkout', {
        currency: order.currency || 'USD',
        value: Number(order.amount || 999) / 100,
        items: [{item_id: 'debt-free-in-90-days', item_name: 'Debt-Free in 90 Days', price: Number(order.amount || 999) / 100, quantity: 1}]
      });
    }
    // Meta Pixel: checkout started
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'InitiateCheckout', {
        value: Number(order.amount || 999) / 100,
        currency: order.currency || 'USD',
        content_name: 'Debt-Free in 90 Days',
        content_ids: ['debt-free-in-90-days'],
        content_type: 'product'
      });
    }

    const rzp = new Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: 'Debt-Free in 90 Days',
      description: 'Debt-Free in 90 Days — Guide + 90-Day Toolkit',
      order_id: order.order_id,
      prefill: {name: '', email: customerEmail},
      notes: {product: 'debt-free-in-90-days', customer_email: customerEmail},
      theme: {color: '#d8a92e'},
      modal: {ondismiss: () => {
        buyButton.disabled = false;
        setStatus('Payment window closed. You can try again.');
      }},
      handler: async function(payment) {
        setStatus('Verifying payment securely…');
        const verifyResponse = await fetch('/api/verify-payment', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({...payment, customer_email: customerEmail})
        });
        const result = await verifyResponse.json();
        if (!verifyResponse.ok || !result.success) throw new Error(result.error || 'Payment could not be verified.');

        const purchaseValue = Number(order.amount || 999) / 100;
        // GA4: confirmed purchase
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'purchase', {
            transaction_id: payment.razorpay_payment_id || order.order_id,
            currency: order.currency || 'USD',
            value: purchaseValue,
            items: [{item_id: 'debt-free-in-90-days', item_name: 'Debt-Free in 90 Days', price: purchaseValue, quantity: 1}]
          });
        }
        // Meta Pixel: confirmed purchase
        if (typeof window.fbq === 'function') {
          window.fbq('track', 'Purchase', {
            value: purchaseValue,
            currency: order.currency || 'USD',
            content_name: 'Debt-Free in 90 Days',
            content_ids: ['debt-free-in-90-days'],
            content_type: 'product'
          });
        }

        window.location.href = result.redirect_url || '/success.html';
      }
    });
    rzp.open();
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Something went wrong. Please try again.');
    buyButton.disabled = false;
  }
});
