# Governed SEO Runtime Design

**Approved:** 2026-08-14

**Scope approval:** literal-all: the SEO runtime providers plus Google Ads, n8n, and the VPS scraper bridge.

## Outcome

AOOS must visibly run a governed SEO change lifecycle from provider readiness and evidence collection through finding, proposal, approval, exact execution, rendered verification, measurement, and rollback. The Execution Handbook and the complete SEO/AEO and DataForSEO playbooks must be versioned, chunked, embedded, activated, retrievable, and visible inside AOOS. Authority Science must produce executable, evidence-bound findings and permitted actions rather than remain prose.

## Non-negotiable behavior

- No demo, synthetic, or invented production data.
- A configured secret is not a live-proven connection.
- A finding is an observation; a proposal is a concrete change; approval authorizes only that exact proposal.
- Status remains `proposed -> approved -> executing -> executed -> verified|failed`, with rollback preserved.
- Knowledge guides decisions but is never presented as live page, Search Console, analytics, or SERP evidence.
- Every ingested source has provenance, checksum, immutable version, chunks, embedding model and dimensions, activation history, and tenant ownership.
- Only one active version exists per source and tenant.
- External health probes must be bounded, read-only, and report their real outcome.
- Missing n8n or VPS endpoint details produce `configured` or `blocked`, never `healthy`.
- GitHub merge, Lovable source synchronization, and Lovable production publish are verified separately.

## Connector control plane

`tenant_connections` becomes the runtime source of truth for provider readiness. Secrets remain in server environment configuration; the database stores only secret names, safe configuration, probe timestamps, health, and redacted proof.

The required connector keys are:

1. `supabase`
2. `google_search_console`
3. `google_analytics_4`
4. `dataforseo`
5. `firecrawl`
6. `gemini_generation`
7. `gemini_embeddings`
8. `github_executor`
9. `pagespeed_insights`
10. `serpapi`
11. `perplexity`
12. `google_ads`
13. `n8n`
14. `vps_scraper`

Each connector exposes a deterministic descriptor and a bounded probe. The UI distinguishes `missing`, `configured`, `healthy`, `degraded`, and `failing`. Provider code consumes the same descriptor keys so the registry and runtime cannot disagree silently.

## Knowledge runtime

Add three governed entities:

- `knowledge_sources`: stable identity and tenant ownership.
- `knowledge_source_versions`: immutable content checksum, version label, source path/reference, parser, status, embedding model, dimensions, and activation timestamps.
- `knowledge_chunks`: ordered source slices with heading path, token estimate, checksum, body, `vector(768)` embedding, and metadata.

Enable `vector`; create a tenant-scoped hybrid search RPC combining cosine similarity with lexical title/body matching. Retrieval only returns chunks from active versions. Existing `knowledge_entries` remain compatible for operational research, but proposal guidance switches to the governed hybrid runtime.

Authoritative production sources:

- `SEO & AEO Laws, Algorithms and Decision Models` from the supplied 210 KB source, including Authority Science.
- `DataForSEO Master Playbook` from the supplied latest 30.6 KB source.
- The 16 Markdown documents under `docs/execution-handbook`.

Chunking is deterministic by Markdown heading, with bounded paragraph packing and overlap only at heading context. Embeddings use `gemini-embedding-001`, 768 dimensions, retrieval-document task type, and source title. Query embeddings use the same model with retrieval-query task type.

## Authority Science execution

Authority Science becomes a rules engine whose input is dated, tenant-scoped evidence and whose output is an `AuthorityFinding`:

```ts
type AuthorityFinding = {
  ruleKey: string;
  targetUrl: string;
  queryClass: "community" | "local_service" | "professional_b2b" | "ymyl" | "general";
  severity: "info" | "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  observed: Record<string, unknown>;
  missingEvidence: string[];
  permittedActions: AuthorityAction[];
  knowledgeChunkIds: string[];
};
```

Initial executable rules cover the supplied models without pretending latent authority can be inferred from one rank:

- ranking versus authority-capacity separation;
- relevance floor and do-not-compete gate;
- owned versus rented authority classification and platform-risk warning;
- information-gain threshold;
- freshness/decay review trigger;
- entity corroboration insufficiency;
- authority transfer measurement readiness;
- internal-link priority;
- satisfaction evidence gap;
- authority drift alert using repeated observations.

Rules may create findings and recommendations. Only a permitted action with an exact target, before/after change, evidence snapshot, source baseline, and rollback plan can become a change request.

## Visible product workflow

Add `/seo-runs` and `/seo-runs/$id`. A run shows:

1. connector preflight;
2. target and evidence snapshot;
3. knowledge chunks used;
4. Authority Science findings;
5. concrete recommendations;
6. proposal/change-request links;
7. approval and execution state;
8. rendered proof, measurement windows, and rollback state.

Knowledge gains source/version/activation status and an Operating Manual view that renders the Execution Handbook inside AOOS.

## Production proof

Completion requires passing unit tests, TypeScript, lint, and production build; applied migration; populated source/version/chunk rows; non-null 768-dimensional embeddings for every active chunk; active-version uniqueness; visible handbook and run UI; connector rows with honest health; at least one real existing target capable of reaching proposal review; GitHub main verification; Lovable source synchronization; and a separately verified production publish.

