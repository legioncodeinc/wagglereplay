// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Shared obviously-fake provider credential value for narrate's unit
 * tests. The adapters under test never make network calls (every test
 * injects a fake transport); this value exists only so constructor and
 * config shapes receive a non-empty string. Extracted from dozens of
 * inline literals on 2026-08-22 so credential scanners see one
 * clearly-labeled test-only definition instead of per-test assignments.
 */
export const FAKE_TTS_KEY_FOR_TESTS = 'test-key-not-real';
