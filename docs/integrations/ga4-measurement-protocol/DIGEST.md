# GA4 Measurement Protocol — authoritative digest

Status: documentation discovery complete. No implementation authorised.
Discovered: 2026-08-19. Sources: official Google developer documentation and official Google GitHub organisations only.

## What it is

A server-to-server **write** endpoint that injects events into a GA4 property. It has no read
surface. Every call mutates a production analytics property, so under the AOOS contract it is a
mutating external integration and requires explicit operator approval per execution.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST https://www.google-analytics.com/mp/collect` | Live collection. Data lands in the property. |
| `POST https://www.google-analytics.com/debug/mp/collect` | Validation server. Same payload, returns validation messages, does **not** write. |
| `https://region1.google-analytics.com/mp/collect` (+ `/debug/...`) | EU-region variants. |

POST over HTTPS only.
Source: https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events
and https://developers.google.com/analytics/devguides/collection/protocol/ga4/validating-events

## Auth

Not OAuth. Authentication is a single query parameter `api_secret`, created in the GA4 admin UI
under Admin, Data Streams, the stream, Measurement Protocol API secrets.

Stream targeting:

- Web stream: `measurement_id` query param + `client_id` in the body.
- App stream: `firebase_app_id` query param + `app_instance_id` in the body.

The debug endpoint does **not** validate `api_secret` or `firebase_app_id`, so a clean validation
response is not proof of correct credentials.
Source: https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events

## Payload shape

Top-level body fields: `client_id` / `app_instance_id` (required), `user_id`, `timestamp_micros`
(Unix microseconds), `user_properties` (max 25), `user_data`, `consent`
(`ad_user_data`, `ad_personalization`, each `GRANTED` or `DENIED`), `non_personalized_ads`
(deprecated), `user_location`, `ip_override` (superseded by `user_location`), `device`,
`validation_behavior` (`RELAXED` default, or `ENFORCE_RECOMMENDATIONS`), and `events` (required,
max 25). Each event has `name` and optional `params`.
Source: https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference

## Limits

- 25 events per request, 25 params per event, 25 user properties per request.
- Event names: 40 chars, alphanumeric plus underscore, must start with a letter.
- Param names: 40 chars. Param values: 100 chars standard, 500 chars on 360.
- User property names 24 chars, values 36 chars. Item params: 10 custom max.
- Request body under 130 KB.
- A high per-property hourly non-conversion request ceiling exists; once exceeded, GA4 **silently
  drops** all non-conversion requests for that property for the rest of the hour. The exact numeric
  figure was not captured cleanly and is UNVERIFIED — confirm on the Send events page before relying
  on any specific number. Does not apply to 360 properties.

Source: https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events

## Backfill window

`timestamp_micros` backdates events up to **72 hours**. For geo and device data to join the correct
session rather than the client's latest known info, `session_id` must be sent and the event
delivered within **24 hours of session start**. No broader backfill guarantee is documented.
Source: https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference

## Reserved names

Reserved event names that cannot be sent include `session_start`, `first_visit`, `first_open`,
`user_engagement`, `error`, `app_exception`, the `ad_*`, `notification_*`, `firebase_*` and
`dynamic_link_*` families, and others. `ad_impression`, `in_app_purchase` and `screen_view` are
app-stream only. Reserved parameter name: `firebase_conversion`. Names must not start with `_`,
`firebase_`, `ga_`, `google_` or `gtag.`. Reserved user properties: `first_open_time`,
`first_visit_time`, `last_deep_link_referrer`, `user_id`, `first_open_after_install`.
Source: https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference

## Response behaviour — critical for AOOS evidence

The **live endpoint does not return HTTP error codes**, even for a malformed or incomplete payload.
A 2xx from `/mp/collect` is therefore **not evidence that the event was accepted or recorded**. The
widely reported `204 No Content` status is UNVERIFIED against an official Google statement; the docs
only say error codes are not returned.

The debug endpoint returns JSON with a `validationMessages` array. An empty array means no issues.
Each message carries `fieldPath`, `description`, and `validationCode`, one of `VALUE_INVALID`,
`VALUE_REQUIRED`, `NAME_INVALID`, `NAME_RESERVED`, `VALUE_OUT_OF_BOUNDS`, `EXCEEDED_MAX_ENTITIES`,
`NAME_DUPLICATED`.

Google recommends `ENFORCE_RECOMMENDATIONS` against the debug endpoint in development and the
default `RELAXED` in production.
Source: https://developers.google.com/analytics/devguides/collection/protocol/ga4/validating-events

## Idempotency

No dedup key, request ID, or idempotency token exists in the schema. Re-sending the same body sends
the events again. Google never uses the word "idempotent", so the non-idempotent characterisation is
an inference from the absence of any dedup mechanism, not a quoted claim. UNVERIFIED as a direct
quote, but operationally binding: AOOS must treat retries as duplicate writes.

## Documented restrictions

- MP supplements tagging, it does not replace it. Sending events solely via MP yields only partial
  reporting.
- GA4 UI event-creation and event-modification rules do **not** apply to MP events. The sender must
  replicate that logic.
- App-stream MP events do not populate Google Ads Search audiences for app users.
- Google states MP is feature-complete with no deprecation plans, but recommends the Data Manager
  API for new server-to-server integrations.
- Usage is governed by the Measurement Protocol / SDK policy.

Source: https://developers.google.com/analytics/devguides/collection/protocol/ga4

## Official Google repositories

| Repository | Contents |
| --- | --- |
| https://github.com/googleanalytics/nodejs-docs-samples | Official Google Analytics org Node.js samples referenced from the GA4 docs. |
| https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/tutorial.google-analytics | Official MV3 Chrome extension MP sample. |
| https://github.com/google-marketing-solutions/tadau | Google Marketing Solutions library for sending usage data to GA4 over MP. |
| https://github.com/google-marketing-solutions/ga-mp-uploader | GMS uploader for GA4 over MP. Carries a "not an officially supported Google product" README disclaimer. |

No dedicated `googleapis/*` MP client library or open-source validation server was confirmed. The
docs route to the hosted Event Builder at https://ga-dev-tools.google/ga4/event-builder/ instead.
UNVERIFIED that any further official repo exists.

## AOOS implications, not yet approved

1. This is the first **write** path into a live analytics property AOOS would hold. It belongs behind
   the same approval gate as change-request execution, never on an automatic cadence.
2. The live endpoint's silent success means a successful HTTP call **cannot** be stored as proof of
   connection. Any AOOS health claim must come from a debug-endpoint validation pass plus a
   subsequent GA4 Data API read that observes the event, not from the POST itself.
3. The `api_secret` is a write credential for a production property. Server-side secret only.
4. Plausible AOOS use: stamping applied change-request events into GA4 so outcome measurement can
   correlate a deployed change against traffic. That requires a non-reserved custom event name and a
   dedup strategy AOOS owns, since the protocol offers none.
