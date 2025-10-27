# CI/CD Exclusion Documentation

This document explains the CI/CD-related elements that have been excluded from the upstream repository and provides guidance for teams setting up their own CI/CD pipelines.

## Overview

This repository focuses on source code and local development capabilities. Build and CI/CD pipeline configurations are intentionally excluded from the upstream repository to:

- Maintain flexibility for different deployment environments
- Avoid exposing internal infrastructure details
- Allow organizations to implement their own CI/CD strategies
- Reduce repository complexity and maintenance burden

## What Has Been Excluded

### GitHub Actions Workflows

❌ **Excluded**:

- `.github/workflows/*.yml` - All GitHub Actions workflow files
- `.github/actions/` - Custom GitHub Actions
- `.github/dependabot.yml` - Dependabot configuration (optional to include)

**Rationale**: CI/CD workflows often contain organization-specific details, internal service integrations, and deployment strategies that may not be appropriate for public repositories.

### GitLab CI Configuration

❌ **Excluded**:

- `.gitlab-ci.yml` - GitLab CI/CD configuration
- `.gitlab/` - GitLab-specific configuration directory

### Jenkins Configuration

❌ **Excluded**:

- `Jenkinsfile` - Jenkins pipeline definitions
- `.jenkins/` - Jenkins configuration files

### Other CI/CD Systems

❌ **Excluded**:

- CircleCI configuration (`.circleci/`)
- Travis CI configuration (`.travis.yml`)
- Azure Pipelines configuration (`azure-pipelines.yml`)
- Drone CI configuration (`.drone.yml`)
- Any other CI/CD-specific configuration files

## What Has Been Kept

### Build Scripts for Local Development

✅ **Included**:

- `build.sh` - Build script for local development and containerized builds
- `clean-plugin-dist.sh` - Utility script for cleaning build artifacts
- `package.json` scripts - Yarn scripts for development tasks

**Rationale**: These scripts are useful for local development and can be adapted for CI/CD without exposing internal details.

### Code Quality Configuration

✅ **Included**:

- `sonar-project.properties` - SonarCloud/SonarQube configuration
- `.eslintrc.js` files - ESLint configuration
- `.prettierrc` / Prettier configuration - Code formatting
- `tsconfig.json` - TypeScript configuration

**Rationale**: Code quality tools can be used both locally and in CI/CD pipelines. These configurations define code standards rather than deployment processes.

### Testing Infrastructure

✅ **Included**:

- Unit test files (`*.test.ts`, `*.test.tsx`)
- Test configuration (`jest.config.js`, `setupTests.ts`)
- Test utilities and mocks

❌ **Excluded**:

- End-to-end test infrastructure (Cypress, Playwright)
- Test reporting and coverage upload configurations

**Rationale**: Unit tests are essential for development; E2E tests are typically environment-specific and removed as per requirements.

## Setting Up Your Own CI/CD Pipeline

Organizations using this repository can set up their own CI/CD pipelines. Below are recommendations for common platforms.

### GitHub Actions Example

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'yarn'

      - name: Install dependencies
        run: yarn install --immutable

      - name: Type check
        run: yarn tsc

      - name: Lint
        run: yarn lint:all

      - name: Test
        run: yarn test:all

      - name: Build
        run: yarn build:all

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run security audit
        run: yarn audit

      - name: Check for secrets
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
```

### GitLab CI Example

Create `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - build
  - security

variables:
  NODE_VERSION: '20'

.node_template: &node_template
  image: node:${NODE_VERSION}
  cache:
    paths:
      - node_modules/
      - .yarn/cache/

test:
  <<: *node_template
  stage: test
  script:
    - yarn install --immutable
    - yarn tsc
    - yarn lint:all
    - yarn test:all
  coverage: '/^All files\s*\|\s*(\d+\.\d+)/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

build:
  <<: *node_template
  stage: build
  script:
    - yarn install --immutable
    - yarn build:all
  artifacts:
    paths:
      - dist/
      - plugins/*/dist/
    expire_in: 1 week

security:audit:
  <<: *node_template
  stage: security
  script:
    - yarn audit
  allow_failure: true

security:secrets:
  stage: security
  image: trufflesecurity/trufflehog:latest
  script:
    - trufflehog filesystem --directory=.
  allow_failure: true
```

### Jenkins Pipeline Example

Create `Jenkinsfile`:

```groovy
pipeline {
    agent any

    tools {
        nodejs 'NodeJS-20'
    }

    stages {
        stage('Install') {
            steps {
                sh 'yarn install --immutable'
            }
        }

        stage('Lint') {
            steps {
                sh 'yarn lint:all'
            }
        }

        stage('Test') {
            steps {
                sh 'yarn test:all'
            }
            post {
                always {
                    junit 'coverage/junit.xml'
                    publishCoverage adapters: [coberturaAdapter('coverage/cobertura-coverage.xml')]
                }
            }
        }

        stage('Build') {
            steps {
                sh 'yarn build:all'
            }
        }

        stage('Security Scan') {
            parallel {
                stage('Dependency Audit') {
                    steps {
                        sh 'yarn audit || true'
                    }
                }
                stage('SonarQube Analysis') {
                    steps {
                        withSonarQubeEnv('SonarQube') {
                            sh 'sonar-scanner'
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
    }
}
```

## Recommended CI/CD Pipeline Stages

### 1. Code Quality Checks

- **Linting**: ESLint for code style
- **Formatting**: Prettier check
- **Type Checking**: TypeScript compilation

```bash
yarn lint:all
yarn prettier:check
yarn tsc
```

### 2. Testing

- **Unit Tests**: Jest with coverage
- **Coverage Threshold**: Enforce minimum coverage (80%+)

```bash
yarn test:all
```

### 3. Security Scanning

- **Dependency Audit**: Check for vulnerable dependencies
- **Secret Scanning**: Detect accidentally committed secrets
- **SAST**: Static application security testing

```bash
yarn audit
# Use tools like TruffleHog, GitLeaks, or git-secrets
```

### 4. Build Verification

- **Build All Packages**: Ensure clean build
- **Plugin Export**: Verify dynamic plugins export correctly

```bash
yarn build:all
yarn export-local
```

### 5. Code Quality Analysis (Optional)

- **SonarQube/SonarCloud**: Code quality metrics
- **Code Coverage**: Upload coverage reports

```bash
sonar-scanner -Dsonar.projectKey=your-project
```

### 6. Container Image Build (Optional)

- **Backend Image**: Build Backstage backend container
- **Security Scan**: Scan container for vulnerabilities

```bash
yarn workspace backend build-image
# Use tools like Trivy, Clair, or Anchore
```

## Environment Variables for CI/CD

### Required Variables

- `NODE_OPTIONS`: Memory settings for Node.js (e.g., `--max-old-space-size=16384`)
- `CI`: Set to `true` for CI environment detection

### Optional Variables

- `SONAR_TOKEN`: For SonarQube analysis
- `GITHUB_TOKEN`: For GitHub API access
- `NPM_TOKEN`: For npm registry publishing
- `DYNAMIC_PLUGINS_ROOT`: For dynamic plugin export location

### Secrets Management

**Never commit these to the repository**:

- API tokens
- Service credentials
- Private keys
- Database passwords

Use your CI/CD platform's secrets management:

- GitHub Actions: Secrets and variables
- GitLab CI: CI/CD variables (masked/protected)
- Jenkins: Credentials plugin
- Azure Pipelines: Variable groups

## Testing Strategies

### Matrix Testing

Test across multiple Node.js versions:

```yaml
# GitHub Actions
strategy:
  matrix:
    node-version: [20, 22]
    os: [ubuntu-latest, macos-latest, windows-latest]
```

### Caching

Cache dependencies to speed up builds:

```yaml
# GitHub Actions
- uses: actions/setup-node@v4
  with:
    cache: 'yarn'

# GitLab CI
cache:
  paths:
    - node_modules/
    - .yarn/cache/
```

### Parallel Execution

Run independent jobs in parallel:

- Linting + Testing in parallel
- Multiple plugin builds in parallel
- Security scans in parallel

## Deployment Strategies

### Container Registry Publishing

Build and push container images:

```bash
# Build backend image
yarn workspace backend build-image

# Tag and push
docker tag backstage:latest quay.io/your-org/backstage:$VERSION
docker push quay.io/your-org/backstage:$VERSION
```

### Dynamic Plugin Publishing

Export and publish dynamic plugins:

```bash
# Export dynamic plugins
yarn export-local

# Package and upload to artifact registry
# (Implementation depends on your infrastructure)
```

### Deployment Environments

- **Development**: Automatic deployment from main branch
- **Staging**: Manual or automatic from release tags
- **Production**: Manual deployment after approval

## Code Quality Gates

Implement quality gates in your CI/CD:

### Required Checks

- ✅ All tests pass
- ✅ No linting errors
- ✅ TypeScript compiles without errors
- ✅ Code coverage above threshold (80%)
- ✅ No high/critical security vulnerabilities
- ✅ Build succeeds

### Optional Checks

- Code coverage trend (shouldn't decrease)
- Code complexity metrics
- Dependency license compliance
- Documentation coverage

## Integration with Issue Tracking

Link CI/CD with your issue tracker:

- Automatically close issues on merge
- Update issue status based on build results
- Link PRs to issues

## Monitoring and Notifications

Set up notifications for:

- Build failures
- Security vulnerabilities
- Deployment status
- Test failures

Channels:

- Email
- Slack/Teams
- GitHub/GitLab notifications

## Best Practices

1. **Keep Pipelines Fast**: Optimize for quick feedback (<10 minutes)
2. **Fail Fast**: Run quick checks first (linting, type checking)
3. **Use Caching**: Cache dependencies and build artifacts
4. **Parallel Execution**: Run independent stages in parallel
5. **Automated Testing**: Don't skip tests to save time
6. **Security First**: Always run security scans
7. **Consistent Environments**: Use containers for reproducibility
8. **Monitor Resource Usage**: Track build times and resource consumption
9. **Documentation**: Document your CI/CD setup
10. **Regular Updates**: Keep CI/CD tools and dependencies updated

## Troubleshooting Common Issues

### Out of Memory During Build

```bash
# Increase Node.js memory
export NODE_OPTIONS="--max-old-space-size=16384"
```

### Yarn Install Failures in Hermetic Environments

```bash
# Use immutable installs
yarn install --immutable

# Or allow some flexibility for native packages
yarn install --immutable || echo "Warning: Some optional dependencies failed"
```

### Test Timeouts

```bash
# Increase Jest timeout
NODE_OPTIONS="$NODE_OPTIONS --experimental-vm-modules" \
  yarn test --testTimeout=30000
```

### Build Cache Issues

```bash
# Clean and rebuild
yarn clean
yarn build:all
```

## Security Considerations

### Pipeline Security

- Use minimal permissions for CI/CD service accounts
- Rotate credentials regularly
- Use secrets management (never hardcode)
- Limit access to CI/CD configuration
- Review third-party Actions/plugins before use
- Pin action versions (don't use @latest)

### Supply Chain Security

- Use lock files (`yarn.lock`)
- Verify package integrity
- Scan dependencies for vulnerabilities
- Use private registries for internal packages
- Implement dependency review process

## Support and Resources

### Documentation

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitLab CI/CD Documentation](https://docs.gitlab.com/ee/ci/)
- [Jenkins Documentation](https://www.jenkins.io/doc/)
- [Backstage Build Documentation](https://backstage.io/docs/deployment/docker)

### Getting Help

For questions about CI/CD setup:

- Review this documentation
- Check Backstage community resources
- Open a GitHub Discussion
- Contact ansible-devtools@redhat.com

## Contributing CI/CD Examples

If you develop a useful CI/CD configuration, consider contributing:

1. Add example to documentation
2. Share in GitHub Discussions
3. Submit PR to add to examples/ directory (if appropriate)

**Do not commit**:

- Organization-specific credentials
- Internal infrastructure details
- Proprietary tooling configurations

---

Last updated: October 2025
