# Economics archive

Per-render costs on the user's own keys (why the tool is nearly free to run), plus the shelved monetization plan referenced by ADR-012.

## Cost per 3-minute walkthrough, one preset, local render (2026-08-20 prices)

| Item | Estimate |
|---|---|
| Script LLM pass | $0.01 to $0.05 |
| TTS ~2,700 chars (ElevenLabs Flash) | ~$0.14 |
| Replay + composite compute | $0 (local machine) |
| Vision QA, 30 steps (gemini-2.5-flash-lite, optional) | ~$0.006 |
| Additional preset re-render | $0 marginal API cost |

Model pricing is volatile (Gemini 3.7 promo ends 2026-12-31; GPT/xAI repriced within weeks in 2026): recompute quarterly. Receipts in replay-and-render.md and voice-and-narration.md.

## Shelved monetization plan (if a hosted offering ever exists)

Per-creator seats with included render minutes and $1/min overage; launch hypotheses were Free (watermarked, 3 videos), Creator $39/mo (60 min), Team $149/mo (5 seats, 300 min), Agency $499/mo (per-end-customer brand kits, API, 1,000 min). Rationale: undercut the market's $2 to $4 per finished minute while charging for the re-render moat. Superseded by ADR-012; kept verbatim so the option stays priced.
