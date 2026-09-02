# CLAUDE.md

<!-- BOUNDARY: builds=the marketing operating system that collects a site's own search and analytics evidence and turns it into approved changes | not=doing marketing for a site by hand -->

The working contract for this repository lives in [`AGENTS.md`](AGENTS.md) —
read it before making changes. [`README.md`](README.md) says what the project is;
[`docs/context/CURRENT_BUILD.md`](docs/context/CURRENT_BUILD.md) says where the
build has got to; [`docs/context/BACKLOG.md`](docs/context/BACKLOG.md) says what
is still owed, one item per ID, and is the only place open work is tracked.

[`docs/context/PROJECTS.md`](docs/context/PROJECTS.md) says which Lovable project
is which — AOOS ("Marky Sysyems") versus the public website ("TruMove Website
Final"). Read it before querying a database or telling the operator to publish:
the names overlap badly, the website's repo is called `brittmove-829a7519`, and
both live on domains containing "trumove".

[`docs/context/DEPLOYMENT_TOPOLOGY.md`](docs/context/DEPLOYMENT_TOPOLOGY.md)
says where production actually builds from: since 2026-08-30 Lovable syncs
with `maxwest525/trumove-resource-center`, not this repository, so a merge to
`main` here is not live until the reconciliation push and a publish.

Kept as a pointer rather than a copy so the two can never drift apart.
