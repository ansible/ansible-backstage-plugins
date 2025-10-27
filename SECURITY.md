# Security Policy

## Overview

The Ansible Backstage Plugins project takes security seriously. We appreciate your efforts to responsibly disclose any security vulnerabilities you discover. This document outlines our security policy, including how to report vulnerabilities and what to expect during the disclosure process.

## Supported Versions

We actively maintain and provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

Security updates are provided for the current major version and the previous major version for a limited time after a new major release.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security issue, please report it confidentially by contacting Red Hat's Product Security team:

- **Email**: secalert@redhat.com
- **Portal**: [Red Hat Customer Portal - Product Security](https://access.redhat.com/security/team/contact)
- **PGP Key**: Available at https://access.redhat.com/security/team/key

### What to Include

When reporting a vulnerability, please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Affected versions
- Any proof-of-concept or exploit code (if available)
- Your contact information for follow-up questions

### Response Timeline

You can expect the following response timeline:

1. **Initial Response**: Within 3 business days of your report
2. **Triage and Assessment**: Within 5 business days
3. **Status Updates**: Every 7 days until resolution
4. **Fix and Disclosure**: Coordinated with you based on severity

## Security Best Practices for Contributors

When contributing to this project, please follow these security best practices:

### Code Security

- Never commit sensitive information (API keys, tokens, passwords, certificates)
- Use parameterized queries and proper input validation
- Follow secure coding practices for TypeScript/JavaScript
- Ensure dependencies are kept up to date
- Run security scanners on your code before submitting PRs

### Authentication and Authorization

- Use Backstage's built-in authentication mechanisms
- Implement proper RBAC (Role-Based Access Control) checks
- Validate all user inputs and API responses
- Use secure communication channels (HTTPS/TLS)

### Dependencies

- Regularly update dependencies to address known vulnerabilities
- Use `yarn audit` to check for vulnerable dependencies
- Review dependency licenses for compatibility

### Configuration

- Never commit production credentials to the repository
- Use environment variables for sensitive configuration
- Follow the principle of least privilege for service accounts
- Enable AAP SSL verification in production (`AAP_CHECK_SSL=true`)

## Security Scanning

This project uses the following security tools:

- **Dependabot**: Automated dependency updates
- **GitHub Security Advisories**: Vulnerability notifications
- **SonarCloud**: Code quality and security analysis
- **Yarn Audit**: Dependency vulnerability scanning

## Disclosure Policy

- Security vulnerabilities will be disclosed after a fix is available
- We follow a coordinated disclosure process
- We will credit security researchers who responsibly disclose vulnerabilities (unless anonymity is requested)
- Public disclosure typically occurs 90 days after the initial report or when a fix is released, whichever comes first

## Security Updates

Security updates will be:

- Released as patch versions for supported releases
- Documented in the CHANGELOG with a `[Security]` prefix
- Announced through GitHub Security Advisories
- Communicated to the community via project channels

## Scope

The following are considered in-scope for security reports:

- Authentication and authorization bypasses
- Injection vulnerabilities (SQL, Command, XSS, etc.)
- Remote code execution
- Information disclosure
- CSRF and SSRF vulnerabilities
- Security misconfigurations in default settings
- Vulnerabilities in dependencies

The following are generally considered out-of-scope:

- Social engineering attacks
- Denial of service attacks requiring significant resources
- Issues in third-party dependencies already publicly disclosed
- Security issues in unsupported versions

## Contact

For security-related questions that are not vulnerability reports, please contact:

- **Project Maintainers**: ansible-devtools@redhat.com
- **Product Security**: secalert@redhat.com

## Additional Resources

- [Red Hat Product Security](https://access.redhat.com/security/team/contact)
- [Backstage Security Documentation](https://backstage.io/docs/auth/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

## Acknowledgments

We thank the security research community for helping keep Ansible Backstage Plugins and our users safe. Security researchers who responsibly disclose vulnerabilities will be acknowledged in our security advisories (with permission).

---

Last updated: October 2025
