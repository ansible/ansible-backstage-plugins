#!/usr/bin/env bash
# Auto-generate backend secrets if not set in .env
export BACKEND_SECRET="${BACKEND_SECRET:-$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")}"
export AUTH_SIGNING_KEY="${AUTH_SIGNING_KEY:-$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")}"

NODE_OPTIONS="${NODE_OPTIONS:-} --no-node-snapshot" backstage-cli repo start
