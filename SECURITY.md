# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| main (pre-alpha) | :white_check_mark: |

Waggle is pre-1.0; only the latest main branch receives security fixes.

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/legioncodeinc/wagglereplay/security/advisories/new) for this repository. If that channel is unavailable, email mario@legioncodeinc.com.

When reporting, please include:

- The affected commit SHA or version
- A description of the issue and why you believe it is security-sensitive
- Steps to reproduce, or a proof of concept
- Potential impact and any suggested mitigations

## What to Expect

Acknowledgment within 3 business days. Confirmed issues get a fix coordinated with the reporter, and a GitHub Security Advisory once remediation is ready.

## Scope

This repository and the Waggle toolchain it ships (extension, studio, CLI, render engine). Waggle is local-first: it hosts no service, so hosted-service reports are out of scope. Areas of particular interest: credential handling during replay (ADR-008), the Chrome extension's capture and permission surface, and anything that could leak recorded walkthrough content.
