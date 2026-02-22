# BOT-CLIPPER

Minimal Node.js ESM Telegram bot scaffold with long polling and modular routing.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create your env file:
   ```bash
   cp .env.example .env
   ```
3. Set `TELEGRAM_BOT_TOKEN` from BotFather.

## Environment variables

- `TELEGRAM_BOT_TOKEN` (required): Telegram bot token from BotFather.
- `NODE_ENV` (default: `development`)
- `ADMIN_USER_IDS` (optional): comma-separated numeric Telegram user IDs.
- `STORE_DRIVER` (default: `json`): `json` or `redis` (stub).
- `QUEUE_DRIVER` (default: `inmem`): `inmem` or `bullmq` (stub).
- `DATA_DIR` (default: `./data`)

## Run

- Development:
  ```bash
  npm run dev
  ```
- Healthcheck:
  ```bash
  npm run healthcheck
  ```
- Migrate placeholder:
  ```bash
  npm run migrate
  ```

## Notes

- Queue driver `inmem` is a single-process stub queue.
- `bullmq` adapter exists as a placeholder and is not implemented.
- Magic Clips processing is simulated and returns placeholder clip links.
