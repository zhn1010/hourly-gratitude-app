---
name: hourly-gratitude-bot
description: Use when modifying this Cloudflare Worker Telegram gratitude bot, especially scheduling, Telegram webhook handling, D1/R2 persistence, OpenAI nudges/reactions, or daily poster generation.
---

# Hourly Gratitude Bot

Use this skill for changes to the Telegram gratitude bot in this repository.

## Workflow

1. Read `AGENTS.md` first.
2. Inspect the relevant subsystem before editing:
   - Scheduling/time: `src/time.ts`
   - Webhook routing: `src/index.ts`
   - Telegram API: `src/clients/telegramClient.ts`
   - OpenAI API: `src/clients/openaiClient.ts`
   - Persistence: `src/repository.ts` and `migrations/`
   - Business logic: `src/services/`
3. Keep implementation modular. Add low-level behavior to clients/utilities and compose it from services.
4. Keep sparse cron semantics and idempotency intact.
5. Add or update focused tests for behavior changes.

## Constraints

- Do not implement every-minute cron polling.
- Do not add Telegram streaming for nudges.
- Do not bypass `ALLOWED_TELEGRAM_USER_ID`.
- Do not scatter raw `fetch` calls outside client modules.
- Do not access D1 directly from services unless the repository layer is missing a needed method.

## Validation

Run:

```sh
pnpm run typecheck
pnpm test
```
