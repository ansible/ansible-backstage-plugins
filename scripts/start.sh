#!/usr/bin/env bash
# Auto-generate the configured signing key if not set in .env
export AUTH_SIGNING_KEY="${AUTH_SIGNING_KEY:-$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")}"

NODE_OPTIONS="${NODE_OPTIONS:-} --no-node-snapshot" backstage-cli repo start
