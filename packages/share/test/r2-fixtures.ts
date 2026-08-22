// SPDX-License-Identifier: AGPL-3.0-or-later
import type { R2Config } from '../src/r2/env.js';

/**
 * AWS's PUBLISHED documentation example signing credentials, the exact
 * values the SigV4 suite needs to reproduce the signature examples from
 * the AWS Signature Version 4 documentation (the suite's one piece of
 * external ground truth). They are example strings from public docs, not
 * secrets; consolidated here on 2026-08-22 so credential scanners see one
 * clearly-labeled, clearly-fake definition instead of per-test
 * assignments (same pattern as packages/narrate/test/fixtures.ts).
 */
export const AWS_DOCS_EXAMPLE_KEY_ID = 'AKIDEXAMPLE';
export const AWS_DOCS_EXAMPLE_SIGNING_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

/** A second distinct docs-style value, for "signature changes when the key changes". */
export const ANOTHER_EXAMPLE_SIGNING_KEY = 'a-completely-different-secret';

/** The example R2 config every R2-client test shares; only the transport is mocked. */
export function exampleR2Config(): R2Config {
  return {
    accountId: 'acct123',
    accessKeyId: AWS_DOCS_EXAMPLE_KEY_ID,
    secretAccessKey: AWS_DOCS_EXAMPLE_SIGNING_KEY,
    bucket: 'my-bucket',
    publicBaseUrl: 'https://cdn.example.com',
  };
}
