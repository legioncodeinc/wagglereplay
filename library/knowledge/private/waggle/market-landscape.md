# Market landscape (context for an open source tool)

Researched 2026-08-20 against vendor pricing/docs pages. Kept for positioning, README claims, and the day ADR-012's shelved plan ever matters. Full table with receipts: waggle-master-spec.md section 1.

## The verified gaps Waggle fills

1. Deterministic replay so videos regenerate as the app changes: none of Clueso, Guidde, Trupeer, Arcade, Supademo, Storylane, Navattic, Tango, Floik offer it (all freeze pixels or screenshots at capture). Videate does enterprise auto-update (code-level, sales-gated); Clueso Agents re-records agentically (enterprise, book-a-demo); OSS micro-tools prove the concept (auto_demo, demowright, demo-machine, specreel) but none pair it with a storyboard+voice pipeline.
2. True multi-aspect re-render: best on market is pixel cropping (Trupeer letterbox/crop; Clueso manual reflow; Guidde locks aspect at creation).
3. Visual error detection during rendering: nobody.
4. Per-end-customer brand re-renders: nobody (Trupeer/Storylane white-label the viewing layer only).
5. Creation-grade public API: enterprise-gated or absent everywhere; a Supademo customer publicly requested exactly Waggle's model (https://feedback.supademo.com/p/programmatically-create-supademos-via-apimcp).

## Pricing norms (the shelved-plan reference)

Entry $19 to $50 per creator/mo; 5-seat teams $250 to $625/mo; white-label or API at $1,500/mo or opaque enterprise; effective metered rate $2 to $4 per finished minute (Trupeer $4/min top-up, Clueso Solo ~$2.67/min, Demosmith $1.67 to $2/min); avatars roughly +50 percent; translations billed per language.
