# Agent Guide

This repository is a TypeScript Cloudflare Worker for a single-user Telegram gratitude bot.

## Core Rules

- Keep sparse cron scheduling. Do not replace it with every-minute polling.
- Keep cross-cutting behavior centralized:
  - HTTP retries/timeouts: `src/httpClient.ts`
  - Telegram API calls: `src/clients/telegramClient.ts`
  - OpenAI API calls: `src/clients/openaiClient.ts`
  - D1 access: `src/repository.ts`
  - Berlin time logic: `src/time.ts`
- Business behavior belongs in services under `src/services/`.
- Keep nudges short and send them with normal Telegram `sendMessage`; do not add streaming.
- Use deterministic fallbacks when LLM calls fail.
- Preserve single-user authorization through `ALLOWED_TELEGRAM_USER_ID`.

## Scheduling Contract

Cloudflare cron runs in UTC. The configured crons are intentionally a DST-safe union:

```text
50,55,58 6-20 * * *
0 20,21 * * *
```

`src/time.ts` must remain the source of truth for converting each scheduled event to Europe/Berlin and deciding whether it is a nudge, poster, or no-op.

## Data Contract

D1 stores:

- `processed_updates` for Telegram duplicate protection.
- `gratitude_entries` for all user entries.
- `nudges` for idempotent scheduled reminders.
- `daily_posters` for idempotent poster generation and status tracking.

R2 stores poster images at `posters/YYYY-MM-DD.png`.

## Commands

```sh
pnpm run typecheck
pnpm test
pnpm run dev
pnpm run deploy
pnpm run db:migrate:local
pnpm run db:migrate:remote
```

Run `pnpm run typecheck` and `pnpm test` after code changes unless dependencies or environment setup blocks it.

## Deployment Notes

Follow `README.md` for Cloudflare D1/R2 setup, secrets, deploy, and Telegram webhook setup. If model names change, update configurable vars in `wrangler.jsonc` and document the change.
