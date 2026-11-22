# Release Runbook: Dispatch API 2026.11

Use this runbook for every production release of the Dispatch API.

###### Tags: `runbook` `release`

## Pre-flight

1. Confirm the release branch is green in CI and the changelog is updated.
2. Announce the freeze in #platform-eng 30 minutes before the deploy.
3. Take a database snapshot:

       pg_dump --format=custom atlas_dispatch > atlas_dispatch_2026_11.dump

## Deploy

    kubectl set image deploy/dispatch-api api=registry.atlasfreight.dev/dispatch-api:2026.11
    kubectl rollout status deploy/dispatch-api

Watch the error rate dashboard for ten minutes. Latency above 400 ms for more than two minutes is a rollback trigger.

## Rollback

    kubectl rollout undo deploy/dispatch-api

Then page the release captain and open an incident in #incidents. Do not retry the deploy until the cause is understood.

## Sign-off

| Step | Owner | Check |
| --- | --- | --- |
| Canary | Dana Whitfield | 5% traffic for 15 min |
| Full rollout | On-call engineer | Error rate under 0.5% |
| Post-release notes | Release captain | Linked in #releases |
