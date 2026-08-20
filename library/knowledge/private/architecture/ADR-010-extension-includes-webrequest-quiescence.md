# ADR-010: The capture extension requests webRequest for network-quiescence markers

Status: Accepted (2026-08-20)

## Context

Settle detection decides where step boundaries land and when frames count as stable. MV3 allows observational chrome.webRequest (blocking removed, observation intact), enabling an in-flight request counter per tab: the networkidle2-style heuristic (at most 2 connections for 500 ms, long-lived connections excluded). Without it, settle relies on DOM mutation quiescence plus fetch/XHR patching alone. The permission costs install-warning weight and review friction on the Chrome Web Store, but pre-alpha distribution is sideloaded anyway (prd-003).

## Decision

Manifest requests tabCapture, offscreen, webNavigation, storage, scripting, webRequest, and host permissions. Settle markers combine element assertions (primary), the webRequest in-flight counter, and mutation quiescence, each recorded into the IR with its source.

## Consequences

Richer, more trustworthy settle metrics in every recording; a heavier permission prompt and a slower store review when the extension is eventually listed; justification text kept ready in the corpus.

## Alternatives Considered

Minimal permissions (easiest review, weaker signal on network-heavy apps). Two builds (permission split doubles maintenance for a pre-alpha).
