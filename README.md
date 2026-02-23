# BOT-CLIPPER

Private Node.js ESM Telegram bot (Telegraf) for Magic Clips from YouTube podcast URLs.

## Setup

1. Install Node dependencies:
   ```bash
   npm install
   ```
2. Create env file:
   ```bash
   cp .env.example .env
   ```
3. Set `TELEGRAM_BOT_TOKEN` from BotFather.

## VPS prerequisites (Ubuntu 24.04)

Install system tools used by the real pipeline:

```bash
apt update && apt install -y ffmpeg wget python3 python3-venv python3-pip
wget -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp
python3 -m venv .venv && . .venv/bin/activate && pip install faster-whisper
```

Recommended persistent venv path:

```bash
mkdir -p /opt/bot-clipper
python3 -m venv /opt/bot-clipper/.venv
. /opt/bot-clipper/.venv/bin/activate
pip install faster-whisper
```

## Environment variables

- `TELEGRAM_BOT_TOKEN` (required)
- `NODE_ENV` (default: `development`)
- `ADMIN_USER_IDS` (optional)
- `STORE_DRIVER` (default: `json`)
- `QUEUE_DRIVER` (default: `inmem`)
- `DATA_DIR` (default: `./data`)
- `PYTHON_BIN` (default: `python3`)
- `WHISPER_MODEL` (default: `small`)
- `WHISPER_LANGUAGE` (default: `id`)
- `OUTPUT_WIDTH` (default: `720`)
- `OUTPUT_HEIGHT` (default: `1280`)

## Run

- Development:
  ```bash
  npm run dev
  ```
- Production:
  ```bash
  npm run start
  ```

## Magic Clips pipeline

Wizard flow:

`URL -> Output Length -> Output Mode -> Confirm -> Start/Edit/Cancel`

Worker flow:

1. Check `yt-dlp`, `ffmpeg`, `python3`, `faster-whisper`.
2. Download audio-only and convert to `audio.wav` (mono 16k).
3. Transcribe Indonesian using `scripts/transcribe_faster_whisper.py`.
4. Build and score highlight candidates.
5. Assemble either:
   - one merged best output (`best`), or
   - three variants (`hot_take`, `checklist`, `story`) with anti-overlap.
6. Download source MP4, cut vertical segments, concat merge.
7. Generate Indonesian `editing-guide.md` with English Firefly prompt pack.
8. Upload MP4 + guide document(s) to Telegram.

The in-memory queue is serial: one Magic Clips job at a time.
