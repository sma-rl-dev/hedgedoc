# Engineering Onboarding Checklist

Welcome to the platform team. This checklist covers your first month at Atlas Freight.

## First week

- [x] Laptop, SSO and VPN access
- [ ] GitHub organisation invite
- [ ] Join #platform-eng and #incidents in Slack
- [ ] Read the Platform Glossary and the API Style Guide

Pair with your onboarding buddy for the first deploy. Nobody ships alone in week one.

## Week 2-4

- [ ] Shadow one on-call rotation
- [ ] Land a starter ticket labelled `good-first-issue`
- [ ] Walk through the Release Runbook with your buddy

## Local environment

    git clone git@github.com:atlas-freight/dispatch-api.git
    cd dispatch-api
    yarn install
    yarn dev

The dev stack exposes the API on http://localhost:8080 and seeds a local SQLite database.

## Contacts

| Area | Owner | Channel |
| --- | --- | --- |
| Dispatch API | Dana Whitfield | #platform-eng |
| Mobile apps | Priya Raman | #mobile |
| Data platform | Marco Silva | #data |
