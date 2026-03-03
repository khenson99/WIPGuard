#!/bin/bash
# Script to install and configure husky + lint-staged
# Run this script from the repository root after reviewing the changes

set -e

echo "Installing husky and lint-staged..."
npm install -D husky lint-staged

echo "Initializing husky..."
npx husky init

echo "Husky and lint-staged installed successfully."
echo "NOTE: The .husky/pre-commit and .husky/pre-push files have already been created."
echo "NOTE: lint-staged config and prepare script should be added to package.json."
echo ""
echo "Please ensure package.json contains the following:"
echo '  "prepare": "husky"'
echo '  "lint-staged": { "*.{ts,tsx}": ["eslint --fix"] }'
