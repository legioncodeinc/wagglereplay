# ADR-003: ffmpeg is the default compositor; Remotion is an optional plugin

Status: Accepted (2026-08-20). Revises the initial interrogation answer (Remotion-only), which predated ADR-013's open source pivot.

## Context

Remotion offers the best authoring DX (React compositions, first-class word-karaoke captions) but its license requires any company of 4 or more people, contractors included, to buy a Company License (remotion.dev/docs/license/faq). For an AGPL tool meant for anyone to run, that makes the default path a licensing landmine for users. ffmpeg is LGPL/GPL-clean and covers the required composite: libass ASS karaoke captions via k tags, overlay chains for ripples/watermarks/logos, IR-driven crop and zoom.

## Decision

packages/compose defines a compositor interface. The default backend is pure ffmpeg (filter graphs generated from the IR and brand config). plugins/remotion ships as an optional backend for users who accept Remotion's terms; the composition keeps a reserved PiP layer slot (see ADR-007).

## Consequences

Zero license friction for every user; cheapest render compute; visual features cost more engineering (filter-graph generation, easing math in expressions; known zoompan jitter is avoided by using crop+scale expressions on an upscaled canvas rather than zoompan). Fancy authored looks route to the Remotion plugin. H.264 codec patents remain the user's concern either way.

## Alternatives Considered

Remotion default (best DX, recurring license issues filed by every 4+ person adopter). Both first-class from day one (cleanest abstraction, most work before first render).
