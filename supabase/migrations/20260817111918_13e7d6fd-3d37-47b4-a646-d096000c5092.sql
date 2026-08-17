
create table if not exists public.essential_concern_templates (
  key text primary key,
  phase text not null,
  task text not null,
  description text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

grant select on public.essential_concern_templates to authenticated;
grant all on public.essential_concern_templates to service_role;
alter table public.essential_concern_templates enable row level security;
drop policy if exists "Authenticated can read concern templates" on public.essential_concern_templates;
create policy "Authenticated can read concern templates"
  on public.essential_concern_templates for select to authenticated using (true);

insert into public.essential_concern_templates (key, phase, task, description, sort_order)
values
  ('fw.semantic_gap_analysis','1. Strategic Planning & Market Intelligence','Semantic Gap Analysis','Identifying topical gaps where competitors rank but you lack content.',1),
  ('fw.commercial_intent_mapping','1. Strategic Planning & Market Intelligence','Commercial Intent Mapping','Classifying keywords by transactional value to prioritize high-revenue pages.',2),
  ('fw.entity_relationship_mapping','1. Strategic Planning & Market Intelligence','Entity Relationship Mapping','Defining how your brand connects to industry keywords in Google''s Knowledge Graph.',3),
  ('fw.tam_seo_forecasting','1. Strategic Planning & Market Intelligence','TAM SEO Forecasting','Calculating total addressable market organic traffic and revenue potential.',4),
  ('fw.edge_seo_implementation','2. Server & Infrastructure Architecture','Edge SEO Implementation','Deploying code, security rules, and redirects via Cloudflare Workers or CDNs without touching origin code.',5),
  ('fw.server_side_rendering__ssr__setup','2. Server & Infrastructure Architecture','Server-Side Rendering (SSR) Setup','Configuring headless frameworks to deliver fully rendered HTML to bots instantly.',6),
  ('fw.http_3_protocol_activation','2. Server & Infrastructure Architecture','HTTP/3 Protocol Activation','Upgrading server protocols to maximize asset delivery speed and minimize handshake latency.',7),
  ('fw.dynamic_rendering_configuration','2. Server & Infrastructure Architecture','Dynamic Rendering Configuration','Serving pre-rendered pages to web crawlers while users get a client-side experience.',8),
  ('fw.tls_1_3_encryption_enlistment','2. Server & Infrastructure Architecture','TLS 1.3 Encryption Enlistment','Enforcing the fastest, most secure encryption layer to maximize security ranking signals.',9),
  ('fw.log_file_parsing','3. Indexation & Crawl Budget Governance','Log File Parsing','Analyzing server logs to identify bot request patterns and wasted crawl budget.',10),
  ('fw.redirect_chain_consolidation','3. Indexation & Crawl Budget Governance','Redirect Chain Consolidation','Collapsing nested 301/302 hops down to single-step jumps to conserve bot energy.',11),
  ('fw.facet___filter_parameter_handling','3. Indexation & Crawl Budget Governance','Facet & Filter Parameter Handling','Using robots.txt or parameters to lock out bots from tracking infinite product filter configurations.',12),
  ('fw.orphan_page_discovery___re_integration','3. Indexation & Crawl Budget Governance','Orphan Page Discovery & Re-integration','Finding floating URLs that lack internal links and weaving them back into the architecture.',13),
  ('fw.xml_sitemap_sharding','3. Indexation & Crawl Budget Governance','XML Sitemap Sharding','Splitting massive sitemaps into smaller categories (under 50k URLs) for faster indexing updates.',14),
  ('fw.pagination_tag_governance','3. Indexation & Crawl Budget Governance','Pagination Tag Governance','Using self-referential canonicals and deep internal links to pass equity through component pages.',15),
  ('fw.nested_organization___author_schema','4. Semantic Engineering & Schema Deployments','Nested Organization & Author Schema','Linking author entities to external social/professional graph points inside organizational code.',16),
  ('fw.product___aggregaterating_injection','4. Semantic Engineering & Schema Deployments','Product & AggregateRating Injection','Embedding dynamic JSON-LD code to trigger pricing, availability, and star ratings on SERPs.',17),
  ('fw.faq___howto_code_structuring','4. Semantic Engineering & Schema Deployments','FAQ & HowTo Code Structuring','Hardcoding micro-data patterns to claim maximum real estate on traditional search result layouts.',18),
  ('fw.sameas_wiki_data_referencing','4. Semantic Engineering & Schema Deployments','SameAs Wiki Data Referencing','Using schema to point directly to authoritative Wikipedia/Wikidata pages to anchor your brand entity.',19),
  ('fw.keyword_cannibalization_audits','5. Advanced On-Page & Internal Link Dynamics','Keyword Cannibalization Audits','Pruning or merging duplicate pages that target identical keyword strings to stop rank splitting.',20),
  ('fw.pagerank_link_equity_sculpting','5. Advanced On-Page & Internal Link Dynamics','PageRank Link-Equity Sculpting','Using strategic internal linking architectures to push authority to high-value conversion pages.',21),
  ('fw.dynamic_anchor_text_optimization','5. Advanced On-Page & Internal Link Dynamics','Dynamic Anchor Text Optimization','Varying internal descriptive text to help search crawlers accurately map contextual relevance.',22),
  ('fw.content_pruning___decay_remediation','5. Advanced On-Page & Internal Link Dynamics','Content Pruning & Decay Remediation','De-indexing thin content or updating dying traffic assets to preserve structural site authority.',23),
  ('fw.expert_content_consensus_audits','6. Radical E-E-A-T & Trust Alignment','Expert Content Consensus Audits','Cross-referencing all site data with leading industry guidelines to prevent misinformation flags.',24),
  ('fw.editorial_policy_publication','6. Radical E-E-A-T & Trust Alignment','Editorial Policy Publication','Displaying verifiable content production, fact-checking, and correction processes publicly.',25),
  ('fw.source_verification_systems','6. Radical E-E-A-T & Trust Alignment','Source Verification Systems','Placing in-text citation links to peer-reviewed data, government metrics, or original clinical studies.',26),
  ('fw.reviewer_credentialing_integration','6. Radical E-E-A-T & Trust Alignment','Reviewer Credentialing Integration','Displaying ''Reviewed by [Expert Name]'' metadata explicitly alongside physical author bios.',27),
  ('fw.editorial_outreach___link_acquisition','7. Digital PR & Off-Page Equity Acquisition','Editorial Outreach & Link Acquisition','Securing mentions and resource page backlinks from highly trusted niche publications.',28),
  ('fw.unlinked_brand_mention_reclaim','7. Digital PR & Off-Page Equity Acquisition','Unlinked Brand Mention Reclaim','Tracking web text mentions of your company and requesting conversions into live click links.',29),
  ('fw.broken_link_building_execution','7. Digital PR & Off-Page Equity Acquisition','Broken Link Building Execution','Finding dead pages on external sites and suggesting your fresh content as the drop-in replacement.',30),
  ('fw.toxic_link_profile_auditing','7. Digital PR & Off-Page Equity Acquisition','Toxic Link Profile Auditing','Evaluating incoming link quality to monitor for negative SEO attacks or artificial patterns.',31),
  ('fw.largest_contentful_paint__lcp__reduction','8. User Experience & Core Web Vitals Engineering','Largest Contentful Paint (LCP) Reduction','Optimizing image weights and rendering paths to show primary visual blocks under 2.5 seconds.',32),
  ('fw.interaction_to_next_paint__inp__fine_tuning','8. Server & Infrastructure Architecture','Interaction to Next Paint (INP) Fine-Tuning','Optimizing JavaScript response speeds to ensure rapid feedback when users interact with components.',33),
  ('fw.cumulative_layout_shift__cls__stabilization','8. User Experience & Core Web Vitals Engineering','Cumulative Layout Shift (CLS) Stabilization','Fixing content layout shifts during page loads by setting strict dimensions for images and ads.',34),
  ('fw.font_swapping_optimization','8. User Experience & Core Web Vitals Engineering','Font Swapping Optimization','Applying font-display swap protocols to prevent flashes of invisible text during load times.',35),
  ('fw.ada_section_508___wcag_compliance','9. Legal, Trust, & Accessibility Compliance','ADA Section 508 / WCAG Compliance','Ensuring the site architecture is fully navigable via screen readers, boosting UX signals.',36),
  ('fw.privacy_policy___term_disclosures','9. Legal, Trust, & Accessibility Compliance','Privacy Policy & Term Disclosures','Deploying complete legal frameworks to establish core corporate credibility metrics for bots.',37),
  ('fw.merchant_transparency_auditing','9. Legal, Trust, & Accessibility Compliance','Merchant Transparency Auditing','Publishing concrete shipping, refund, and physical address terms required for commercial trust.',38),
  ('fw.information_density_compression','10. Generative Engine Optimization (GEO)','Information Density Compression','Formulating direct answer frameworks and summaries at the top of text blocks for AI scraping bots.',39),
  ('fw.llm_co_citation_campaigning','10. Generative Engine Optimization (GEO)','LLM Co-Citation Campaigning','Securing placements in major industry list articles to train LLM contextual associations around your brand.',40),
  ('fw.conversational_intent_engineering','10. Generative Engine Optimization (GEO)','Conversational Intent Engineering','Mapping longer natural-speech prompt formats to capturing long-tail conversational user traffic.',41),
  ('fw.entity_ingestion_auditing','10. Generative Engine Optimization (GEO)','Entity Ingestion Auditing','Querying commercial LLMs to monitor how your brand profile is generated in conversational search.',42),
  ('fw.video_seo_transcribing___optimization','11. Omni-Channel & Search Everywhere Surface SEO','Video SEO Transcribing & Optimization','Injecting timestamp chapters, closed captions, and descriptive keywords into video engines like YouTube and TikTok.',43),
  ('fw.visual_image_metadata_standardization','11. Omni-Channel & Search Everywhere Surface SEO','Visual Image Metadata Standardization','Embedding EXIF parameters, high contrast, and alt tags for Google Lens and Pinterest discovery surfaces.',44),
  ('fw.app_store_optimization__aso__bridging','11. Omni-Channel & Search Everywhere Surface SEO','App Store Optimization (ASO) Bridging','Synchronizing app listing copy with web assets to capture blended search page real estate.',45),
  ('fw.marketplace_seo_optimization','11. Omni-Channel & Search Everywhere Surface SEO','Marketplace SEO Optimization','Structuring product variant files on Amazon, Walmart, or eBay to win commercial search visibility.',46),
  ('fw.google_business_profile_hyper_optimization','12. Localized Search Ecosystems','Google Business Profile Hyper-Optimization','Refreshing real-time operations info, review replies, geocoded imagery, and service listings.',47),
  ('fw.local_citation_consistency_audits','12. Localized Search Ecosystems','Local Citation Consistency Audits','Enforcing identical Name, Address, and Phone Number (NAP) details across Apple Maps, Yelp, and directories.',48),
  ('fw.geotargeted_location_hub_architecture','12. Localized Search Ecosystems','Geotargeted Location Hub Architecture','Building distinct landing assets scaled specifically to physical localized communities and regional targets.',49),
  ('fw.google_search_console_api_pipeline_building','13. Enterprise Analytics & Change Controls','Google Search Console API Pipeline Building','Extracting massive rank tracking data fields directly into BigQuery or BI storage spaces.',50),
  ('fw.automated_code_repository_ci_cd_monitors','13. Enterprise Analytics & Change Controls','Automated Code Repository CI/CD Monitors','Integrating script checkers into GitHub deployments to block live pushes that break index scripts.',51),
  ('fw.organic_split_a_b_testing','13. Enterprise Analytics & Change Controls','Organic Split A/B Testing','Deploying metadata layouts across template buckets to empirically measure search click variables.',52),
  ('fw.conversion_rate_optimization__cro__synergy','14. Monetization & Funnel Alignment','Conversion Rate Optimization (CRO) Synergy','Aligning visual search entry funnels directly to lead captures to transform clicks to cash flow.',53),
  ('fw.attribution_modeling_calibration','14. Monetization & Funnel Alignment','Attribution Modeling Calibration','Mapping exact assisted values organic visits provide inside multi-channel paid acquisition paths.',54)
on conflict (key) do update set
  phase = excluded.phase,
  task = excluded.task,
  description = excluded.description,
  sort_order = excluded.sort_order;

create table if not exists public.essential_concerns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  phase text not null,
  task text not null,
  description text not null,
  priority integer not null default 0,
  sort_order integer not null default 0,
  origin text not null default 'framework',
  evidence_source text,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create index if not exists essential_concerns_tenant_idx on public.essential_concerns (tenant_id, sort_order);

grant select on public.essential_concerns to authenticated;
grant all on public.essential_concerns to service_role;
alter table public.essential_concerns enable row level security;
drop policy if exists "Tenant members read concerns" on public.essential_concerns;
create policy "Tenant members read concerns"
  on public.essential_concerns for select to authenticated
  using (exists (select 1 from public.tenant_members m
                 where m.tenant_id = essential_concerns.tenant_id and m.user_id = auth.uid()));

create table if not exists public.essential_concern_evaluations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  concern_id uuid not null references public.essential_concerns(id) on delete cascade,
  status text not null check (status in ('working','unproven','broken','cannot_measure')),
  summary text not null,
  limitation text,
  derived_from jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now()
);

create index if not exists essential_concern_evaluations_concern_idx
  on public.essential_concern_evaluations (concern_id, evaluated_at desc);

grant select on public.essential_concern_evaluations to authenticated;
grant all on public.essential_concern_evaluations to service_role;
alter table public.essential_concern_evaluations enable row level security;
drop policy if exists "Tenant members read concern evaluations" on public.essential_concern_evaluations;
create policy "Tenant members read concern evaluations"
  on public.essential_concern_evaluations for select to authenticated
  using (exists (select 1 from public.tenant_members m
                 where m.tenant_id = essential_concern_evaluations.tenant_id and m.user_id = auth.uid()));

create or replace function public.essential_concern_evaluations_immutable()
returns trigger language plpgsql
set search_path = public
as $fn$
begin
  raise exception 'essential_concern_evaluations is insert-only';
end;
$fn$;

drop trigger if exists essential_concern_evaluations_no_update on public.essential_concern_evaluations;
create trigger essential_concern_evaluations_no_update
  before update or delete on public.essential_concern_evaluations
  for each row execute function public.essential_concern_evaluations_immutable();

create or replace function public.seed_essential_concerns_for_tenant(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  inserted integer;
begin
  if not exists (select 1 from public.tenant_members m
                 where m.tenant_id = p_tenant_id and m.user_id = auth.uid()) then
    raise exception 'not a member of this workspace';
  end if;

  insert into public.essential_concerns (tenant_id, key, phase, task, description, sort_order)
  select p_tenant_id, t.key, t.phase, t.task, t.description, t.sort_order
  from public.essential_concern_templates t
  on conflict (tenant_id, key) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$fn$;

revoke all on function public.seed_essential_concerns_for_tenant(uuid) from public, anon;
grant execute on function public.seed_essential_concerns_for_tenant(uuid) to authenticated, service_role;

insert into public.essential_concerns (tenant_id, key, phase, task, description, sort_order)
select tn.id, t.key, t.phase, t.task, t.description, t.sort_order
from public.tenants tn cross join public.essential_concern_templates t
on conflict (tenant_id, key) do nothing;
