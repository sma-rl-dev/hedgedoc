# Release Runbook: Dispatch API 2026.11

## Pre-flight

1. Confirm the release branch is green in CI.
2. Announce the freeze in #platform-eng.

## Deploy

    kubectl set image deploy/dispatch-api api=registry.atlasfreight.dev/dispatch-api:2026.11

## Rollback

    kubectl rollout undo deploy/dispatch-api
