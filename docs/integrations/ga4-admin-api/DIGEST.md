# GA4 Admin API — authoritative digest

Status: documentation discovery complete. No implementation authorised.
Discovered: 2026-08-19. Sources: official Google developer documentation and official Google GitHub
organisations only.

## What it is

The configuration API for GA4. It exposes the account and property tree, data streams, custom
dimensions and metrics, key events, and Ads links. Read methods are `get` and `list` only; every
other verb mutates the customer's analytics configuration.

For AOOS this is a **read-only discovery** integration. It replaces the hardcoded
`properties/536830122` reference with an evidence-driven property binding.

## Base URL and versions

- `https://analyticsadmin.googleapis.com`
- `v1beta` is stable. `v1alpha` may break, and carries resources absent from v1beta including
  `googleAdsLinks`, `audiences`, `accessBindings`, `subproperties`, `attributionSettings`.

Source: https://developers.google.com/analytics/devguides/config/admin/v1/rest

## Auth

OAuth scopes, both accepted on every read method:

- `https://www.googleapis.com/auth/analytics.readonly`
- `https://www.googleapis.com/auth/analytics.edit` (also required for any mutation)

AOOS should request `analytics.readonly` only.

Service accounts work through Application Default Credentials in Google's client libraries. Whether
domain-wide delegation is required for GA4 specifically is **UNVERIFIED** — not stated on any Admin
API page found. The existing AOOS `GA4_SERVICE_ACCOUNT_JSON` credential is a plausible reuse
candidate, but the service account must be granted access on the GA4 account or property, and that
must be proven by a successful authenticated read before any connection is claimed.

Source: https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accounts/list

## Read-only methods worth wiring

All are `GET` with an empty body. `pageSize` defaults to 50, max 200. `pageToken` paginates.

| Method | Path | Notes |
| --- | --- | --- |
| `accountSummaries.list` | `/v1beta/accountSummaries` | Best single discovery call. Returns accounts with nested `propertySummaries[]` carrying `property`, `displayName`, `propertyType`, `parent`, `canEdit`. |
| `accounts.list` | `/v1beta/accounts` | Supports `showDeleted`. |
| `properties.get` | `/v1beta/{name=properties/*}` | Single `Property`. |
| `properties.list` | `/v1beta/properties` | `filter` is **required**: `parent:accounts/{id}`, `ancestor:accounts/{id}`, `firebase_project:{id}`. |
| `properties.dataStreams.list` | `/v1beta/{parent=properties/*}/dataStreams` | Streams, needed to resolve a web stream's measurement ID. |
| `properties.customDimensions.list` | `/v1beta/{parent=properties/*}/customDimensions` | |
| `properties.customMetrics.list` | `/v1beta/{parent=properties/*}/customMetrics` | |
| `properties.keyEvents.list` | `/v1beta/{parent=properties/*}/keyEvents` | Current terminology for conversions. |
| `properties.conversionEvents.list` | `/v1beta/{parent=properties/*}/conversionEvents` | Legacy parallel resource. Exact response field names **UNVERIFIED** in this pass. |
| `properties.googleAdsLinks.list` | `/v1alpha/{parent=properties/*}/googleAdsLinks` | v1alpha only. |

Sources: the corresponding pages under
https://developers.google.com/analytics/devguides/config/admin/v1/rest

## Mutating vs read-only

`get` and `list` are read-only. `create`, `patch`, `delete`, `archive` and `update*` alter the
customer's analytics configuration and additionally consume the write quotas. AOOS must not call any
of them without an explicit approved change request.

Source: https://developers.google.com/analytics/devguides/config/admin/v1/quotas

## Quotas

| Quota | Limit |
| --- | --- |
| Requests per minute | 1,200 |
| Requests per minute per user | 600 |
| Writes per minute | 600 |
| Writes per minute per user | 180 |
| User deletions per day per property | 500 |

A daily discovery read is nowhere near these ceilings.
Source: https://developers.google.com/analytics/devguides/config/admin/v1/quotas

## Errors

No Admin-API-specific error table was found. The envelope follows `google.rpc.Status`
(`code`, `message`, `details`) per
https://github.com/googleapis/googleapis/blob/master/google/rpc/status.proto. The 403-on-quota
behaviour and the sibling Data API error table are **UNVERIFIED** for this API specifically, so AOOS
error handling must record the raw HTTP status and body rather than assume a mapping.

## Official Google repositories

| Repository | Contents |
| --- | --- |
| https://github.com/googleapis/googleapis/tree/master/google/analytics/admin | Canonical `.proto` definitions, source of truth for every message and method. |
| https://github.com/googleapis/google-api-nodejs-client | `googleapis` umbrella package, `google.analyticsadmin('v1beta')`. Also hosts the REST discovery docs at `discovery/analyticsadmin-v1beta.json` and `-v1alpha.json`. |
| https://github.com/googleapis/google-cloud-node/tree/main/packages/google-analytics-admin | Dedicated typed Node client `@google-analytics/admin`, plus generated samples. |
| https://github.com/googleapis/google-cloud-python/tree/main/packages/google-analytics-admin | Python GAPIC client. |
| https://github.com/googleanalytics/python-docs-samples/tree/main/google-analytics-admin | Official runnable samples, e.g. `account_summaries_list.py`. |

RPC package reference:
https://developers.google.com/analytics/devguides/config/admin/v1/rpc/google.analytics.admin.v1beta

## Runtime constraint for AOOS

The Worker runtime bundles everything at build time and has no Node host. The gRPC-based
`@google-analytics/admin` GAPIC client is a poor fit. AOOS should call the REST endpoints directly
with `fetch` and mint the access token the same way the existing GA4 Data API client does, rather
than adding a heavyweight client library.

## AOOS implications, not yet approved

1. `accountSummaries.list` is the single call that turns GA4 property binding into evidence. One
   read yields every property the credential can actually see, which also proves or disproves the
   `properties/536830122` reference.
2. Everything here is read-only and cheap, so it fits the existing observation cadence model, but
   per the truthfulness rule the capability stays `pending` until a successful authenticated read
   stores an immutable snapshot.
3. Reuse `GA4_SERVICE_ACCOUNT_JSON` if the account has admin read access. If not, that is a real
   blocker to surface, not something to work around.
