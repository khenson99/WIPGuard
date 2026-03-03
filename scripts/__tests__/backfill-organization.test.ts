/**
 * Tests for the backfill script constants and logic.
 * These are unit tests that don't require database access.
 */

describe('Backfill Organization Script', () => {
  it('should have consistent default org configuration', () => {
    // These constants must match between the backfill script and the lib
    const EXPECTED_DEFAULT_ORG_ID = 'org_default_000000000';

    // Import from the lib to verify consistency
    const { DEFAULT_ORG_ID } = require('../../src/lib/organization');
    expect(DEFAULT_ORG_ID).toBe(EXPECTED_DEFAULT_ORG_ID);
  });
});
