# Sidebar reorder, and what is actually left

## The nav change

The sidebar sections run in the order a day runs. Ask and Coverage are both
side surfaces: Ask is a thinking tool, Coverage is the SEO framework map. They
should not sit between Today and the operational hubs.

New order:

```text
Today        decisions waiting on you (+ Suggestions, Page changes)
Evidence     stored facts (+ Search, Keywords, Competitors, Site health, ...)
Work         runs, schedules, SEO runs, tools, agents
Setup        connections, costs, people
Ask          the agent (+ Studio)
Coverage     the 54-task SEO framework map
```

Nothing is removed, nothing is hidden. Both sections keep their permanent
listing and their manual fold.

## Are you digging?

No. Coverage was real work, but it is one slice. The honest gap is that the
loop the whole system exists for has completed end to end exactly once:

- Observation is proven and healing itself (GSC, daily, backfilled).
- Suggest to approve to execute exists in code and has run once, on the
  corporate relocation page change.
- Its measurement window closes 2026-08-22, so the "did it work" half is not
  provable before then.
- GA4 and PageSpeed still have zero stored snapshots, so Site health is
  claiming nothing.

So the next honest piece of work is not another screen. It is a second real
change through the loop, so approve to execute to measured gain has more than
one data point, plus getting GA4 and PageSpeed to their first stored snapshot
so Evidence stops being GSC-only.

## Technical detail

- `src/components/os/shell.tsx`: reorder the `navSections` array so the Ask and
  Coverage entries come last. No other logic changes; taxonomy group membership
  in `src/lib/os-taxonomy.ts` stays as-is because it describes meaning, not
  sidebar order.
- Fix the reported `ChevronDown is not defined` runtime error in the same file.
