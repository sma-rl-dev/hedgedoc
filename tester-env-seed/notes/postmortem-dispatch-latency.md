# Postmortem: Dispatch Latency Spike 2026-11-08

###### Tags: `incident` `postmortem`

## Summary

Between 19:40 and 20:15 UTC the Dispatch API p95 latency rose from 180 ms to 4.2 s. Drivers saw stale load boards for roughly 35 minutes. No data was lost.

## Impact

- 1,840 dispatch requests slower than 2 seconds
- 12 carriers reported stale tender lists
- One customer escalation, resolved the same evening

## Timeline

| Time (UTC) | Event |
| --- | --- |
| 19:40 | Alert: p95 latency above 2 s for 5 minutes |
| 19:47 | On-call confirms the connection pool is saturated |
| 19:58 | Tender list query identified as the top consumer |
| 20:06 | Missing index added to `tender_offers(carrier_id, created_at)` |
| 20:15 | Latency back under 250 ms, alert resolved |

## Root cause

A migration in the 2026.11 release dropped a composite index that the tender list query relied on. The query plan fell back to a sequential scan over 4.1 million rows.

## Follow-ups

- [ ] Add a migration test that compares query plans for the top ten queries
- [ ] Alert when any endpoint p95 exceeds 1 s for 3 minutes
- [ ] Document the index inventory in the Platform Glossary
