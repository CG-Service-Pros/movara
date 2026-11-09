# Password recovery

From **Sign in → Forgot password?**, enter your account email. The email contains a single-use link, valid for 30 minutes, to choose a new password (8–128 characters). Completing a reset signs out existing sessions. Invalid, expired, and previously used links offer a way to request another.

## Email configuration

Set `SMTP_HOST`, `SMTP_PORT` (587 for STARTTLS or 465 for TLS), `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in the deployment's runtime environment. Use a sender address authorized by your email provider. Redeploy after adding or changing Vercel environment variables. `APP_URL` and `BETTER_AUTH_URL` must both point to the production origin.

Recovery deliberately uses SMTP directly, bypassing the recap console/no-op fallback. Without `SMTP_HOST`, requests for both existing and unknown accounts return a service-unavailable error. Reset links and transport error details are never written to application logs. Delivery runs with Next.js `after()` so Vercel keeps the function alive after the response. A delivery failure logs only a generic message; the user can request a new link after checking spam and confirming the provider configuration.

Better Auth manages token creation, expiry, consumption, password hashing, origin checks and session revocation. Its default production rate limit for recovery requests is three requests per minute per IP per instance; deployments needing a shared limit should configure shared Better Auth rate-limit storage. Existing and unknown accounts receive the same successful response. No Supabase Auth users or schema changes are required: Movara uses Better Auth tables in Postgres.

## Verification

- `pnpm --filter @movara/web exec vitest run src/lib/password-recovery.test.ts` exercises real Better Auth HTTP handlers against an isolated in-memory Postgres database, with email delivery captured in memory. It checks password replacement, session revocation, token replay and expiry, unknown-account responses, short passwords, external redirects and missing SMTP.
- `pnpm --filter @movara/web exec playwright test e2e/password-recovery.spec.ts` checks public-page routing, form validation, success and error states using intercepted auth API responses. These UI tests do not send email.
- After deploying with SMTP configured, request a reset from `/forgot-password` and complete it from the delivered email. This final check requires a working mailbox and provider credentials.
