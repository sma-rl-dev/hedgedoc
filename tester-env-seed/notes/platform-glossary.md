# Platform Glossary

Shared vocabulary for dispatch, tenders and carrier operations. Add terms as you meet them.

## Dispatch terms

| Term | Meaning |
| --- | --- |
| Tender | An offer of a shipment to a specific carrier |
| Lane | An origin and destination pair with a published rate |
| Deadhead | Driving without a load, usually to reach a pickup |
| Load board | The list of open shipments visible to carriers |
| Dock window | The agreed pickup or delivery time slot at a facility |

## Systems

- **Dispatch API**: core service for shipments, tenders and carriers.
- **Load board service**: read model that powers the carrier portal.
- **Telemetry**: driver app events, retained for 90 days.

## Conventions

- Times are stored in UTC and shown in the driver's local timezone.
- Money is stored in cents as integers.
- Identifiers use short prefixes: `shp_`, `car_`, `tnd_`.
