import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');

describe('Pre-commit hook configuration', () => {
  describe('.husky/pre-commit', () => {
    const preCommitPath = path.join(ROOT_DIR, '.husky', 'pre-commit');

    it('should exist', () => {
      expect(fs.existsSync(preCommitPath)).toBe(true);
    });

    it('should run lint-staged', () => {
      const content = fs.readFileSync(preCommitPath, 'utf-8');
      expect(content).toContain('npx lint-staged');
    });
  });

  describe('.husky/pre-push', () => {
    const prePushPath = path.join(ROOT_DIR, '.husky', 'pre-push');

    it('should exist', () => {
      expect(fs.existsSync(prePushPath)).toBe(true);
    });

    it('should run tests', () => {
      const content = fs.readFileSync(prePushPath, 'utf-8');
      expect(content).toContain('npm test');
    });
  });

  describe('lint-staged configuration', () => {
    it('should be defined in package.json', () => {
      const packageJsonPath = path.join(ROOT_DIR, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson['lint-staged']).toBeDefined();
    });

    it('should target TypeScript files', () => {
      const packageJsonPath = path.join(ROOT_DIR, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const lintStaged = packageJson['lint-staged'];

      // Should have a glob pattern that matches .ts and .tsx files
      const tsPattern = Object.keys(lintStaged).find(
        (key) => key.includes('.ts') || key.includes('.tsx')
      );
      expect(tsPattern).toBeDefined();
    });

    it('should run eslint --fix on TypeScript files', () => {
      const packageJsonPath = path.join(ROOT_DIR, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const lintStaged = packageJson['lint-staged'];

      const tsPattern = Object.keys(lintStaged).find(
        (key) => key.includes('.ts') || key.includes('.tsx')
      );
      expect(tsPattern).toBeDefined();

      const commands: string[] = Array.isArray(lintStaged[tsPattern!])
        ? lintStaged[tsPattern!]
        : [lintStaged[tsPattern!]];

      const hasEslintFix = commands.some((cmd: string) => cmd.includes('eslint') && cmd.includes('--fix'));
      expect(hasEslintFix).toBe(true);
    });
  });

  describe('package.json scripts', () => {
    it('should have a prepare script for husky', () => {
      const packageJsonPath = path.join(ROOT_DIR, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.scripts?.prepare).toBeDefined();
      expect(packageJson.scripts.prepare).toContain('husky');
    });
  });

  describe('devDependencies', () => {
    it('should include husky', () => {
      const packageJsonPath = path.join(ROOT_DIR, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.devDependencies?.husky).toBeDefined();
    });

    it('should include lint-staged', () => {
      const packageJsonPath = path.join(ROOT_DIR, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.devDependencies?.['lint-staged']).toBeDefined();
    });
  });
});
