# Debt-Free in 90 Days

Landing page and Razorpay checkout for **debtfreein90days.shop**.

## What is included

- Responsive sales/landing page based on the supplied ebook.
- Razorpay Standard Checkout.
- Server-side order creation.
- Server-side HMAC payment signature verification.
- Captured-payment and amount/product checks before fulfillment.
- Signed, expiring download access page.
- Privacy and no-refund Terms pages.
- Razorpay webhook endpoint.

The ebook source files are **not stored in this public repository**. This is intentional: placing the paid PDFs/EPUB in a public GitHub repository would make them freely downloadable without payment.

## Product files

Use the three supplied files as the delivery set:

1. `Debt-Free-in-90-Days_NORMAL(1).pdf`
2. `Debt-Free-in-90-Days_MOBILE(1).pdf`
3. `Debt-Free-in-90-Days(1).epub`

Upload them to private object storage such as Amazon S3, Cloudflare R2, or another service that can provide protected/signed URLs. Put those URLs into the environment variables below. Do not put the raw files in this repository.

## Environment variables

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `DOWNLOAD_TOKEN_SECRET`
- `PRODUCT_PRICE_INR`
- `DOWNLOAD_NORMAL_PDF_URL`
- `DOWNLOAD_MOBILE_PDF_URL`
- `DOWNLOAD_EPUB_URL`
- `PORT`

The landing page currently displays **₹499** as the recommended launch price. Change `PRODUCT_PRICE_INR` and the visible price in `index.html` together if you choose another price.

## Razorpay setup

1. Create/test your Razorpay account and generate Test API keys.
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` as server environment variables.
3. Keep the Key Secret server-side only.
4. Enable automatic payment capture in Razorpay, or otherwise ensure payments become `captured`.
5. Configure a webhook to `https://debtfreein90days.shop/api/razorpay-webhook`.
6. Use a strong webhook secret in `RAZORPAY_WEBHOOK_SECRET`.
7. Subscribe at minimum to `payment.captured`, `payment.failed`, and `order.paid`.
8. Test the complete flow before switching to Live Mode.

## Deployment

This project requires a Node.js server because Razorpay order creation, signature verification and download authorization must not be performed only in browser JavaScript.

Deploy it to a Node-compatible host such as Render, Railway, Fly.io, or another HTTPS server. Point `debtfreein90days.shop` to that service and enable HTTPS.

Do **not** deploy this as a static-only GitHub Pages site; the `/api/*` routes are required for secure fulfillment.

## Important production hardening

For a high-volume store, replace the demonstration webhook logging with durable database-backed purchase records and idempotent event processing. Store the Razorpay order ID and payment ID for each purchase. Use private object storage with short-lived signed URLs rather than permanent public file URLs.

The current download endpoint re-verifies the Razorpay order/payment and uses a one-hour signed access token. The token is intentionally not the file itself.

## Legal / customer-facing policy

The supplied book itself states that it is educational/informational and not financial, tax, legal, credit or investment advice. It also warns that debt, credit, tax and consumer-protection rules vary by country, state, lender and individual circumstances. The landing page and Terms page preserve that positioning.

The site states that digital sales are final/no refunds. This is a business policy and should not be treated as overriding any mandatory consumer rights that may apply to your business or customers. Have the final Terms/Privacy wording reviewed for the jurisdictions in which you sell.
