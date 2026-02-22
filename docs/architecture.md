# BOT-CLIPPER Architecture

## Runtime flow

- `src/index.mjs` loads environment config, initializes adapters, registers middlewares/router/workers, then starts Telegraf long polling.
- `src/bot/router.mjs` wires `/start`, `/cancel`, help callback routing, and all module registrations.

## Modules

- `src/bot/modules/magicClips/`: functional wizard flow for YouTube URL to clip-job request.
- `src/bot/modules/*` (others): callback routes with "Coming soon" replies.

## State and storage

- Session data is persisted per `chatId:userId` by `src/bot/middlewares/session.mjs`.
- `src/core/storage/jsonStore.mjs` stores state in `${DATA_DIR}/state.json` using atomic write/rename.
- Redis store adapter is scaffolded but intentionally not implemented.

## Queue and workers

- `src/core/queue/inmemQueue.mjs` provides `add()`, `process(handler)`, `runNext()`.
- `src/workers/index.mjs` registers handlers by job type.
- `src/workers/magicClips.worker.mjs` simulates processing and writes placeholder outputs.
- BullMQ queue adapter is scaffolded but intentionally not implemented.
