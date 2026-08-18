# Store the first real readings, then keep them coming

"Snapshot" just means one stored reading from a provider, with the time, the
window it covers, and where it came from. It is how AOOS proves a connection is
real instead of claiming it. Today only Search Console has any (112 rows). GA4,
PageSpeed and Umami have zero, which is why so much of the system reads
"not measured".

## What gets run now

For each source, run the real read and write the reading. No mocks, no
placeholder rows. If a provider refuses, the failure is stored and shown with the
exact provider message rather than a zero.

1. **GA4** (property 536830122): 28 day window through yesterday. Sessions,
   users, page paths, channels. Uses the stored service account credential.
2. **Umami** (analytics.marky.systems): 28 day window. Totals, daily series, top
   pages, referrers, using the stored bearer token.
3. **PageSpeed**: mobile and desktop for the primary pages of trumoveinc.com.
   The keyless daily quota previously refused these, so runs are spaced and the
   quota message is surfaced plainly if it refuses again.
4. **Search Console**: one catch-up read so the latest finalized dates are current.

## Then keep them current without asking

- Enable the daily observation cadence for each source that stored a reading.
- Every run records status, duration, rows returned, and the last error.
- A failed overnight run shows on Today as an instruction with a retry button,
  never as silent zeros.

## What you will see afterwards

- Analytics, Traffic, Speed and Search each show real numbers with the date they
  cover, instead of empty states.
- Coverage and Marketing essentials stop saying "not measured" for anything that
  now has evidence.
- Any source that genuinely cannot connect says exactly why, with the next step.

## Technical notes

- Reads go through the existing server functions behind `requireSupabaseAuth`,
  tenant scoped, writing to `ga4_snapshots`, `umami_snapshots`,
  `pagespeed_snapshots` and `search_console_snapshots` with provenance retained.
- Each write is idempotent per window; re-running stores nothing new rather than
  duplicating.
- Cadences are declared in `src/registry/modules/*.ts` and enabled only for
  read-only observation. Nothing mutating is scheduled.
