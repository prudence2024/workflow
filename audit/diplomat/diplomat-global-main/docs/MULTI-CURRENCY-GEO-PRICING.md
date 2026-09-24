# Multi-Currency / Geo-Pricing Research — Diplomat Global

## Status: DEFER (not needed now)

## Recommendation: DEFER

**Reasons to DEFER:**

1. **Single-currency simplicity**: Diplomat Global currently sells in NGN via Paystack. Adding multi-currency introduces significant complexity in pricing, inventory, accounting, and refund handling — all before the core product is fully validated.

2. **Paystack limitation**: Paystack charges in the currency configured on the account. While Paystack supports NGN, USD, GHS, ZAR, and KES, the settlement currency is determined by the account configuration, not per-transaction. Supporting multiple charge currencies requires either multiple Paystack accounts or accepting settlement risk.

3. **Vercel + Cloudflare conflict**: Deploying Cloudflare in front of Vercel can break server-side rendering, caching behavior, and edge functions. Vercel already provides edge caching, CDN, and image optimization. Adding Cloudflare adds a layer of complexity without clear benefit at this stage.

4. **VPN/geolocation unreliability**: CF-IPCountry and similar headers are unreliable for users on VPNs, corporate networks, or traveling. Incorrect geolocation leads to wrong pricing, which is worse than no geo-pricing.

5. **SEO impact**: Serving different prices by country can confuse search engines. Google needs canonical pricing. Dynamic rendering based on geolocation can cause indexation issues.

6. **Refund complexity**: If a customer pays in USD and the refund must be processed in NGN (due to settlement currency), the accounting becomes complex. Exchange rate fluctuations between purchase and refund create financial exposure.

7. **Accounting/legal**: Multi-currency requires proper FX rate tracking, gain/loss calculations, and potentially different tax/VAT rules per jurisdiction. This needs professional accounting guidance before implementation.

## When to revisit

- After core product validation and stable revenue
- When expanding to Ghana, South Africa, or Kenya markets
- When Paystack multi-currency settlement is needed
- When professional accounting advice is obtained for FX handling

## Technical considerations if implemented later

### Architecture

- **Canonical pricing**: Product prices remain in NGN as the source of truth
- **Display currency**: User can override suggested currency
- **Payment currency**: Must be explicitly supported by Paystack account
- **Rate source**: Use a reputable FX API (e.g., Paystack's own rates, or Open Exchange Rates)
- **Rate caching**: Cache rates for 1-4 hours to avoid API rate limits
- **Price rounding**: Round to avoid unappealing decimals (e.g., $12.99 not $12.973)

### Cloudflare considerations

- **Not needed**: Vercel already provides CDN, edge caching, and image optimization
- **If needed later**: Use CF-IPCountry header at the application layer, not at the Cloudflare edge
- **Alternative**: Use Vercel Edge Functions to detect geolocation and pass it to the application

### Paystack integration

- **Supported charge currencies**: NGN, USD, GHS, ZAR, KES
- **Settlement**: Determined by account configuration
- **Refunds**: Must match the original charge currency
- **Split payments**: Not supported across currencies

## Conclusion

Multi-currency is a future feature that requires careful planning, professional accounting advice, and stable core product revenue. The current NGN-only approach is appropriate for a Nigerian e-commerce platform in its validation phase.
