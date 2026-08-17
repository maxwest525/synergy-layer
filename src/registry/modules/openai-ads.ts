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
      name: "OpenAI Ads server-side conversions",
      kind: "connector",
      category: "Paid media",
      description:
        "AOOS is the single server-side sender of OpenAI Ads conversions for the instrumented site. The website reports a conversion over the authenticated hook; AOOS applies the tenant configuration, refuses raw identifiers, enforces the origin allowlist and the per event data shape, sends the conversion with the server-held credential, and stores a redacted delivery record keyed by event id so a retry can never become a second conversion. The browser measurement pixel stays on the website and is not sent from here.",
      integrationState: "real",
      authKind: "api_key",
      operations: [
        {
          name: "capi.status",
          description: "Report whether the server-side credential is configured and events arrive.",
          mutates: false,
        },
        {
          name: "capi.configure",
          description:
            "Read and change the tenant sending configuration and per event rules. Workspace admins only.",
          mutates: true,
        },
        {
          name: "capi.deliver",
          description:
            "Validate a reported conversion and send it to the provider once, with bounded retries on the same event id.",
          mutates: true,
        },
      ],
      config: {
        secretName: "OPENAI_ADS_CAPI_API_KEY",
        bridgeSecretName: "OPENAI_ADS_CAPI_BRIDGE_SECRET",
        conversionsEndpoint: "/api/public/hooks/openai-ads-conversions",
        clientExposed: false,
        contractVersion: 1,
        deliveryModes: ["disabled", "validate_only", "live"],
        acceptedIdentifiers: ["email_sha256", "external_id_sha256"],
        refusedIdentifiers: ["email", "phone", "phone_sha256", "external_id"],
      },
    },
  ],
};
