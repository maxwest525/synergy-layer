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
        "Read-only monitor for the OpenAI Ads pixel on the instrumented site. Stores browser and server-side events posted over the AOOS bridge and reports pixel health, event counts, source paths, shared event ids, and delivery errors. No spend, CPC, ROAS, conversion value, or campaign data is available.",
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
      ],
      config: {
        pixelId: "LBETxzFzJR34e6FPPhzp6S",
        sourceProject: "TruMove Website Final",
        bridgeEndpoint: "/api/public/hooks/openai-ads-events",
        prohibited: ["spend_reads", "campaign_reads", "bid_writes", "audience_writes"],
      },
    },
    {
      key: "openai.ads.capi",
      name: "OpenAI Ads server-side events",
      kind: "connector",
      category: "Paid media",
      description:
        "Server-side conversions API path. AOOS reports its configuration state from server-side secret presence and from server-side events reported over the bridge. It does not hold or expose the conversions API key in the browser.",
      integrationState: "pending",
      authKind: "api_key",
      operations: [
        {
          name: "capi.status",
          description: "Report whether the server-side credential is configured and events arrive.",
          mutates: false,
        },
      ],
      config: { secretName: "OPENAI_ADS_CAPI_KEY", clientExposed: false },
    },
  ],
};
