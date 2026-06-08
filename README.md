# Hourly Gratitude Telegram Bot

A single-user Telegram bot that stores gratitude entries throughout the day, nudges missed hours, reacts with an LLM-selected emoji, and sends a daily AI-generated poster at 22:00 Europe/Berlin.

## What It Does

- Accepts gratitude messages through a Telegram webhook.
- Tracks hourly gratitude from 08:00 through 21:59 Europe/Berlin.
- Sends nudges at `:50`, `:55`, and `:58` if the current hour has no gratitude entry.
- Reacts silently to each gratitude message with an LLM-selected Telegram emoji.
- Sends a daily poster at 22:00, stores the image in R2, and stores metadata in D1.
- Uses sparse cron triggers instead of every-minute polling.

## Prerequisites

- Node.js 22 or newer.
- `pnpm`.
- A Cloudflare account with Workers, D1, and R2 enabled.
- A Telegram bot token from BotFather.
- An OpenAI API key.
- Your numeric Telegram user ID.

## Install

```sh
pnpm install
```

## Create Cloudflare Resources

Create a D1 database:

```sh
pnpm wrangler d1 create gratitude_bot
```

Copy the returned `database_id` into `wrangler.jsonc`.

Create an R2 bucket:

```sh
pnpm wrangler r2 bucket create gratitude-posters
```

Apply the database migration:

```sh
pnpm run db:migrate:remote
```

For local development, apply the local migration too:

```sh
pnpm run db:migrate:local
```

## Configure Secrets

Set production secrets in Cloudflare:

```sh
pnpm wrangler secret put TELEGRAM_BOT_TOKEN
pnpm wrangler secret put TELEGRAM_WEBHOOK_SECRET
pnpm wrangler secret put OPENAI_API_KEY
pnpm wrangler secret put ALLOWED_TELEGRAM_USER_ID
```

`TELEGRAM_WEBHOOK_SECRET` should be a long random string. `ALLOWED_TELEGRAM_USER_ID` is your numeric Telegram user ID.

For local development:

```sh
cp .dev.vars.example .env
```

Then edit `.dev.vars`.

## Deploy

```sh
pnpm run deploy
```

## Deploy On Push

Pushes to `main` run `.github/workflows/deploy.yml`. The workflow installs dependencies, runs `pnpm run typecheck`, runs `pnpm test`, applies remote D1 migrations, and deploys with Wrangler.

Create these GitHub repository secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

The Cloudflare API token must be allowed to deploy Workers and manage the configured D1 database. Production bot secrets still live in Cloudflare and must be set once with `pnpm wrangler secret put ...`; GitHub Actions does not upload `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `OPENAI_API_KEY`, or `ALLOWED_TELEGRAM_USER_ID`.

After deployment, set the Telegram webhook. Replace `https://your-worker.example.workers.dev` with the deployed Worker URL:

```sh
TELEGRAM_BOT_TOKEN=123456:replace-me \
TELEGRAM_WEBHOOK_SECRET=replace-with-long-random-secret \
WEBHOOK_URL=https://your-worker.example.workers.dev \
pnpm run set-webhook
```

Telegram will send updates to:

```text
/telegram/webhook
```

## Local Development

```sh
pnpm run dev
```

Use the local Worker URL from Wrangler. For Telegram webhook testing, expose the local server with a tunnel and run `pnpm run set-webhook` with `WEBHOOK_URL` set to the tunnel URL.

## Scheduling And Cost

The bot does not run every minute. Wrangler config uses sparse UTC cron triggers:

```text
50,55,58 6-20 * * *
0 20,21 * * *
```

Because Cloudflare cron is UTC and Berlin switches between UTC+1 and UTC+2, the Worker receives both winter and summer candidate times. The code converts each scheduled event to Europe/Berlin and exits immediately unless it is an exact local action time.

## Models

Defaults are configured in `wrangler.jsonc`:

```jsonc
"OPENAI_TEXT_MODEL": "gpt-5.2",
"OPENAI_FAST_TEXT_MODEL": "gpt-5.4-nano",
"OPENAI_POSTER_TEXT_MODEL": "gpt-5.4-mini",
"OPENAI_IMAGE_MODEL": "gpt-image-2",
"POSTER_IMAGE_QUALITY": "medium",
"POSTER_IMAGE_SIZE": "1024x1536"
```

`OPENAI_TEXT_MODEL` remains the backward-compatible fallback when a task-specific text model is not set. Reactions and nudges use `OPENAI_FAST_TEXT_MODEL`; daily poster planning uses `OPENAI_POSTER_TEXT_MODEL`.

Poster image quality is pinned to `medium` to avoid `auto` selecting a high-cost output tier. If poster cost is still too high, set `POSTER_IMAGE_QUALITY` to `low`; valid values are `low`, `medium`, `high`, and `auto`.

## Useful Commands

```sh
pnpm run test
pnpm run typecheck
pnpm run dev
pnpm run deploy
pnpm run db:migrate:local
pnpm run db:migrate:remote
pnpm run set-webhook
```

## Troubleshooting

- No Telegram updates: verify the webhook URL, `TELEGRAM_WEBHOOK_SECRET`, and Worker route `/telegram/webhook`.
- `Cannot read properties of undefined (reading 'prepare')`: the D1 binding is missing or misnamed. In `wrangler.jsonc`, D1 must use `"binding": "DB"` and R2 must use `"binding": "POSTERS"`, then redeploy.
- Bot ignores messages: confirm `ALLOWED_TELEGRAM_USER_ID` matches your numeric Telegram user ID.
- Nudges do not arrive: check Cloudflare scheduled event logs and confirm the current local time is inside `08:00-21:59`.
- Duplicate nudges: D1 unique keys should prevent duplicates; inspect the `nudges` table for existing pending/failed rows.
- Poster does not send: inspect `daily_posters.status` and Worker logs for OpenAI/R2/Telegram errors.
- OpenAI image error: verify `OPENAI_IMAGE_MODEL` is available to your account.
