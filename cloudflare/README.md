# Cloudflare version

The Worker implements the four existing API routes using the D1 binding DB.
Static assets are served from ../wwwroot; only that directory is uploaded as public files.

## Commands

Run from the repository root with Node.js and a package manager installed:

    pnpm dlx wrangler@4.130.0 d1 migrations apply DB --local --config cloudflare/wrangler.jsonc
    pnpm dlx wrangler@4.130.0 dev --config cloudflare/wrangler.jsonc --port 8787 --ip 127.0.0.1 --local

In another terminal:

    node cloudflare/auth.test.mjs

The auth test runs the Worker and API contract tests against an in-memory SQLite adapter using a fake bot token. No network or real token is required. For HTTP integration tests, start local Wrangler with --var BOT_TOKEN:123456:local-test-token-not-a-real-bot, then run node cloudflare/api.test.mjs. Never deploy the fake token.

Build verification without publishing:

    pnpm dlx wrangler@4.130.0 deploy --dry-run --config cloudflare/wrangler.jsonc

## Migration status

- Remote D1 database and users schema have been created.
- API and static asset routing passed local integration tests and a dry-run build.
- Three profiles imported from users.json and all fields verified. Backup is under ignored .wrangler/imports. Reconcile subsequent legacy writes at cutover.
- Worker initially deployed at https://catch-the-square.turkina-a89.workers.dev; static assets verified. BOT_TOKEN is configured; unauthenticated API requests return 401. Real Telegram launch verification is pending. The current .NET deployment is unchanged.
- Telegram signature verification is enabled; only the signed user can access their profile.
- Before switching Telegram to the new URL, import current player data, deploy and check the live API.
  Coordinate the final data copy with the switchover to avoid missing writes to the old server.
## Telegram authentication

The client sends X-Telegram-Init-Data on all API requests. The Worker verifies the
Telegram HMAC using BOT_TOKEN, rejects duplicate fields, and accepts auth_date for
24 hours with 60 seconds of future clock tolerance. Reopen the Mini App to refresh
expired launch data. All four API routes restrict access to the signed user ID;
profile names come from the signed user object. Invalid authentication returns 401;
another user's ID returns 403. The token never belongs in wwwroot or wrangler.jsonc.

Configure the real token using Wrangler's secret prompt (not a command argument):

    pnpm dlx wrangler@4.130.0 secret put BOT_TOKEN --config cloudflare/wrangler.jsonc

This requires a Worker to exist; coordinate initial publication and secret setup.
The old .NET server has not gained Telegram verification and remains a separate
legacy deployment. Identity verification does not prevent a player submitting a
fabricated score for their own account; server-side gameplay validation is separate.