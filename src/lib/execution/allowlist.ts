/**
 * Hard allowlist for the governed execution target.
 *
 * Stored change-request metadata still drives display and audit, but a
 * malformed or tampered row must never be able to point a broad write token at
 * another repository, branch, file, project, or site. Every write path, every
 * read-only preflight, and every rendered verification path checks these
 * constants first.
 *
 * The executor is scoped by change kind rather than by a single file. Each kind
 * declares exactly which files it may touch, so widening one kind can never
 * widen another, and a kind with no declared file can never reach a commit.
 */

import type { ExecutionResult } from "./source-change";

export const GOVERNED_REPO = "maxwest525/brittmove-829a7519";
export const GOVERNED_BRANCH = "main";
export const GOVERNED_PROJECT_ID = "3c0c30e5-798a-425c-b077-6d5e8cb04e5b";
export const GOVERNED_ORIGIN = "https://trumoveinc.com";

/** The service page data file: titles and H1s. The original governed target. */
export const GOVERNED_FILE = "src/pages/services/servicesData.ts";

/**
 * Public pages whose wording lives in their own component rather than in a data
 * file, and the component that renders each.
 *
 * Transcribed from the client application's router, not inferred from the URL:
 * `/saferweb` is `SafetyWebPage.tsx` and `/sms-policy` shares a component with
 * `/legal/sms`, neither of which a naming convention would predict.
 *
 * Deliberately absent, and each absence is a decision:
 *   - anything behind the staff gate or the portal, and every auth route. They
 *     are not public, so no search finding can name them.
 *   - every page the client's own DefaultSeo marks noindex — /showcase,
 *     /plan-variants, /live-walkthrough, /scanner, /dictate. The site has
 *     already said it does not want these found; editing their wording would
 *     act against that.
 *   - /services/:slug, /blog/:slug and /research/:slug. Their wording is a data
 *     record or a database row, and the first two already have their own kinds.
 */
export const GOVERNED_PAGE_SOURCES = {
  "/": "src/pages/Index.tsx",
  // The router declares /index as a second address for the same component. It
  // adds no file to the governed set, but leaving it out would mean a finding
  // that named it reported no lane while the identical finding on / reported
  // one.
  "/index": "src/pages/Index.tsx",
  "/why-trumove": "src/pages/WhyTruMovePage.tsx",
  "/saferweb": "src/pages/SafetyWebPage.tsx",
  "/carrier-approval": "src/pages/CarrierApprovalPage.tsx",
  "/inventory-builder": "src/pages/InventoryBuilderPage.tsx",
  "/route-planning": "src/pages/RoutePlanningPage.tsx",
  "/contact": "src/pages/ContactPage.tsx",
  "/franchise": "src/pages/FranchisePage.tsx",
  "/careers": "src/pages/CareersPage.tsx",
  "/services": "src/pages/ServicesPage.tsx",
  "/blog": "src/pages/blog/BlogIndexPage.tsx",
  "/research": "src/pages/research/ResearchIndexPage.tsx",
  "/resources/moving-cost-estimator": "src/pages/resources/MovingCostEstimatorPage.tsx",
  "/terms": "src/pages/legal/TermsPage.tsx",
  "/privacy": "src/pages/legal/PrivacyPage.tsx",
  "/sms-policy": "src/pages/legal/SmsPolicyPage.tsx",
  "/legal/sms": "src/pages/legal/SmsPolicyPage.tsx",
  "/compliance": "src/pages/legal/CompliancePage.tsx",
  "/accessibility": "src/pages/legal/AccessibilityPage.tsx",
} as const satisfies Record<string, string>;

/**
 * Every change kind the executor can write, and the exact files each may touch.
 * A kind is executable only while this map lists at least one file for it.
 */
export const GOVERNED_CHANGE_KINDS = {
  "service.title_h1": [GOVERNED_FILE],
  "page.metadata": ["src/components/seo/SeoHead.tsx", "src/components/seo/DefaultSeo.tsx"],
  "site.crawl_directives": ["public/robots.txt", "public/sitemap.xml"],
  "site.structured_data": ["src/platform/content/schema/index.ts"],
  "content.blog_post": ["src/pages/blog/posts.ts"],
  "page.wording": [...new Set(Object.values(GOVERNED_PAGE_SOURCES))],
} as const satisfies Record<string, readonly string[]>;

export type GovernedChangeKind = keyof typeof GOVERNED_CHANGE_KINDS;

/** Every file any governed kind may touch. */
export const GOVERNED_FILES: readonly string[] = Object.values(GOVERNED_CHANGE_KINDS).flat();

export function isGovernedChangeKind(value: unknown): value is GovernedChangeKind {
  return typeof value === "string" && value in GOVERNED_CHANGE_KINDS;
}

/** The change kind that owns a file, or null when no kind may write it. */
export function changeKindForFile(filePath: string | null | undefined): GovernedChangeKind | null {
  for (const [kind, files] of Object.entries(GOVERNED_CHANGE_KINDS)) {
    if (files.includes(filePath as never)) return kind as GovernedChangeKind;
  }
  return null;
}

export type GovernedTarget = {
  repo: string;
  branch: string;
  filePath: string;
  projectId: string;
  changeKind: GovernedChangeKind;
};

/**
 * The one repository, branch, and source project that may be touched, plus the
 * governed file set derived from the change kinds above. Used identically by
 * the read-only preflight and by execution, so a preflight can never prove
 * something a commit would not be allowed to write.
 */
export function checkSourceTarget(input: {
  repo: string | null;
  branch: string | null;
  filePath?: string | null;
  projectId?: string | null;
}): ExecutionResult<GovernedTarget> {
  if (input.repo !== GOVERNED_REPO || input.branch !== GOVERNED_BRANCH) {
    return {
      ok: false,
      reason: `Refused without writing: this executor is allowlisted to ${GOVERNED_REPO} on ${GOVERNED_BRANCH}. The stored change request points at ${input.repo ?? "no repository"} on ${input.branch ?? "no branch"}.`,
    };
  }
  const changeKind = changeKindForFile(input.filePath);
  if (!changeKind) {
    return {
      ok: false,
      reason: `Refused without writing: no governed change kind owns ${input.filePath ?? "no file"}. The executor may only write ${GOVERNED_FILES.join(", ")}.`,
    };
  }
  if (input.projectId !== GOVERNED_PROJECT_ID) {
    return {
      ok: false,
      reason: `Refused without writing: this executor is allowlisted to source project ${GOVERNED_PROJECT_ID}. The stored change request points at ${input.projectId ?? "no project"}.`,
    };
  }
  return {
    ok: true,
    value: {
      repo: GOVERNED_REPO,
      branch: GOVERNED_BRANCH,
      filePath: input.filePath as string,
      projectId: GOVERNED_PROJECT_ID,
      changeKind,
    },
  };
}

/** The public origin a rendered verification may read. */
export function checkTargetUrl(url: string | null): ExecutionResult<string> {
  let parsed: URL;
  try {
    parsed = new URL(url ?? "");
  } catch {
    return { ok: false, reason: `Refused: ${url ?? "no target URL"} is not a valid URL.` };
  }
  if (parsed.origin !== GOVERNED_ORIGIN) {
    return {
      ok: false,
      reason: `Refused: rendered verification is allowlisted to ${GOVERNED_ORIGIN}. This change request targets ${parsed.origin}.`,
    };
  }
  return { ok: true, value: parsed.toString() };
}
