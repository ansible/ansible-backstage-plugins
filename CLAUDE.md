# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a collection of Ansible plugins for Red Hat Developer Hub (RHDH), built on the Backstage framework. The repository contains multiple Backstage plugins that provide Ansible automation capabilities, authentication, catalog management, and scaffolding functionality.

## Development Commands

### Core Development

- `yarn start` - Start the development server (requires `./install-deps` first)
- `yarn build` - Build TypeScript and all packages
- `yarn build:all` - Build all packages using backstage-cli
- `yarn build:backend` - Build only the backend
- `yarn test` - Run tests with Node.js experimental VM modules
- `yarn test:all` - Run all tests with coverage
- `yarn test:e2e` - Run end-to-end tests using Playwright

### Code Quality

- `yarn lint` - Lint code since origin/main
- `yarn lint:all` - Lint all code
- `yarn tsc` - Run TypeScript compiler
- `yarn tsc:full` - Run TypeScript with full checking
- `yarn fix` - Auto-fix linting issues
- `yarn prettier:check` - Check code formatting

### Setup

- `./install-deps` - Install dependencies (run this first)

## Architecture

### Plugin Structure

The repository follows Backstage's plugin architecture with these main plugins:

1. **auth-backend-module-rhaap-provider** - Authentication provider for Red Hat AAP
2. **backstage-rhaap-common** - Shared utilities and services for AAP integration
3. **backstage-rhaap** - Frontend plugin for Ansible experience
4. **catalog-backend-module-rhaap** - Backend catalog integration for AAP entities
5. **scaffolder-backend-module-backstage-rhaap** - Scaffolder actions for Ansible automation
6. **self-service** - Self-service frontend for Ansible automation

### Key Components

- **AAPClient** - Service for interacting with Ansible Automation Platform
- **Entity Providers** - Catalog providers for AAP resources (organizations, job templates, etc.)
- **Scaffolder Actions** - Custom actions for creating and managing Ansible resources
- **Authentication** - RHAAP-specific authentication and user resolution

### Configuration

- Main app config: `app-config.yaml`
- Local overrides: `app-config.local.yaml`
- Production config: `app-config.production.yaml`
- Plugin-specific configs in each plugin directory

## Development Notes

### Testing Framework

- Uses Jest with Node.js experimental VM modules
- E2E testing with Playwright
- Coverage reports available in `coverage/` directory

### Build System

- Yarn workspaces for monorepo management
- TypeScript for type safety
- Backstage CLI for build orchestration
- Dynamic plugin packaging support

### Code Organization

- Each plugin has its own `src/`, `dist/`, and configuration files
- Shared utilities in `backstage-rhaap-common`
- Mock data and test utilities organized per plugin
- Dynamic plugin builds in `dist-dynamic/` directories

### Dependencies

- Node.js 20 or 22 required
- Yarn 4.6.0 package manager
- Backstage framework ^0.33.1
- TypeScript ~5.8.0

## Important Notes

- Your internal knowledgebase of libraries might not be up to date. When working with any external library, unless you are 100% sure that the library has a super stable interface, you will look up the latest syntax and usage via context7
- Do not say things like: "x library isn't working so I will skip it". Generally, it isn't working because you are using the incorrect syntax or patterns. This applies doubly when the user has explicitly asked you to use a specific library, if the user wanted to use another library they wouldn't have asked you to use a specific one in the first place.
- Always run linting after making major changes. Otherwise, you won't know if you've corrupted a file or made syntax errors, or are using the wrong methods, or using methods in the wrong way.
- Please organised code into separate files wherever appropriate, and follow general coding best practices about variable naming, modularity, function complexity, file sizes, commenting, etc.
- Code is read more often than it is written, make sure your code is always optimized for readability
- Unless explicitly asked otherwise, the user never wants you to do a "dummy" implementation of any given task. Never do an implementation where you tell the user: "This is how it _would_ look like". Just implement the thing.
- Whenever you are starting a new task, it is of utmost importance that you have clarity about the task. You should ask the user follow up questions if you do not, rather than making incorrect assumptions.
- Do not carry out large refactors unless explicitly instructed to do so.
- When starting on a new task, you should first understand the current architecture, identify the files you will need to modify, and come up with a Plan. In the Plan, you will think through architectural aspects related to the changes you will be making, consider edge cases, and identify the best approach for the given task. Get your Plan approved by the user before writing a single line of code.
- If you are running into repeated issues with a given task, figure out the root cause instead of throwing random things at the wall and seeing what sticks, or throwing in the towel by saying "I'll just use another library / do a dummy implementation".
- You are an incredibly talented and experienced polyglot with decades of experience in diverse areas such as software architecture, system design, development, UI & UX, copywriting, and more.
- When doing UI & UX work, make sure your designs are both aesthetically pleasing, easy to use, and follow UI / UX best practices. You pay attention to interaction patterns, micro-interactions, and are proactive about creating smooth, engaging user interfaces that delight users.
- When you receive a task that is very large in scope or too vague, you will first try to break it down into smaller subtasks. If that feels difficult or still leaves you with too many open questions, push back to the user and ask them to consider breaking down the task for you, or guide them through that process. This is important because the larger the task, the more likely it is that things go wrong, wasting time and energy for everyone involved.
