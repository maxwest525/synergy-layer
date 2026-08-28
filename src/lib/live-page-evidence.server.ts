import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { createRenderedVerifier } from "./execution/execute.server";

type Client = SupabaseClient<Database>;

/**
 * The live page wording a proposal is drafted against.
 *
 * A fresh render is preferred: it is the most current reading available. But
 * the page audit has already rendered every page and stored its title and H1,
 * so a renderer being unreachable must not stop an operator drafting a fix.
 * The stored observation is the same measurement, taken earlier, and drafting
 * falls back to it rather than refusing.
 *
 * Why a stale reading is safe here, and only here: the executor re-checks
 * drift at commit time. The approved before-value must occur exactly once in
 * the source file, and the branch head must still equal the approved base
 * revision, or the write is refused without touching anything. A proposal
 * built on a stale reading therefore fails at execution instead of applying a
 * wrong edit -- the cost is a refused execution, never a bad commit.
 *
 * NEVER use this for publish proof. Proving a change went live requires a
 * fresh render of the public page: a stored audit row predates the change and
 * would "prove" the pre-edit wording. `checkPublishedPage` keeps using
 * `createRenderedVerifier` directly for exactly that reason.
 */
export type LivePageWording = {
  finalUrl: string;
  title: string | null;
  heading: string | null;
  /** Only a fresh render carries this; the page audit does not store it. */
  metaDescription: string | null;
  renderedBy: string;
  fromStoredAudit: boolean;
};

/** The stored audit reading for one page, newest first, failures excluded. */
async function storedAuditWording(
  client: Client,
  tenantId: string,
  targetUrl: string,
): Promise<LivePageWording | null> {
  const { data, error } = await client
    .from("page_metadata_observations")
    .select("url, final_url, title, h1, rendered_by, observed_at")
    .eq("tenant_id", tenantId)
    .eq("url", targetUrl)
    .is("error", null)
    .not("title", "is", null)
    .not("h1", "is", null)
    .order("observed_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row || !row.title || !row.h1) return null;
  const observedOn = row.observed_at.slice(0, 10);
  return {
    finalUrl: row.final_url ?? row.url,
    title: row.title,
    heading: row.h1,
    metaDescription: null,
    // Provenance stays legible on the proposal: an operator can see this came
    // from the audit's earlier reading rather than a render made just now.
    renderedBy: `stored page audit of ${observedOn}${row.rendered_by ? `, rendered by ${row.rendered_by}` : ""}`,
    fromStoredAudit: true,
  };
}

/**
 * Read the page's current wording: a fresh render when one can be had, the
 * stored audit reading when it cannot. Throws only when neither exists.
 */
export async function readLivePageWording(input: {
  client: Client;
  tenantId: string;
  targetUrl: string;
}): Promise<LivePageWording> {
  const verifier = createRenderedVerifier();
  let renderFailure: string | null = null;

  if (verifier) {
    try {
      const rendered = await verifier.render(input.targetUrl);
      return {
        finalUrl: rendered.finalUrl,
        title: rendered.title,
        heading: rendered.heading,
        metaDescription: rendered.metaDescription,
        renderedBy: rendered.renderedBy,
        fromStoredAudit: false,
      };
    } catch (error) {
      renderFailure = error instanceof Error ? error.message : "the render failed";
    }
  }

  const stored = await storedAuditWording(input.client, input.tenantId, input.targetUrl);
  if (stored) return stored;

  throw new Error(
    renderFailure
      ? `The page could not be read: ${renderFailure} And the page audit has stored no successful reading of this page to fall back on, so run a page audit or restore a renderer.`
      : "The page could not be read: no page renderer is configured, and the page audit has stored no reading of this page to fall back on. Run a page audit, or configure Crawl4AI (VPS_SCRAPER_API_KEY).",
  );
}
