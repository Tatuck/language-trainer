# LanguageTrainer

Minimal web app to practise **spoken English**. Pick a topic, talk to a tutor bot, and every sentence you say comes back colour-coded — natural / could be better / mistake — with a correction, alternative phrasings and notes on the words where your Spanish accent shows most.

## How it works

1. You press the mic and speak. In Chrome your words appear live (Web Speech API); the browser also records audio and encodes it to 16 kHz mono WAV.
2. On stop, two requests go out in parallel:
   - `POST /api/turn/analyze` → an audio-capable model returns a strict JSON `Analysis`: transcript, per-sentence verdict (`good` / `improve` / `error`) with `issue`, `correction`, `alternatives`, up to 3 pronunciation notes, and a fluency line.
   - `POST /api/turn/reply` → the tutor model streams a short reply (SSE) that recasts your mistakes naturally and ends with a question.
3. Sentences render with a solid (good), dotted (improve) or wavy (error) underline; click one for the popover. Typed input works too (no pronunciation notes). "Read aloud" in the session header speaks the tutor's replies (browser `speechSynthesis`).
4. Sessions are stored in `data/lt.sqlite` (Node's built-in `node:sqlite`, no native deps) through `/api/sessions`. `/notebook` lists every sentence marked *improve* or *error* across all sessions with its correction and alternatives — the long-term review view. Sessions from the earlier localStorage version are imported once on the home page.

## Setup

```bash
npm install
cp .env.example .env.local   # add your OpenRouter key
npm run dev                   # http://localhost:3000
```

`.env.local`:

| Variable | Default | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | — | https://openrouter.ai/keys |
| `OPENROUTER_MODEL` | `meta/muse-spark-1.3` | Tutor replies. `google/gemini-3.8-flash` answers ~3× faster (see `docs/decisions.md`). |
| `OPENROUTER_AUDIO_MODEL` | `google/gemini-3.8-flash` | Transcription + analysis. Must understand audio; muse-spark does not. |

The dev server binds to `127.0.0.1`. From another device on your LAN: `npm run dev -- -H 0.0.0.0` (the mic needs HTTPS or `localhost`, so on a phone use a tunnel or an HTTPS proxy). `NEXT_PUBLIC_MOCK_API=1 npm run dev` runs the UI against a fixture without calling OpenRouter.

## Browser support

| | Chrome / Edge | Firefox / Safari |
|---|---|---|
| Record + analyse + pronunciation | yes | yes |
| Live text while speaking | yes (Web Speech API, audio goes to Google) | no — text appears after analysis |

## Scripts

```bash
npm test            # vitest
npm run typecheck   # next typegen && tsc
npm run lint
npm run spike       # compare audio models on fixtures/*.wav (real API calls)
```

`/dev/recorder` is a dev-only page to hear the encoded WAV and check the live transcript.

## Data

`data/lt.sqlite` (gitignored) holds everything; back it up or delete it to start over. `LT_DB_PATH` overrides the location.

## Safety limits

No auth — meant to run locally. Bodies over 6 MB get `413`; audio is capped at ~60 s, text fields at 4000 chars; upstream calls time out at 60 s and are aborted when you leave the page.

## Layout

```
app/page.tsx            topic / level / feedback-language picker, previous sessions
app/s/[id]/             conversation view (SessionView.tsx owns the turn flow)
app/api/turn/           analyze + reply route handlers
app/api/sessions/       session CRUD over lib/db.ts
app/notebook/           server-rendered review page (lib/notebook.ts)
components/             Recorder, UserTurn, SentencePopover, BotTurn, Legend, TextInput
lib/schema.ts           Analysis zod schema + strict JSON schema + sentence→span mapping
lib/prompts.ts          analyzer and tutor system prompts
lib/openrouter.ts       OpenAI SDK client pointed at OpenRouter, model selection
lib/llm/                request schemas, message builders, SSE encoder, error policy
lib/audio/              WAV encoding, resampling, Web Speech wrapper
lib/api.ts, lib/store.ts client API wrapper (SSE parser, mock mode), async session store client
lib/db.ts, lib/session-normalise.ts   node:sqlite singleton, in-flight state normalisation
lib/tts.ts              speechSynthesis wrapper + preference store
docs/decisions.md       model spike results
```
