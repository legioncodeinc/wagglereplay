# Security audit: 2026-08-21: legion/handoff-application-automation-3f40ae

Date: 2026-08-21 | Run: security-stinger (Ship Gate step 1 of 3) | Executor: security-worker-bee | Trigger: five GitHub Code Scanning (CodeQL) alerts on PR #1, plus the SigV4 review the execution ledger raised for this gate (W5 row).

## Executive summary

- Scope: the five CodeQL alert sites and their surrounding modules (`packages/share/src/r2/`, `apps/extension/src/lib/accessibility.ts`, `packages/compose/src/captions/`, `fixtures/demo-app/src/server.ts`); the hand-rolled AWS SigV4 signer (`packages/share/src/r2/sigv4.ts` and its only caller `client.ts`); and a full checklist pass over the workspace's real attack surface: the Studio SvelteKit server's endpoints, filesystem path handling, child-process invocation, and secret hygiene.
- Coverage: **REDUCED COVERAGE, declared.** security-stinger is grounded in a SvelteKit + Neon/Drizzle + WorkOS + Stripe + Vercel + Doppler + GoHighLevel stack. This repo has one SvelteKit app (`apps/studio`, adapter-node, loopback, local-first per ADR-014) and none of the rest: no database (ADR-015 makes the filesystem the datastore), no auth provider, no payment provider, no hosted deployment, no third-party webhook intake. Those catalog sections are genuinely not-applicable rather than unchecked, and are marked as such below. The surfaces that actually dominate here (subtitle-format injection, child-process argument construction, path traversal, hand-rolled request signing, a Chrome content script running on hostile pages) sit outside the researched catalog and were audited from first principles with empirical verification where a claim was load-bearing.
- Findings: **0 Critical, 0 High, 4 Medium, 3 Low, 1 false positive.**
- CodeQL disagreement, stated plainly: all five alerts were rated HIGH by CodeQL. This audit rates none of them High. Four were fixed anyway, so the disagreement is academic for four of five; the fifth is argued as a false positive in full below and left unchanged in behavior. No alert was suppressed, no `codeql[...]` comment was added, and no test was weakened.
- Ship Gate status: **cleared to proceed to quality-stinger.** Every Medium-or-above finding is fixed, and a full re-evaluation pass ran against the updated code (see Re-evaluation).

## Surface coverage checklist

### SvelteKit attack surface

`apps/studio` is the only SvelteKit app. Endpoints audited: `api/frames/[version]/[stepDir]/[fileName]`, `api/settings`, `api/steps/[stepIndex]/description`, `api/watch`, `waggle/sessions/[sessionId]/{events,meta,video/chunks/[chunkIndex]}`.

- Path traversal on the frame-serving route: **None detected.** `apps/studio/src/lib/server/frame-path.ts:19-43` validates all three URL segments against anchored allow-list patterns (`/^step-\d{3,}$/`, `/^(before|click|settled)\.png$|^frame_t[+-]\d+\.png$/`, `/^\d+$/`) and throws before any `path.join`. Correctly implemented.
- Path traversal on the session-upload routes: **None detected.** `apps/studio/src/lib/server/sessions.ts:61-66` allow-lists the session id to `[A-Za-z0-9._-]+` and rejects `.` and `..`; `:92` requires a numeric chunk index; `:167` rejects a `video.filename` containing `/`, `\`, or `..` before it reaches `path.join`.
- `{@html}` / `innerHTML` sinks: **None detected** in shipped code. The only `innerHTML` writes are in test files and inside the fixture app's own self-contained inline script (`fixtures/demo-app/src/markup.ts:388`), which renders strings the fixture itself authored.
- Endpoint authorization: see the Low finding L2. No endpoint has an authorization check; the design relies on loopback binding rather than authentication.
- CSRF: SvelteKit's default `csrf.checkOrigin` is in effect (no `svelte.config.js` override). The three upload routes use `video/webm`, `application/x-ndjson`, and `application/json` content types, which are all non-simple and therefore preflighted by a browser; a downgrade attempt to `text/plain` falls inside SvelteKit's own checked content types and is rejected. The drive-by browser path is closed. See L2 for the DNS-rebinding residual.
- One finding in this surface: **M2** (Chrome extension content script), detailed below.

### Authorization and tenancy (Drizzle / Neon)

**Not applicable.** ADR-015 makes filesystem project directories the datastore; there is no database, no ORM, no tenant model, and no RLS surface. Verified: no `drizzle`, `postgres`, `neon`, or `sql.raw` dependency or import anywhere in the workspace. The CVE-2025-48757 "assume RLS is missing" check has nothing to apply to.

### Secrets and environment

- Hardcoded secrets in source: **None detected.** A sweep for assigned high-entropy literals against `api_key|secret|password|token` returned only clearly-labelled test placeholders (`'test-key-not-real'` in the narrate and cli test suites). No LLM-placeholder-shaped secrets (`supersecretkey`, `changeme`, `your-secret-key`) present.
- Secret-name-only discipline (ADR-008): **correctly implemented and worth naming.** `packages/share/src/r2/env.ts` prints only variable NAMES and their purpose (`describeR2EnvRequirements`), never values, and the module doc comment states the rule explicitly. `packages/narrate`'s TTS adapters follow the same shape.
- `.npmrc`: no auth tokens; `strict-peer-dependencies=false` and `auto-install-peers=true` only.
- Coverage gap to record honestly: `.env.example` could not be read; the sandbox's dotenv policy denied access to it. Its contents are therefore **unverified by this pass**. It is referenced by ADR-008 as the documented place machine env is described, so a human should eyeball it once to confirm it holds names and not values.
- Two findings in this surface: **L1** and **L3**, detailed below.

### Webhooks and third-party intake

**Not applicable.** No Stripe, no GoHighLevel, no inbound webhook of any kind. The nearest analogue is the Studio server's session-upload intake from the Chrome extension, which is audited under the SvelteKit surface above and under L2.

### Dependencies and supply chain

- Lockfile: `pnpm-lock.yaml` present, single lockfile, pnpm 11.9.0 pinned via `packageManager`. No `package-lock.json`/`yarn.lock` coexisting.
- Package hallucination / slopsquatting sweep: **None detected.** Every direct dependency across the workspace resolves to a well-known real package (`@sveltejs/kit`, `vitest`, `zod`, `esbuild`, `playwright-core`, `jsdom`, `@biomejs/biome`, `commander`, `tsx`, `@types/chrome`). No name in the tree is unrecognized or near-miss-shaped.
- Notable and good: the R2 uploader deliberately avoids `@aws-sdk/client-s3`, which removes a very large transitive tree from an optional feature. That choice is what makes the SigV4 review below necessary, and the ledger was right to route it here.
- `.github/workflows/` was deliberately **not opened or modified**: another agent holds that file this session. CI install-mode (`pnpm install --frozen-lockfile` vs unpinned) is therefore **not assessed in this pass** and should be confirmed by `github-repo-health-stinger` at Ship Gate step 3.

### Headers and transport

- The frame route sets an explicit `content-type: image/png` and a long immutable `cache-control`. It does not send `X-Content-Type-Options: nosniff`. On a loopback-only, single-origin, developer-facing server serving files its own pipeline wrote, this is hygiene rather than exposure. Recorded as **Low (L2, folded in)** rather than a separate Medium, because the rubric's Medium entry for that header assumes a production web deployment, which ADR-014 explicitly rules out.
- No CSP: same reasoning. `apps/studio` is not deployed to a hosted platform.
- Transport: all traffic is loopback HTTP by design. The only outbound TLS call is the R2 `PUT`, which builds `https://` unconditionally (`client.ts:78-80`).

### AI-generated code patterns

Per `guides/08`, weighted heaviest. The dominant AI failure class (authorization logic and missing access controls) has a small surface here because there is no multi-user model at all, but its local analogue does exist and is recorded as **L2**: every Studio endpoint is unauthenticated and relies on the bind address alone.

The second pattern, insecure defaults inherited unexamined, did **not** materialize: `packages/cli/src/commands/studio.ts:7` sets `HOST` to `127.0.0.1` explicitly rather than letting adapter-node's `0.0.0.0` default stand. That is exactly the "never assume the safe default was applied" check, and here it was applied correctly and deliberately.

The third pattern, iterative degradation of previously-correct security logic, is visible in miniature in **M3**: `escapeAssText` carried a doc comment that reasoned correctly about the format's constraint while the implementation did not actually enforce what the comment claimed. That is the shape this gate exists to catch.

### PII and logging hygiene

- No Sentry, no PostHog, no analytics SDK anywhere in the workspace. The rubric's Sentry/PostHog entries have nothing to apply to.
- Credential material in logs: one finding, **L1**, detailed below.
- Recorded walkthrough content (page text, accessible names, screenshots) is user data that flows into the IR and into narration prompts by design; ADR-008 governs the credential subset of that and is correctly implemented (capture masks credential-marked inputs, QA screenshots get redaction boxes). No violation detected.

## Findings detail

### [MEDIUM] CSS selector injection from an attacker-influenced DOM id

- **Location:** `apps/extension/src/lib/accessibility.ts:85-86` (pre-fix)
- **Surface:** SvelteKit / client attack surface (Chrome MV3 content script)
- **CodeQL:** alert #2, `js/incomplete-sanitization`, rated HIGH. Verdict: **real**.
- **Description:** `labelForInput` interpolated an element's `id` into a CSS attribute selector, escaping `"` but not the escape character `\`. The id comes from the page being recorded, which is attacker-controlled whenever an author records a page they do not own, which is the tool's normal use. Two distinct failures follow. An id ending in a bare backslash produces `label[for="x\"]`, where `\"` is a CSS-escaped quote, leaving the string unterminated and throwing a `SyntaxError` out of `querySelector`, killing element sampling for that element. An id shaped like `a\" ] , label , [ b="` is worse: the escaper turns the `"` into `\"`, so the emitted selector contains `\\` followed by `"`, and CSS reads `\\` as one literal backslash and then treats the `"` as terminating the string. The selector breaks out into a selector list and matches a label of the page's choosing, letting a hostile page dictate the accessible name recorded into the IR for an element the author clicked.
- **Evidence:** `const escaped = id.replace(/"/g, '\\"'); const explicit = doc.querySelector(\`label[for="${escaped}"]\`);`
- **Remediation:** fixed. The selector is gone entirely. The lookup now iterates `doc.querySelectorAll('label[for]')` and compares the `for` attribute with `===`, preserving document order and the previous fall-through behavior when the matched label has no text. `CSS.escape` would also have been correct, but it is a realm-dependent global, and removing the string-building step removes the vulnerability class rather than delegating it. Regression coverage added at `apps/extension/test/lib/accessibility.test.ts`, including the breakout id, the trailing-backslash crash, and a legitimate backslash-bearing id that must still match.
- **Status:** fixed in this session.

### [MEDIUM] ASS caption escaper reconstitutes control sequences from doubled backslashes

- **Location:** `packages/compose/src/captions/ass-primitives.ts:103-109` (pre-fix)
- **Surface:** third-party format intake (subtitle rendering), AI-generated code patterns
- **CodeQL:** alerts #3 and #4, `js/incomplete-sanitization`, rated HIGH. Verdict: **real, with a corrected threat model.**
- **Description:** the escaper ran four chained `replace` calls. The first, `/\\([Nnh])/g -> '$1'`, was meant to neutralize ASS's hard line break, soft line break, and non-breaking space by deleting the backslash. It deletes exactly one backslash, so an input of `\\N` survives the pass as a working `\N`. The later stages then insert backslashes of their own, so the function's output is re-read by a grammar that the earlier stages already wrote into. That is the classic sanitizer re-entrancy defect.
- **Evidence:** `.replace(/\\([Nnh])/g, '$1').replace(/\{/g, '\\{').replace(/\}/g, '\\}')`. Feeding the pre-fix function the input `AAA\\NBBB` yields `AAA\NBBB`.
- **Reachability, determined empirically rather than assumed:** see the dedicated section below. Summary: override-block injection is **not** achievable; hard-line-break injection **is**, and was confirmed at the renderer.
- **Severity reasoning:** the alert text anticipated that text could escape into rendering control via an injected `{...}` override block, which would have been the most serious of the five. Rendering ten candidate inputs through ffmpeg 9.0's libass shows that does not happen. What does happen is control-sequence injection limited to line breaks and non-breaking spaces. Caption text crosses a real trust boundary (it originates in a brand kit and narration script inside a git-committable, shareable project directory per ADR-015), and the injected break violates the module's own stated contract that callers pass already-split lines, which the karaoke `\k` timing depends on. That is an output-integrity defect on untrusted input, not a Critical or High under the rubric: no authentication is bypassed, no secret is exposed, no server-rendered XSS is possible. Medium.
- **Remediation:** fixed. `escapeAssText` is now a single pass over the input's code points that drops every caller-supplied backslash, emits `\{` and `\}` for braces, and collapses `\r`, `\n`, and `\r\n` to one space. Because it is one pass, no stage re-reads another stage's output, and every backslash in the result is one the function itself inserted, so no output backslash can pair with a neighbour to re-form a control sequence. The doc comment was rewritten: the old one asserted a tradeoff the code did not implement. Regression coverage added to `packages/compose/test/ass-captions.test.ts`.
- **Status:** fixed in this session.

### [MEDIUM] SigV4 signs the canonical header block in a different order than it declares in SignedHeaders

- **Location:** `packages/share/src/r2/sigv4.ts:63` and `packages/share/src/r2/client.ts:93` (pre-fix)
- **Surface:** hand-rolled request signing (ledger W5 referral)
- **CodeQL:** not flagged. Found by this review.
- **Description:** `buildCanonicalRequest` sorted the canonical header block with `a.localeCompare(b)` while `client.ts` derived the `SignedHeaders` string with the default `Array.prototype.sort`, which is code-unit order. SigV4 mandates byte order for both, and requires that the two agree. `localeCompare` weighs punctuation below letters instead of by code point, so the two comparators genuinely disagree on realistic header names: verified on this Node build, byte order puts `x-amz-date` before `x-amz_date` (0x2D before 0x5F) while `localeCompare` reverses them. `localeCompare` is also ICU-data-dependent, so the same request could sign differently on two machines, which is at odds with the determinism this project asserts elsewhere.
- **Evidence:** `.sort(([a], [b]) => a.localeCompare(b))` in `buildCanonicalRequest`, against `[...headers.keys()].sort()` in `putObject`.
- **Impact:** fails closed. A mismatch produces `SignatureDoesNotMatch` from R2 rather than a forgeable signature, so this is a correctness and determinism defect in security-critical code, not an authentication bypass. It is latent today because the four headers actually signed (`content-type`, `host`, `x-amz-content-sha256`, `x-amz-date`) happen to order identically under both comparators; it becomes live the moment a fifth header is added.
- **Remediation:** fixed. A single exported `compareHeaderNames` (plain byte comparison, no locale) is now used by both `buildCanonicalRequest` and `putObject`, so the two orders cannot drift apart. Regression test added to `packages/share/test/sigv4.test.ts` asserting byte order, agreement with the default sort, and divergence from `localeCompare`.
- **Status:** fixed in this session.

### [MEDIUM] Polynomial-time regular expression on the R2 public base URL

- **Location:** `packages/share/src/r2/env.ts:77` (pre-fix)
- **Surface:** secrets and environment
- **CodeQL:** alert #1, `js/polynomial-redos`, rated HIGH. Verdict: **real, but Low on its own merits; fixed regardless.**
- **Description:** `.replace(/\/+$/, '')` anchors a greedy `+` to end-of-string. On a value ending in a long run of `/` that does not match, the engine retries from every starting offset, giving quadratic behavior in the length of the run.
- **Evidence:** `publicBaseUrl: (values.publicBaseUrl as string).replace(/\/+$/, '')`
- **Severity reasoning:** rated **Low**, not High. The only input is `WAGGLE_R2_PUBLIC_BASE_URL`, an environment variable set by the operator on their own machine. There is no request path, no remote attacker, and no multi-user server involved, so "uncontrolled data" overstates the trust relationship. It is fixed anyway because the fix is free and removes the class.
- **Remediation:** fixed. Replaced with `stripTrailingSlashes`, a linear character scan with no regex. Behavior is identical for every input; the existing `r2-env` tests pass unchanged.
- **Status:** fixed in this session.

### [FALSE POSITIVE] User-controlled timer duration in the demo fixture server

- **Location:** `fixtures/demo-app/src/server.ts:120`
- **Surface:** test fixture
- **CodeQL:** alert #5, `js/resource-exhaustion`, rated HIGH. Verdict: **false positive against the current source.**
- **Argument:** the duration reaching `setTimeout` is provably confined to `[0, 5000]` milliseconds before the alert's own line is reached, and it was already so before this audit began. `fixtures/demo-app/src/routes.ts:65` defines `MAX_FETCH_DELAY_MS = 5000`. The pre-existing code read:

  ```ts
  const parsedDelay = rawDelay === null ? DEFAULT_FETCH_DELAY_MS : Number(rawDelay);
  const delay =
    Number.isFinite(parsedDelay) && parsedDelay >= 0
      ? Math.min(parsedDelay, MAX_FETCH_DELAY_MS)
      : DEFAULT_FETCH_DELAY_MS;
  ```

  Enumerating every path: a missing parameter yields the 200 ms default; `Number('abc')` yields `NaN` and `Number('1e999')` yields `Infinity`, both failing `Number.isFinite` and falling to the 200 ms default; a negative value fails `parsedDelay >= 0` and falls to the default; any finite non-negative value passes through `Math.min` against 5000. There is no input that reaches `setTimeout` with a value above 5000. The bound is also already asserted by two existing tests: `fixtures/demo-app/test/server.test.ts:81` sends `?delay=999999999` and requires the response to report exactly 5000, and `:88` requires a malformed value to fall back to the default. The task brief that routed this alert here assumed the bound was absent; it was not. What CodeQL most plausibly lost is the flow through a `Math.min` that sits inside one branch of a ternary whose guard is a separate expression, which its upper-bound barrier does not always recognize.
- **Action taken:** no behavior change, no suppression, no test relaxed. The clamp was lifted into a named `clampFetchDelayMs` helper where `Math.min` is the unconditional final operation on every return path. This is byte-for-byte equivalent for every input, and both existing delay tests still pass, so nothing about the configurable delay PRD-003 and PRD-009 depend on has changed. The reason for touching it at all is robustness rather than analyzer appeasement: as written, the bound lived inside one ternary branch, so a future edit to the validity guard could silently drop it, whereas now it cannot be bypassed without deleting the `Math.min` outright. If the alert persists after this restructure, it should be dismissed in the GitHub UI as "used in tests" with a link to this section, not worked around in code.
- **Status:** documented as a false positive; hardened structurally without behavior change.

### [LOW] R2 error message can carry credential-adjacent material into terminal and CI logs

- **Location:** `packages/share/src/r2/client.ts:36` and `:127`, surfaced at `packages/cli/src/commands/export.ts:128`
- **Surface:** PII and logging hygiene
- **Description:** `R2UploadError` embeds up to 500 characters of the R2 response body in its message, and `waggle export --upload` writes that message to the user's terminal via `CliExitError`. S3-compatible services answer a `SignatureDoesNotMatch` with an XML body containing `<AWSAccessKeyId>`, `<StringToSign>`, and `<CanonicalRequest>`. The secret access key is never in that body and never leaves the process, so no signing material is disclosed, but the access key id and the full canonical request can land in scrollback or a CI log.
- **Evidence:** `super(\`R2 PUT of "${key}" failed with HTTP ${status}: ${bodySnippet}\`);` and `const bodySnippet = (await response.text().catch(() => '')).slice(0, 500);`
- **Severity reasoning, flagged for a human call:** rated Low because an access key id is transmitted in cleartext in the `Authorization` header of every request by design and is not sufficient to sign anything on its own. It is arguably Medium because CLAUDE.md's non-negotiable list and ADR-008 both say secrets must never enter logs, and an access key id is credential material even if it is not secret material. ADR-008's own text scopes itself to demo credentials for replaying authenticated apps rather than to the tool's own R2 credentials, which is why this is not being auto-escalated. **NEEDS HUMAN REVIEW** on the severity call.
- **Recommended remediation (not applied, per minimal blast radius on a Low):** strip the contents of `AWSAccessKeyId`, `StringToSign`, `StringToSignBytes`, and `CanonicalRequest` elements from `bodySnippet` before it reaches the message, keeping the `Code` and `Message` elements that make the error actionable.
- **Status:** documented for follow-up.

### [LOW] Studio endpoints are unauthenticated and rely on the bind address alone

- **Location:** `apps/studio/src/routes/waggle/sessions/[sessionId]/meta/+server.ts:28`, `.../video/chunks/[chunkIndex]/+server.ts:18`, `.../events/+server.ts`; `packages/cli/src/commands/studio.ts:73`
- **Surface:** authorization, AI-generated code patterns
- **Description:** there is no `hooks.server.ts` and no authorization check on any route. `POST /waggle/sessions/:id/meta` writes into the user's project directory and runs the full `@waggle/ingest` pipeline, which spawns ffmpeg. Security rests entirely on the server binding to `127.0.0.1`. That default is correctly and deliberately set (`DEFAULT_HOST = '127.0.0.1'`, passed as `HOST` to the child), and the browser drive-by path is closed by CORS preflight plus SvelteKit's origin check, as recorded under the SvelteKit surface. Two residuals remain. First, DNS rebinding: a rebound hostname makes `Origin` and `url.origin` agree, so SvelteKit's check passes while the request lands on loopback; a `Host` header allow-list in a `handle` hook is the standard mitigation. Second, `BODY_SIZE_LIMIT: 'Infinity'` removes adapter-node's 512 kB cap on these unauthenticated write endpoints, and `assembleVideo` buffers every chunk in memory via `Buffer.concat`, so a single request can exhaust disk or memory.
- **Severity reasoning:** Low rather than Medium because exploitation requires either local code execution, DNS rebinding, or the user explicitly passing `--host 0.0.0.0`, and because ADR-014 scopes this to a local-first runtime. It is recorded rather than fixed because a correct body cap requires choosing a limit that does not break the extension's legitimate video-chunk uploads, which is a product decision, not a security patch.
- **Recommended remediation:** add a `handle` hook rejecting requests whose `Host` is not `localhost` or `127.0.0.1` (plus the explicitly configured host), and replace `Infinity` with a concrete per-chunk ceiling derived from the recorder's `MediaRecorder` timeslice.
- **Status:** documented for follow-up.

### [LOW] R2 account id is not shape-validated before becoming a URL host

- **Location:** `packages/share/src/r2/client.ts:74-80`
- **Surface:** secrets and environment
- **Description:** `host` is built as `${this.config.accountId}.r2.cloudflarestorage.com` and the request URL as `https://${host}${canonicalUri}`, with no validation that `accountId` is a bare identifier. A value containing `/` or `#` would redirect the signed request to a different origin. The value comes from the operator's own `WAGGLE_R2_ACCOUNT_ID`, which is the configuration trust root, so this is defense in depth rather than a live vulnerability, and no signing material would be disclosed to the wrong host in any case.
- **Recommended remediation:** assert `/^[a-f0-9]{32}$/i` (Cloudflare account ids are 32 hex characters) in `readR2ConfigFromEnv`, alongside the existing missing-key reporting.
- **Status:** documented for follow-up.

## ASS caption injection: reachability analysis

The alert asserted that if ASS caption injection were achievable this would be the most serious of the five, and asked for reachability to be determined rather than assumed. It was determined empirically, by rendering candidate inputs through the real renderer (ffmpeg 9.0's bundled libass, the same one `packages/compose` shells out to) at 320x240 on a black background and measuring the bounding box of lit pixels. A caption that moves to the top of the frame proves an `{\an8}` override block was parsed; a caption whose bounding box doubles in height proves a hard line break was parsed.

**Can an override block be injected? No.** Ten input shapes were run through the pre-fix `escapeAssText` and rendered: one, two, and three leading backslashes before `{\an8}`, `\h{`, `\N{`, `\t{`, and controls. In every case the text rendered at the bottom of the frame in the default position, meaning no `{` was ever treated as opening an override block. The mechanism is worth stating because it is the crux of the author's original reasoning: libass has no `\\` escape, so in a run of backslashes each non-escape backslash consumes exactly one character and the final `\{` pair always survives intact. The escaper inserts a `\` before every `{`, and that inserted backslash can only be swallowed if the preceding character forms an escape with it, which `\\` does not. The author's doc comment was therefore **factually correct** that ASS has no literal-backslash escape, and correct that this closes the brace path.

**Can any control sequence be injected? Yes, and it was.** The author's implementation of that correct reasoning was wrong. Neutralizing `\N` by deleting one backslash means `\\N` survives as a working `\N`. Rendering the pre-fix output of the input `AAA\\NBBB` produced a caption occupying rows 164 to 222 of the frame, height 59 pixels, pixel-identical geometry to a control file containing a genuine `\N` hard break, against 23 pixels for the same text on one line. `\\h` and `\\n` behave the same way. So the incomplete-sanitization alerts were correct that the escaper is incomplete, while the specific harm they anticipated was not reachable.

**What the fix guarantees.** The invariant is now statable in one sentence and mechanically enforced by the single-pass structure: *every backslash in the output is one this function inserted, immediately before a `{` or a `}`.* No caller-supplied backslash survives, so nothing can pair with an inserted backslash, and no stage re-reads another stage's output. Re-running the same nine-case matrix through the fixed function and re-rendering confirms it: every case now renders as one line at the bottom of the frame, including `\\N` (now `AAANBBB`, height 23), a `\p1` vector-drawing attempt, and an `\alpha&HFF&` invisibility attempt. The guarantee is renderer-independent, which the previous behavior was not: even a libass build that did honor `\\` as an escape could not now expose a brace, because there is no bare backslash left to pair with one.

## Remediation summary

| Severity | Count | Fixed this session | Documented only |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 4 | 4 | 0 |
| Low | 3 | 0 | 3 |
| False positive | 1 | n/a (hardened, no behavior change) | 1 |

Source files changed (6):

- `packages/share/src/r2/env.ts` (M4: added `stripTrailingSlashes`, replaced the regex at the one call site)
- `apps/extension/src/lib/accessibility.ts` (M1: `labelForInput` no longer builds a selector)
- `packages/compose/src/captions/ass-primitives.ts` (M3: `escapeAssText` rewritten as a single pass; doc comment corrected)
- `packages/share/src/r2/sigv4.ts` (M2: added `compareHeaderNames`, used in `buildCanonicalRequest`)
- `packages/share/src/r2/client.ts` (M2: `signedHeaders` uses the same comparator)
- `fixtures/demo-app/src/server.ts` (FP5: clamp lifted into `clampFetchDelayMs`, unconditional, no behavior change)

Test files changed (3), all additive or strengthened, none weakened or skipped:

- `apps/extension/test/lib/accessibility.test.ts` (new, 6 tests, including three selector-injection regressions)
- `packages/compose/test/ass-captions.test.ts` (+1 test asserting no caller backslash survives; the existing brace test's expectation was updated from `use \{\an8\} carefully` to `use \{an8\} carefully` because the fixed escaper drops the literal backslash, which is a stricter guarantee, not a relaxed one)
- `packages/share/test/sigv4.test.ts` (+1 test asserting byte-order header sorting)

Note on process: `git diff` could not be used to verify the change set, because this session was instructed to run no git command at all. The file list above was assembled by hand from the edits made, and each changed region was re-read in place during the re-evaluation pass.

## Re-evaluation

A full re-evaluation ran against the updated code, not a spot check of the changed lines.

- **Gate.** `pnpm lint` clean across 329 files; `pnpm typecheck` clean across all 12 workspace projects (594 files, 0 errors in `apps/studio`); `pnpm test` 644 tests passing, 0 failing, 0 skipped, across 11 packages. The baseline was 636 tests; the delta of 8 is exactly the 8 tests added above.
- **No new classes introduced.** `stripTrailingSlashes` is a bounded linear scan with a strictly decreasing index and no regex. `labelForInput` interpolates nothing into a selector and preserves document order and the empty-text fall-through. `escapeAssText` contains no regex at all and was re-verified at the renderer (see the reachability section). `clampFetchDelayMs` is pure and returns a value in `[0, 5000]` on every path. `compareHeaderNames` is a locale-free comparison over ASCII header names and is used by both call sites that must agree.
- **No regression in the callers of the changed code.** `ass-document.ts` and `ass-karaoke.ts` build their own `\an5`, `\pos`, and `\k` override prefixes outside `escapeAssText`, so the backslash-dropping does not touch them; all 130 compose tests pass. The four headers `putObject` signs order identically under the old and new comparators, so no existing signature expectation moved; all 69 share tests pass. Both pre-existing fixture delay tests still pass, which is the direct evidence that the settle-marker capability PRD-003 and PRD-009 depend on is intact.
- **Honesty check on the disagreement with CodeQL.** Four alerts were fixed at the source. One is argued as a false positive with the full enumeration above and was not suppressed, not commented out, and not accompanied by any weakened test.
- One caveat carried forward: `.env.example` remains unread due to sandbox policy, and `.github/workflows/` was deliberately untouched and unassessed. Neither is a finding; both are stated coverage limits.

## Next step

The branch is **cleared to proceed to `quality-stinger`** (Ship Gate step 2). All Medium findings are fixed and re-evaluated; the three remaining Low findings are documented for follow-up and do not block.

Two things the orchestrating agent must carry forward:

1. `quality-worker-bee` has not run for this branch, so there is no stale QA report to invalidate. It should run now, after these fixes, not before.
2. `github-repo-health-stinger` is an orchestrator-level task and must run as Ship Gate step 3, before any commit or push. It should specifically confirm the CI install mode in `.github/workflows/`, which this pass deliberately did not open because another agent held the file.

Mario reviews this report and the agent summary and approves before anything is committed or pushed. This pass committed nothing and pushed nothing.
