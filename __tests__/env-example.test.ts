import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ENV_EXAMPLE_PATH = join(__dirname, '..', '.env.example');

describe('.env.example', () => {
  it('should exist in the project root', () => {
    expect(existsSync(ENV_EXAMPLE_PATH)).toBe(true);
  });

  describe('file contents', () => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
    });

    it('should contain all required variables', () => {
      const requiredVars = [
        'DATABASE_URL',
        'NEXTAUTH_SECRET',
        'NEXTAUTH_URL',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
      ];

      for (const varName of requiredVars) {
        expect(content).toContain(varName);
      }
    });

    it('should contain recommended security variables', () => {
      const recommendedVars = [
        'INTEGRATION_TOKEN_SECRET',
        'INVITE_TOKEN_SECRET',
      ];

      for (const varName of recommendedVars) {
        expect(content).toContain(varName);
      }
    });

    it('should contain optional integration variables', () => {
      const optionalVars = [
        'HUBSPOT_CLIENT_ID',
        'HUBSPOT_CLIENT_SECRET',
        'SLACK_CLIENT_ID',
        'SLACK_CLIENT_SECRET',
        'SLACK_SIGNING_SECRET',
        'META_CLIENT_ID',
        'META_CLIENT_SECRET',
      ];

      for (const varName of optionalVars) {
        expect(content).toContain(varName);
      }
    });

    it('should document the REQUIRED / RECOMMENDED / OPTIONAL categories', () => {
      expect(content).toContain('REQUIRED');
      expect(content).toContain('RECOMMENDED');
      expect(content).toContain('OPTIONAL');
    });

    it('should not contain actual secret values', () => {
      // Ensure no real secrets leaked into the example file
      // Real secrets are typically longer base64 strings
      const lines = content.split('\n');
      const assignmentLines = lines.filter(
        (line) => line.match(/^[A-Z_]+=.+/) && !line.startsWith('#')
      );

      for (const line of assignmentLines) {
        const value = line.split('=').slice(1).join('=');
        // Values should be empty, placeholder text, or simple defaults
        // They should NOT be real base64 secrets (40+ chars of random data)
        const looksLikeRealSecret = /^[A-Za-z0-9+/]{40,}={0,2}$/.test(value);
        expect(looksLikeRealSecret).toBe(false);
      }
    });

    it('should include generation instructions for secret values', () => {
      expect(content).toContain('openssl rand -base64 32');
    });

    it('should include copy instructions at the top', () => {
      expect(content).toContain('cp .env.example .env');
    });

    it('should use valid KEY=VALUE format for all variable definitions', () => {
      const lines = content.split('\n');
      const nonCommentNonEmpty = lines.filter(
        (line) => line.trim() !== '' && !line.trim().startsWith('#')
      );

      for (const line of nonCommentNonEmpty) {
        // Each non-comment, non-empty line should match KEY=VALUE pattern
        expect(line).toMatch(/^[A-Z][A-Z0-9_]*=/);
      }
    });
  });
});
