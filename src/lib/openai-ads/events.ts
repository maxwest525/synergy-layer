/**
 * Supported OpenAI Ads conversion event catalog for this tenant.
 *
 * An event is only "active" when this project has actually stored at least one
 * real event of that name. Everything else is "available" (recognised and
 * ingestible, but no confirmed success boundary is wired yet) or
 * "not_applicable" (the business has no such boundary at all).
 *
 * AOOS never activates an event on the strength of an assumption. A booking or
 * order event in particular must correspond to a real, observed success
 * boundary in the instrumented site, not to a form submit that might fail.
 */

export const OPENAI_ADS_SUPPORTED_EVENTS = [
  "page_viewed",
  "contents_viewed",
  "items_added",
  "checkout_started",
  "order_created",
  "lead_created",
  "registration_completed",
  "appointment_scheduled",
  "subscription_created",
  "trial_started",
] as const;

export type OpenAiAdsSupportedEvent = (typeof OPENAI_ADS_SUPPORTED_EVENTS)[number];

/** Applicability is a business fact about TruMove, decided by the operator, not inferred from traffic. */
export type EventApplicability = "expected" | "possible" | "not_applicable";

export type EventCatalogEntry = {
  name: OpenAiAdsSupportedEvent;
  label: string;
  description: string;
  applicability: EventApplicability;
  /** The exact real success boundary that must exist before this event may fire. */
  successBoundary: string;
  /** What is still unknown or missing, stated plainly. Empty when the boundary is confirmed. */
  boundaryEvidence: string;
};

export const OPENAI_ADS_EVENT_CATALOG: readonly EventCatalogEntry[] = [
  {
    name: "page_viewed",
    label: "Page viewed",
    description: "A page on the instrumented site was rendered to a visitor.",
    applicability: "expected",
    successBoundary: "The page finished rendering in the visitor's browser.",
    boundaryEvidence: "",
  },
  {
    name: "contents_viewed",
    label: "Contents viewed",
    description: "A visitor viewed a specific service or moving-guide page.",
    applicability: "possible",
    successBoundary: "A service or content detail page rendered, identified by its own path.",
    boundaryEvidence:
      "The instrumented site must declare which paths count as content detail views before this fires.",
  },
  {
    name: "items_added",
    label: "Items added",
    description: "A visitor added a priced item to a cart.",
    applicability: "not_applicable",
    successBoundary: "An item was added to a cart.",
    boundaryEvidence: "TruMove sells moving services through quotes, not a cart.",
  },
  {
    name: "checkout_started",
    label: "Checkout started",
    description: "A visitor began a checkout with a payable total.",
    applicability: "not_applicable",
    successBoundary: "A checkout session opened with a payable total.",
    boundaryEvidence: "No online checkout exists on the instrumented site.",
  },
  {
    name: "order_created",
    label: "Order created",
    description: "A move was booked and confirmed.",
    applicability: "possible",
    successBoundary:
      "A job reached a confirmed booked state, server side, after the customer accepted a quote.",
    boundaryEvidence:
      "The instrumented project exposes a job status vocabulary that includes a booked state, but AOOS could not read a booked job and the site does not yet report that transition over the bridge. Not wired until that server-side transition is reported.",
  },
  {
    name: "lead_created",
    label: "Lead created",
    description: "A quote or contact request was accepted by the site.",
    applicability: "expected",
    successBoundary: "The lead submission was accepted server side, not merely submitted.",
    boundaryEvidence: "",
  },
  {
    name: "registration_completed",
    label: "Registration completed",
    description: "A customer account was created.",
    applicability: "possible",
    successBoundary: "A customer account was created and confirmed server side.",
    boundaryEvidence:
      "AOOS has not confirmed a public customer registration flow on the instrumented site.",
  },
  {
    name: "appointment_scheduled",
    label: "Appointment scheduled",
    description: "A survey, walkthrough, or move date was scheduled.",
    applicability: "possible",
    successBoundary:
      "A scheduled date was written and confirmed server side, not a calendar form submit.",
    boundaryEvidence:
      "AOOS could not identify a confirmed scheduling boundary in the connected site flow. Available for ingestion, deliberately not wired.",
  },
  {
    name: "subscription_created",
    label: "Subscription created",
    description: "A recurring plan started.",
    applicability: "not_applicable",
    successBoundary: "A recurring billing subscription became active.",
    boundaryEvidence: "TruMove has no recurring subscription product.",
  },
  {
    name: "trial_started",
    label: "Trial started",
    description: "A free trial started.",
    applicability: "not_applicable",
    successBoundary: "A time-limited free trial became active.",
    boundaryEvidence: "TruMove has no trial product.",
  },
];

export type EventCoverageState = "active" | "available" | "not_applicable";

export type EventCoverageRow = EventCatalogEntry & {
  state: EventCoverageState;
  stateReason: string;
  total: number;
  browser: number;
  capi: number;
  lastAt: string | null;
};

type Counts = Record<
  string,
  { total: number; browser: number; capi: number; lastAt: string | null }
>;

export function isSupportedEvent(name: string): name is OpenAiAdsSupportedEvent {
  return (OPENAI_ADS_SUPPORTED_EVENTS as readonly string[]).includes(name);
}

/**
 * Coverage is derived only from stored events plus declared applicability.
 * An event with zero stored events is never reported as active.
 */
export function describeEventCoverage(counts: Counts): EventCoverageRow[] {
  return OPENAI_ADS_EVENT_CATALOG.map((entry) => {
    const bucket = counts[entry.name];
    const total = bucket?.total ?? 0;
    if (total > 0) {
      return {
        ...entry,
        state: "active" as const,
        stateReason: "This project has stored real events with this name.",
        total,
        browser: bucket?.browser ?? 0,
        capi: bucket?.capi ?? 0,
        lastAt: bucket?.lastAt ?? null,
      };
    }
    const state: EventCoverageState =
      entry.applicability === "not_applicable" ? "not_applicable" : "available";
    return {
      ...entry,
      state,
      stateReason:
        state === "not_applicable"
          ? entry.boundaryEvidence
          : entry.boundaryEvidence ||
            "Recognised and ready to ingest. No event of this name has reached this project yet.",
      total: 0,
      browser: 0,
      capi: 0,
      lastAt: null,
    };
  });
}

/** Event names that arrived but are not part of the supported catalog. */
export function unrecognizedEventNames(counts: Counts): string[] {
  return Object.keys(counts)
    .filter((name) => !isSupportedEvent(name))
    .sort();
}
