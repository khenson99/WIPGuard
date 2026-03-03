/**
 * Tests for the backfill script constants and logic.
 * These are unit tests that don't require database access.
 */
import { DEFAULT_ORG_ID } from '../../src/lib/organization';

describe('Backfill Organization Script', () => {
  it('should have consistent default org configuration', () => {
    // These constants must match between the backfill script and the lib
    const EXPECTED_DEFAULT_ORG_ID = 'org_default_000000000';

    expect(DEFAULT_ORG_ID).toBe(EXPECTED_DEFAULT_ORG_ID);
  });
});
