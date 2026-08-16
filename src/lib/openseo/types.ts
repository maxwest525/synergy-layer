export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  description?: string;
  default?: unknown;
  [key: string]: unknown;
};

export type OpenSeoToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  [key: string]: unknown;
};

export type OpenSeoMcpTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: OpenSeoToolAnnotations;
};

export type OpenSeoToolMode = "free_read" | "metered_read" | "mutation" | "destructive";
export type OpenSeoToolCost = "free" | "metered" | "unknown";

export type OpenSeoToolClassification = {
  mode: OpenSeoToolMode;
  cost: OpenSeoToolCost;
  readOnly: boolean;
  destructive: boolean;
  requiresConfirmation: boolean;
};

export type OpenSeoServerInfo = {
  name: string;
  version: string;
  title?: string;
  description?: string;
  websiteUrl?: string;
};

export type OpenSeoDiscovery = {
  protocolVersion: string;
  serverInfo: OpenSeoServerInfo;
  instructions?: string;
  tools: OpenSeoMcpTool[];
};

export type OpenSeoCallResult = {
  content?: Array<Record<string, unknown>>;
  structuredContent?: unknown;
  isError?: boolean;
  [key: string]: unknown;
};
