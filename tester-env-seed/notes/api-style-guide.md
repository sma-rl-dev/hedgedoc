# API Style Guide

Conventions for every HTTP service at Atlas Freight. Breaking these rules needs a review from the platform team.

## Resources and naming

- Use plural nouns for collections: `/shipments`, `/carriers`, `/tenders`.
- Use kebab-case in paths and snake_case in JSON fields.
- Never expose database primary keys; use opaque identifiers such as `shp_01H8Z`.

## Requests

| Concern | Rule |
| --- | --- |
| Pagination | Cursor based, `?limit=50&cursor=...` |
| Filtering | Explicit query parameters, never free-form query strings |
| Idempotency | `Idempotency-Key` header on all POST requests |
| Versioning | Path prefix `/v2`, one major version in service at a time |

## Example

    POST /v2/tenders
    Content-Type: application/json

    {
      "shipment_id": "shp_01H8Z",
      "carrier_id": "car_8842",
      "rate_cents": 145000
    }

## Errors

Return a stable machine-readable code and a human-readable message. Never echo stack traces or SQL.

    {
      "error": {
        "code": "carrier_not_available",
        "message": "Carrier 8842 is not accepting tenders for this lane."
      }
    }
