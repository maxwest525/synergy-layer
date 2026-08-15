import { auth, defineMcp } from "@lovable.dev/mcp-js";

import getRecommendation from "./tools/get-recommendation";
import listAssets from "./tools/list-assets";
import listCapabilities from "./tools/list-capabilities";
import listInbox from "./tools/list-inbox";
import listRecommendations from "./tools/list-recommendations";
import listWorkflowRuns from "./tools/list-workflow-runs";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "aoos-marketing-os",
  title: "AOOS Marketing OS",
  version: "0.1.0",
  instructions:
    "Read access to the AOOS marketing operating system. Use list_inbox for what needs attention, list_recommendations and get_recommendation for evidence backed proposals, list_workflow_runs for automation health, list_capabilities for connector state, and list_assets for the marketing asset registry. These tools observe only; approving or running anything happens inside AOOS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  // Cast: the SDK's tool type requires outputSchema under exactOptionalPropertyTypes.
  tools: [
    listInbox,
    listRecommendations,
    getRecommendation,
    listWorkflowRuns,
    listCapabilities,
    listAssets,
  ] as never,
});
