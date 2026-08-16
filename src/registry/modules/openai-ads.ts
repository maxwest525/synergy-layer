import type { ModuleDefinition } from "../types";

/**
 * OpenAI Ads instrumentation monitoring. AOOS observes the events the
 * instrumented site reports over the bridge. It has no authenticated read
 * against an OpenAI Ads account, so no spend, bidding, or campaign capability
 * is registered here.
 */
export const definition: ModuleDefinition = {
  module: "openai-ads",
  capabilities: [
    {
      key: "openai.ads.instrumentation",
      name: "OpenAI Ads instrumentation monitor",
      kind: "connector",
      category: "Paid media",
      description:
        "Read-only monitor for the OpenAI Ads pixel on the instrumented site. Stores browser and server-side events posted over the AOOS bridge and reports pixel health, event coverage across the supported conversion events, source paths, shared event ids, ad click reference attribution, and delivery errors. No spend, CPC, ROAS, conversion value, or campaign data is available.",
      integrationState: "real",
      authKind: "shared_secret",
      operations: [
        {
          name: "events.ingest",
          description:
            "Accept events the instrumented site actually fired, verified with the shared bridge secret.",
          mutates: true,
        },
        {
          name: "events.read",
          description: "Read stored instrumentation evidence for the active tenant.",
          mutates: false,
        },
        {
          name: "events.coverage",
          description:
            "Derive active, available, and not applicable state per supported event from stored events only.",
          mutates: false,
        },
        {
          name: "events.validate",
          description:
            "Check a candidate event payload locally for shape, applicability, and duplicate ids. Emits nothing and contacts no provider.",
          mutates: false,
        },
      ],
      config: {
        pixelId: "LBETxzFzJR34e6FPPhzp6S",
        sourceProject: "TruMove Website Final",
        bridgeEndpoint: "/api/public/hooks/openai-ads-events",
        supportedEvents: [
          "page_viewed",
          "lead_created",
          "contents_viewed",
          "items_added",
          "checkout_started",
          "order_created",
          "registration_completed",
          "appointment_scheduled",
          "subscription_created",
          "trial_started",
        ],
        wiredEvents: ["page_viewed", "lead_created"],
        awaitingSuccessBoundary: ["appointment_scheduled", "order_created"],
        prohibited: ["spend_reads", "campaign_reads", "bid_writes", "audience_writes"],
      },
    },
    {
      key: "openai.ads.capi",
      name: "OpenAI Ads server-side events",
      kind: "connector",
      category: "Paid media",
      description:
        "Server-side conversions API path. AOOS reports its configuration state from server-side secret presence and from server-side events reported over the bridge. It does not hold or expose the conversions API key in the browser, and it does not perform a provider validate-only call because that contract has not been confirmed from authoritative documentation.",
      integrationState: "pending",
      authKind: "api_key",
      operations: [
        {
          name: "capi.status",
          description: "Report whether the server-side credential is configured and events arrive.",
          mutates: false,
        },
      ],
      config: {
        secretName: "OPENAI_ADS_CAPI_API_KEY",
        clientExposed: false,
        providerValidateOnly: "unconfirmed",
      },
    },
  ],
};
