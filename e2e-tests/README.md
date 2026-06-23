# E2E Testing for Ansible Backstage Plugins

End-to-end tests for the Ansible Backstage Plugins using Playwright.

## Prerequisites

- Node.js 18+
- Yarn
- Access to the test environments
- Chromium browser (`npx playwright install chromium`)

## Installation

```bash
cd e2e-tests
yarn install
npx playwright install chromium
```

## Environment Setup

Create a `.env` file with:

```bash
# Portal URL
BASE_URL=https://your-portal-url.com

# Self-Service Authentication
AAP_USER_ID=admin
AAP_USER_PASS=your-password

# RHDH Authentication (GitHub OAuth)
GH_USER_ID=your-github-username
GH_USER_PASS=your-github-password
AUTHENTICATOR_SECRET=your-2fa-secret
```

## Running Tests

```bash
# Run all tests
yarn pw:test

# Run self-service tests
yarn pw:test:self-service

# Run RHDH tests
yarn pw:test:rhdh

# Run in headed mode (see browser)
yarn pw:test:headed

# Run with Playwright UI
yarn pw:test:ui

# Debug mode
yarn pw:test:debug

# Generate code with codegen
yarn pw:codegen
```

## Test Structure

```text
e2e-tests/
  playwright.config.ts          # Main configuration
  playwright/
    tests/
      self-service/             # Self-service plugin tests (13 specs)
        login.spec.ts
        browse.spec.ts
        create.spec.ts
        history.spec.ts
        job-template-sync.spec.ts
        collections01-catalog.spec.ts
        collections02-detailview.spec.ts
        git-repositories01-catalog.spec.ts
        git-repositories02-detailview.spec.ts
        ee01-tabview.spec.ts
        ee02-template-execution.spec.ts
        ee03-detail-view.spec.ts
        ee04-deregister-template.spec.ts
      rhdh/                     # RHDH tests (4 specs, need GitHub creds)
        overview.spec.ts
        create.spec.ts
        my_items.spec.ts
        learning.spec.ts
    utils/                      # Shared navigation helpers
      collections-navigation.spec.ts
      git-repositories-navigation.spec.ts
```

## Reports

```bash
# View HTML report after test run
yarn pw:show-report
```

Reports are generated in `playwright-report/` (HTML) and `playwright-results/` (JUnit XML, JSON).

## CI Configuration

Timeout values can be tuned via environment variables:

```bash
PLAYWRIGHT_TEST_TIMEOUT=90000       # Per-test timeout (default: 60s)
PLAYWRIGHT_EXPECT_TIMEOUT=10000     # Assertion timeout (default: 10s)
PLAYWRIGHT_ACTION_TIMEOUT=30000     # Click/fill timeout (default: 30s)
PLAYWRIGHT_NAVIGATION_TIMEOUT=30000 # Navigation timeout (default: 30s)
```

On CI, tests run with 1 retry and a 10-minute global timeout. Traces and screenshots are captured on failure.
