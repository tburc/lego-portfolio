# Pre-launch security, privacy, and legal checklist

This checklist reduces risk; it does not guarantee that the service cannot be compromised or sued. Obtain advice from qualified legal, tax, insurance, and security professionals for the operator's location and business model.

## Blocking requirements

- [ ] Choose the operator's legal name/entity, physical jurisdiction, support email, and privacy email.
- [ ] Have an attorney revise `terms.html` and `privacy.html`; remove every pre-launch warning only after approval.
- [ ] Decide whether minors may use the service. Do not knowingly accept users under 13 without a compliant parental-consent program.
- [ ] Publish using HTTPS on a controlled domain.
- [ ] Configure real HTTP security headers at the host/CDN: CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and clickjacking protection. Meta CSP is only a fallback.
- [ ] Set the exact Supabase Site URL and redirect allowlist; remove unused localhost and wildcard redirects before production.
- [ ] Enable Google/Apple only after their consent screens, domains, privacy URLs, credentials, and provider policies are complete.
- [x] Deploy every current Supabase migration and Edge Function, including `delete-account` (completed August 29, 2026; repeat for future changes).
- [ ] Verify Row Level Security with two separate non-admin test accounts and confirm neither can read or change the other's records.
- [ ] Protect the admin account with a unique password and MFA; never use it for ordinary browsing.
- [ ] Configure rate limits and bot/abuse protection for public Edge Functions so third parties cannot exhaust paid API quotas.
- [ ] Enable database backups and perform a documented restore test.
- [ ] Configure error monitoring, uptime monitoring, security alerts, and a private vulnerability-reporting channel.

## Secrets and integrations

- [ ] Rotate every secret that has ever appeared in chat, screenshots, commits, terminal history, or client-side code.
- [x] Keep only Supabase's publishable key in browser code. Store service-role and provider keys only as Supabase secrets.
- [ ] Use separate development and production credentials.
- [ ] Give marketplace keys minimum read-only permissions and document how users revoke them.
- [ ] Confirm in writing that each API permits the planned public/commercial use, caching, images, attribution, and price history.
- [ ] Create a six-month Apple client-secret rotation reminder if Apple web OAuth is enabled.

## Product and consumer protection

- [ ] Clearly label estimates, data sources, conditions, timestamps, shipping, fees, currency, and unavailable history.
- [ ] Never generate fictional historical prices or imply guaranteed returns.
- [ ] Add a working data export and verify permanent account deletion.
- [ ] Establish retention/deletion periods and a process for privacy requests and breach notifications.
- [ ] Inventory analytics, cookies, logs, email vendors, and all other processors in the Privacy Policy.
- [ ] Confirm trademark, image, catalog, and attribution permissions; keep the independent/non-affiliation disclosure visible.
- [ ] If charging money, complete entity, tax, sales-tax, refund, subscription-renewal, marketplace-facilitator, and payment-provider compliance before accepting payment.

## Release testing

- [ ] Run dependency and secret scanning on every push.
- [ ] Test authentication, logout, OAuth cancellation, password reset, session expiry, account deletion, and authorization failures.
- [ ] Test malicious text/HTML in every user-controlled field and external API response.
- [ ] Test mobile accessibility, keyboard navigation, reduced motion, and supported browsers.
- [ ] Create an incident-response plan: containment, key rotation, user notice, recovery, and post-incident review.
