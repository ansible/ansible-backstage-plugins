# Enhanced E2E Testing for Ansible Backstage Plugins

This directory contains the enhanced end-to-end testing setup for the Ansible Backstage Plugins, featuring improved architecture, session management, and robust error handling inspired by the aap-ui project.

## 🏗️ Architecture Overview

### Modular Configuration

- **Base Configuration**: `cypress.base.config.ts` - Shared settings and optimizations
- **Service-Specific Configs**:
  - `cypress.self-service.config.ts` - Self-service plugin tests
  - `cypress.rhdh.config.ts` - RHDH (Red Hat Developer Hub) tests
- **Environment Detection**: Automatic service detection based on URL and environment variables

### Command Structure

- **Authentication**: `cypress/support/auth-commands.ts` - Enhanced session-based authentication
- **Self-Service**: `cypress/support/self-service-commands.ts` - Self-service specific commands
- **RHDH**: `cypress/support/rhdh-commands.ts` - RHDH/Backstage specific commands
- **Test Data**: `cypress/support/test-data-commands.ts` - Test data management and cleanup
- **API Helpers**: `cypress/support/api-helpers.ts` - Template literal API path helpers

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Access to the test environments

### Installation

```bash
cd e2e-tests
npm install
```

### Environment Setup

Create a `.env` file or set environment variables:

```bash
# Self-Service Environment
export SERVICE_TYPE=SELF_SERVICE
export BASE_URL=https://your-self-service-url.com
export AAP_USER_ID=admin
export AAP_USER_PASS=your-password
export AAP_URL=https://your-aap-instance.com

# RHDH Environment
export SERVICE_TYPE=RHDH
export BASE_URL=https://your-rhdh-url.com
export GH_USER_ID=your-github-username
export GH_USER_PASS=your-github-password
export AUTHENTICATOR_SECRET=your-2fa-secret
export DEVSPACES_URL=https://your-devspaces-url.com
export AUTOMATION_CONTROLLER=https://your-controller-url.com
export AHUB_URL=https://your-hub-url.com
```

## 🧪 Running Tests

### Basic Test Execution

```bash
# Run all tests with default config
npm test

# Run self-service tests
npm run test:self-service

# Run RHDH tests
npm run test:rhdh

# Run enhanced tests only
npm run test:enhanced
```

### Interactive Testing

```bash
# Open Cypress GUI for self-service
npm run cy:open:self-service

# Open Cypress GUI for RHDH
npm run cy:open:rhdh

# Open default Cypress GUI
npm run cy:open
```

### Specific Test Execution

```bash
# Run specific self-service test
npm run e2e:self-service:spec "cypress/e2e/self-service/enhanced-login.cy.ts"

# Run specific RHDH test
npm run e2e:rhdh:spec "cypress/e2e/rhdh/overview_test.cy.ts"
```

## 🔧 Key Features

### Enhanced Authentication

- **Session Management**: Uses `cy.session()` with validation callbacks
- **Service Detection**: Automatically detects and uses appropriate auth method
- **Error Recovery**: Robust error handling and automatic recovery
- **Cross-Spec Caching**: Maintains sessions across test files for performance

### Performance Optimizations

- **Memory Management**: `experimentalMemoryManagement: true`
- **Browser Optimizations**: Chrome flags for stability and performance
- **Retry Logic**: Built-in retry mechanisms for flaky operations
- **Performance Monitoring**: Tracks and logs operation timing

### Test Data Management

- **Automatic Cleanup**: Global hooks for test data cleanup
- **Test Isolation**: Proper test data isolation between runs
- **Error Recovery**: Automatic recovery from test failures
- **Data Factories**: Helpers for creating consistent test data

### API Integration

- **Template Literal Helpers**: Clean API path construction
  ```typescript
  rhdhAPI`/catalog/entities`;
  selfServiceAPI`/templates`;
  catalogAPI`/entities/${entityId}`;
  ```
- **Service-Aware APIs**: Different API helpers per service
- **Error Handling**: Robust API error handling with retries

## 📝 Writing Tests

### Basic Test Structure

```typescript
import '../../../cypress/support/types';

describe('My Test Suite', () => {
  beforeEach(() => {
    // Authentication handled by global hooks
    cy.visitSelfService();
    cy.shouldBeAuthenticated();
  });

  it('Should test something', () => {
    cy.measurePerformance('My Operation', () => {
      cy.navigateToTemplates();
    });

    cy.shouldBeOnPage('self-service');
    cy.shouldContainText('Templates');
  });
});
```

### Using Enhanced Commands

```typescript
// Navigation
cy.visitSelfService('/catalog');
cy.navigateToTemplates();
cy.navigateToCatalog();

// Authentication
cy.login(); // Smart login based on service type
cy.shouldBeAuthenticated();

// Search and Interaction
cy.searchCatalog('job template');
cy.filterByKind('JobTemplate');
cy.clickFirstEntity();

// Performance Testing
cy.measurePageLoadTime(15000);
cy.measurePerformance('Catalog Load', () => {
  cy.navigateToCatalog();
});

// Error Handling
cy.retryOperation(() => {
  cy.verifyCatalogTable();
}, 3);

// Assertions
cy.shouldBeOnPage('catalog');
cy.shouldContainText('Expected content');
cy.shouldNotContainText('Error');
```

### Test Data Management

```typescript
// Create test data
cy.createTestComponent('my-component', {
  spec: { type: 'service', owner: 'team-a' },
});

// Cleanup (handled automatically by global hooks)
cy.cleanupTestEntities();
cy.verifyTestDataCleanup();
```

## 🔄 Migration from Old Tests

### Backward Compatibility

Old test patterns are still supported:

```typescript
// Old pattern (still works)
Common.LogintoAAP();

// New pattern (recommended)
cy.login();
```

### Migration Steps

1. Update imports to include types: `import '../../../cypress/support/types';`
2. Replace authentication calls with `cy.login()`
3. Use new navigation commands: `cy.visitSelfService()`, `cy.navigateToCatalog()`
4. Add performance monitoring: `cy.measurePerformance()`
5. Use enhanced assertions: `cy.shouldBeOnPage()`, `cy.shouldContainText()`

## 🚀 Best Practices

### Test Organization

- Use descriptive test names
- Group related tests in `describe` blocks
- Use `beforeEach` for common setup
- Leverage global hooks for authentication and cleanup

### Performance

- Use session caching for authentication
- Minimize page loads and waits
- Use performance monitoring to identify bottlenecks
- Implement retry logic for flaky operations

### Maintenance

- Regular cleanup of test data
- Monitor test performance trends
- Update selectors and commands as UI changes
- Use type definitions for better IDE support

### Generating Reports

After running tests, generate consolidated HTML reports:

```bash
# Run tests (reports auto-generated)
npm run e2e:self-service

# Generate merged HTML report
npm run report:generate

# Individual report commands
npm run report:merge    # Merge JSON reports
npm run report:html     # Generate HTML from merged JSON
```

### Viewing Reports

```bash
# Open HTML report (macOS)
open cypress/reports/html/report.html

# Open HTML report (Linux)
xdg-open cypress/reports/html/report.html

# Open HTML report (Windows)
start cypress/reports/html/report.html
```

### Report Configuration

Reporter settings are defined in `reporter-config.json`:

```json
{
  "reporterEnabled": "spec, mocha-junit-reporter, mochawesome",
  "mochaJunitReporterReporterOptions": {
    "mochaFile": "cypress/reports/junit/results-[hash].xml"
  },
  "mochawesomeReporterOptions": {
    "reportDir": "cypress/reports/json",
    "overwrite": false,
    "html": false,
    "json": true
  }
}
```
