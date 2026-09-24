# Diplomat Global — Owner Final Tests

These are the ONLY remaining actions that require owner interaction with external accounts or human browser actions.

## 1. Vercel Preview Automation Bypass

**Why:** Paystack webhook cannot reach Preview deployment behind Vercel Authentication.

**Steps:**
1. Go to: https://vercel.com/prudence-okwubors-projects/diplomat-global/settings/deployment-protection
2. Find "Automated Deployment Protection Bypass"
3. Enable and copy the bypass secret
4. In Paystack TEST Dashboard → Settings → Webhooks:
   Set URL to: `https://<preview-url>/api/webhook/paystack?x-vercel-protection-bypass=<SECRET>`

**Current Preview:** `diplomat-global-q8i7l3knu-prudence-okwubors-projects.vercel.app`

## 2. Paystack TEST Checkout

**Why:** E2E payment verification requires a real Paystack TEST transaction.

**Steps:**
1. Visit Preview URL
2. Add products to cart
3. Complete checkout with Paystack TEST
4. Verify success page shows with receipt download

## 3. Verify Branded Customer Email

**Why:** Need to visually confirm the branded payment confirmation email renders correctly.

**Steps:**
1. After completing Paystack TEST checkout above
2. Check the email address used at checkout
3. Confirm the Diplomat-branded payment confirmation email was received
4. Verify: logo, order details, SKU, amounts, receipt download link

## 4. Verify Resend Domain (if still pending)

**Why:** Resend transactional emails require domain verification.

**Steps:**
1. Go to https://resend.com/domains
2. Add/verify `mail.diplomatglobal.com.ng`
3. Add DNS records as shown by Resend
4. Wait for verification

## 5. Rotate Skytech Credentials (from audit)

**Why:** Skytech-gadgets-hub credentials were committed to this repo (now removed from tracking).

**Steps:**
1. Go to https://supabase.com/dashboard → skytech-gadgets-hub project
2. Regenerate anon/publishable key
3. Go to https://www.emailjs.com/ → regenerate keys
4. Update the skytech project's .env with new values

## 6. Delete Stale Branch

**Why:** Typo branch `tesing` exists on remote.

**Steps:**
```bash
git push origin --delete tesing
```

## 7. Final Production Approval

**Why:** Freebuff never promotes to Production without owner approval.

**Steps:**
1. After all Preview testing passes
2. Merge testing → main in GitHub
3. Vercel will auto-deploy Production from main
