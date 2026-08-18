# Build roadmap workspace

A shared roadmap tab where you type what you want built, and I read and work from it directly instead of you re-explaining it in chat.

## What you get

A new **Roadmap** tab in the sidebar (under Today, next to Notes) with:

- A single input box at the top: title, an optional longer description, and a priority. Enter adds it instantly.
- A list of roadmap items grouped by status: **Requested**, **In progress**, **Shipped**, **Parked**.
- Each item can be dragged between statuses (or moved by a status dropdown, no drag required on mobile).
- Each item shows who added it, when, and a running comment thread so you and I can go back and forth on one item without losing the thread.
- I can add items too, and mark my own progress, so the page becomes the live shared queue for this project.
- Optional link field so an item can point at a page, workflow, or evidence screen inside AOOS.

## How I use it

When you say "next", I read the Roadmap tab, take the top **Requested** item by priority, move it to **In progress**, do the work, then move it to **Shipped** with a short note of what actually changed. Nothing is deleted, so the page doubles as a build history.

## Technical notes

- New table `roadmap_items` (tenant-scoped, RLS + GRANTs in the same migration): title, detail, status enum (`requested` | `in_progress` | `shipped` | `parked`), priority (`now` | `next` | `later`), linked_url, sort order, created_by, timestamps.
- New table `roadmap_comments` referencing the item, with author and body.
- Server functions in `src/lib/roadmap.functions.ts` following the existing `notes.functions.ts` pattern (`requireSupabaseAuth` middleware, tenant resolution, manual input parsing via `src/lib/server-input.ts` helpers).
- New route `src/routes/roadmap.tsx` with `ssr: false`, `OperatorRouteError`, and its own `head()` metadata, using existing `GlassCard` / `PageHeader` / `PageStack` primitives and the outlined-button style.
- Sidebar entry added to `src/components/os/shell.tsx` under the Today section, group `decisions`.
- Instruction-first copy on empty states ("No items yet - add the first one").
