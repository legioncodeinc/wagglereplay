// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Shared obviously-fake provider credential values for the pre-draft
 * adapter tests. The adapters under test never make network calls (every
 * test injects a fake transport); these values exist only so adapter
 * config shapes receive a non-empty string. Extracted from inline
 * literals on 2026-08-22 so credential scanners see clearly-labeled
 * test-only definitions instead of per-test assignments (same pattern as
 * packages/narrate/test/fixtures.ts).
 */
export const FAKE_ANTHROPIC_KEY_FOR_TESTS = 'sk-ant-test';
export const FAKE_OPENAI_KEY_FOR_TESTS = 'sk-test';
