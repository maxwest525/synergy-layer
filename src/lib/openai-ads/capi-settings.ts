/** Client-safe shapes and schemas for the server-side conversions settings. */
import { z } from "zod";

import { OPENAI_ADS_ACTION_SOURCES, OPENAI_ADS_EVENT_TYPES } from "./capi-contract";

export const DELIVERY_MODES = ["disabled", "validate_only", "live"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const DELIVERY_MODE_LABEL: Record<DeliveryMode, string> = {
  disabled: "Not sending",
  validate_only: "Validation only",
  live: "Sending live conversions",
};

export type ConnectionView = {
  id: string;
  enabled: boolean;
  pixelId: string;
  sourceProject: string;
  canonicalOrigin: string;
  allowedOrigins: string[];
  deliveryMode: DeliveryMode;
  requestTimeoutMs: number;
  maxDeliveryAttempts: number;
  matchEmailSha256: boolean;
  matchExternalIdSha256: boolean;
  matchGeo: boolean;
  matchIpAddress: boolean;
  matchUserAgent: boolean;
  secretName: string;
  secretPresent: boolean;
  bridgeSecretName: string;
  bridgeSecretPresent: boolean;
  updatedAt: string;
};

export type EventRuleView = {
  id: string;
  eventType: string;
  customEventName: string | null;
  enabled: boolean;
  browserEnabled: boolean;
  capiEnabled: boolean;
  actionSource: string;
  successBoundary: string;
  dataShape: string;
};

export type DeliveryView = {
  id: string;
  eventType: string;
  customEventName: string | null;
  eventId: string;
  status: string;
  validateOnly: boolean;
  errorCategory: string | null;
  httpStatus: number | null;
  attemptCount: number;
  lastAttemptAt: string;
};

export type CapiSettingsState = {
  connection: ConnectionView | null;
  rules: EventRuleView[];
  deliveries: DeliveryView[];
  counts: { delivered: number; validated: number; failed: number; rejected: number };
  canEdit: boolean;
};

export const connectionUpdateSchema = z.object({
  enabled: z.boolean(),
  deliveryMode: z.enum(DELIVERY_MODES),
  canonicalOrigin: z.string().url().max(300),
  allowedOrigins: z.array(z.string().url().max(300)).max(20),
  requestTimeoutMs: z.number().int().min(1000).max(30000),
  maxDeliveryAttempts: z.number().int().min(1).max(5),
  matchEmailSha256: z.boolean(),
  matchExternalIdSha256: z.boolean(),
  matchGeo: z.boolean(),
  matchIpAddress: z.boolean(),
  matchUserAgent: z.boolean(),
});
export type ConnectionUpdateInput = z.infer<typeof connectionUpdateSchema>;

export const eventRuleUpdateSchema = z.object({
  eventType: z.enum(OPENAI_ADS_EVENT_TYPES),
  customEventName: z.string().min(1).max(64).nullable(),
  enabled: z.boolean(),
  browserEnabled: z.boolean(),
  capiEnabled: z.boolean(),
  actionSource: z.enum(OPENAI_ADS_ACTION_SOURCES),
  successBoundary: z.string().max(400),
});
export type EventRuleUpdateInput = z.infer<typeof eventRuleUpdateSchema>;

export function humanizeEventType(eventType: string, customName: string | null): string {
  if (eventType === "custom") return customName ?? "Custom event";
  return eventType.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
