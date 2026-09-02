-- The proposal type check accepts every site-level change kind (CODE-91)
--
-- Three lists decide whether a governed change can exist, and none can see the
-- others: GOVERNED_CHANGE_KINDS in the application, the file list inside
-- apply_change_request_rendered_proof, and this constraint. CODE-90 added
-- site.footer_wording, moved the first two, and was still refused by the third
-- -- at the moment the operator pressed Draft, which is the worst place to
-- learn a lane does not work.
--
-- Adding site.footer_wording alone would have left the same trap set. The new
-- proposal-type-allowlist.test.ts derives the expected set from the change
-- kinds and found site.structured_data missing too: the schema lane would have
-- failed identically the first time anyone drafted from it. Both are added, so
-- the constraint states what the application can emit rather than what it
-- happened to emit on the day each lane shipped.
--
-- The two page lanes are literals because their SQL writers store the literal:
-- create_title_h1_proposal writes 'page_wording' and the metadata writer
-- 'page_metadata'. Neither is named by a change kind.

ALTER TABLE public.change_requests
  DROP CONSTRAINT IF EXISTS change_requests_proposal_type_check;

ALTER TABLE public.change_requests
  ADD CONSTRAINT change_requests_proposal_type_check
  CHECK (proposal_type IN (
    'page_wording',
    'page_metadata',
    'site.crawl_directives',
    'site.footer_wording',
    'site.structured_data'
  ));
