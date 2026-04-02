# WOWSTER LIVE (Full App)

This is the active full platform app.

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
npm run start
```

## Database bootstrap (one-time per environment)

```bash
npm run db:bootstrap
```

## Launch validation

Run required env + DB checks before deployment:

```bash
npm run launch:check
```

If DB is intentionally unavailable during a dry run:

```bash
LAUNCH_CHECK_SKIP_DB=true npm run launch:check
```

Strict mode (recommended when payments are about to go live):

```bash
npm run launch:check:strict
```

In strict mode with `PAYMENTS_ENABLED=true`, the check requires:

- `TWOCHECKOUT_MERCHANT_CODE`
- `TWOCHECKOUT_SECRET_KEY`
- `TWOCHECKOUT_WEBHOOK_SECRET`

Optional payment env values:

- `TWOCHECKOUT_API_BASE_URL` (defaults to `https://api.2checkout.com/rest/6.0`)
- `TWOCHECKOUT_FORCE_MOCK` (`true`/`false`) to force mock redirect session mode in non-prod testing

## Post-deploy smoke checks

Run endpoint/page smoke checks:

```bash
npm run smoke:check
```

Run against production with report output:

```bash
npm run smoke:check:prod
```

To run against a remote URL:

```bash
SMOKE_BASE_URL=https://wowster.live npm run smoke:check
```
