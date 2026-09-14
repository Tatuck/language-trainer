# Decisions

## 2026-09-14 — Task 0 spike: audio model

Sent two 14.6 s 16 kHz mono WAVs (espeak-ng, Spanish voice reading English = heavy accent; and en-us voice) through OpenRouter with the analyzer prompt + strict JSON schema, `reasoning_effort: "low"`. Script: `npm run spike`.

| | `meta/muse-spark-1.3` | `google/gemini-3.8-flash` |
|---|---|---|
| Accented WAV transcript | hallucinated ("Ey yo, ABC 20 cigars and Yara Sandy llamadre…") | correct (dropped one "am") |
| Clean WAV transcript | correct | correct |
| Corrections / alternatives (Spanish explanations) | good | good |
| Pronunciation notes (with "Spanish accent, 1-3 words" nudge) | — | 3 accurate notes (comfortable 4 syllables, "eSpain", years→"jears") |
| Analysis latency | 9-11 s (1000-1750 reasoning tokens) | 6-8 s |
| Reply TTFT (streaming, `low`) | 5.7 s | 1.7 s |
| Cost per analysis turn | $0.006-0.011 | ~$0.003 |
| `prompt_tokens_details.audio_tokens` | 0 (audio not really processed) | ~25 tokens/s |
| Reasoning can be disabled? | no (400 "Reasoning is mandatory") | no |

**Decision**
- `OPENROUTER_AUDIO_MODEL=google/gemini-3.8-flash` — muse-spark's audio understanding is unusable (matches OpenRouter's "not fully supported" note).
- `OPENROUTER_MODEL=meta/muse-spark-1.3` kept as the reply model (user's choice). Switching it to gemini cuts wait per turn from ~6 s to ~2 s and halves cost.
- Reply route sends audio to the chat model only when chat model == audio model; otherwise it sends text (browser ASR hint in parallel, or the analysis transcript).
- Audio format: 16 kHz mono PCM16 WAV, base64 `input_audio`. ~460 KB per 15 s.
