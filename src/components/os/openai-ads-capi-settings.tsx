import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  DetailRow,
  EmptyState,
  GlassCard,
  MetricTile,
  StatePill,
  formatWhen,
} from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getOpenAiAdsCapiSettings,
  updateOpenAiAdsConnection,
  updateOpenAiAdsEventRule,
} from "@/lib/openai-ads-capi.functions";
import {
  DELIVERY_MODES,
  DELIVERY_MODE_LABEL,
  humanizeEventType,
  type ConnectionView,
  type DeliveryMode,
  type EventRuleView,
} from "@/lib/openai-ads/capi-settings";

const CAPI_SETTINGS_KEY = ["openai-ads", "capi-settings"] as const;

function statusTone(status: string) {
  if (status === "delivered" || status === "validated") return "positive" as const;
  if (status === "failed" || status === "rejected") return "danger" as const;
  return "neutral" as const;
}

function ConnectionCard({ connection, canEdit }: { connection: ConnectionView; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const save = useServerFn(updateOpenAiAdsConnection);
  const [form, setForm] = useState({
    enabled: connection.enabled,
    deliveryMode: connection.deliveryMode,
    canonicalOrigin: connection.canonicalOrigin,
    allowedOrigins: connection.allowedOrigins.join("\n"),
    requestTimeoutMs: connection.requestTimeoutMs,
    maxDeliveryAttempts: connection.maxDeliveryAttempts,
    matchEmailSha256: connection.matchEmailSha256,
    matchExternalIdSha256: connection.matchExternalIdSha256,
    matchGeo: connection.matchGeo,
    matchIpAddress: connection.matchIpAddress,
    matchUserAgent: connection.matchUserAgent,
  });

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          enabled: form.enabled,
          deliveryMode: form.deliveryMode,
          canonicalOrigin: form.canonicalOrigin.trim(),
          allowedOrigins: form.allowedOrigins
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          requestTimeoutMs: Number(form.requestTimeoutMs),
          maxDeliveryAttempts: Number(form.maxDeliveryAttempts),
          matchEmailSha256: form.matchEmailSha256,
          matchExternalIdSha256: form.matchExternalIdSha256,
          matchGeo: form.matchGeo,
          matchIpAddress: form.matchIpAddress,
          matchUserAgent: form.matchUserAgent,
        },
      }),
    onSuccess: () => {
      toast.success("Sending configuration saved");
      void queryClient.invalidateQueries({ queryKey: CAPI_SETTINGS_KEY });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save the configuration"),
  });

  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">This website</h3>
          <p className="text-sm text-muted-foreground">
            AOOS is the only system that sends server-side conversions for this pixel. The browser
            pixel stays on the website.
          </p>
        </div>
        <StatePill
          label={form.enabled ? DELIVERY_MODE_LABEL[form.deliveryMode] : "Not sending"}
          tone={form.enabled && form.deliveryMode === "live" ? "positive" : "warning"}
        />
      </div>

      <dl className="mt-4">
        <DetailRow label="Measurement pixel" value={connection.pixelId} />
        <DetailRow label="Source project" value={connection.sourceProject} />
        <DetailRow
          label="Provider credential"
          value={
            connection.secretPresent
              ? `Present on the server as ${connection.secretName}`
              : `Missing. Add ${connection.secretName} in Project Settings, Secrets.`
          }
        />
        <DetailRow
          label="Bridge secret"
          value={
            connection.bridgeSecretPresent
              ? `Present on the server as ${connection.bridgeSecretName}; the website must present the same value.`
              : `Missing. Add ${connection.bridgeSecretName} in Project Settings, Secrets, or the bridge refuses every call.`
          }
        />
        <DetailRow label="Last changed" value={formatWhen(connection.updatedAt)} />
      </dl>

      <div className="mt-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="capi-enabled">Send server-side conversions</Label>
          <Switch
            id="capi-enabled"
            checked={form.enabled}
            disabled={!canEdit}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
          />
        </div>

        <div className="space-y-2">
          <Label>Delivery mode</Label>
          <div className="flex flex-wrap gap-2">
            {DELIVERY_MODES.map((mode) => (
              <Button
                key={mode}
                type="button"
                variant="outline"
                size="sm"
                disabled={!canEdit}
                aria-pressed={form.deliveryMode === mode}
                className={
                  form.deliveryMode === mode ? "border-primary text-primary" : "text-foreground/80"
                }
                onClick={() => setForm((prev) => ({ ...prev, deliveryMode: mode as DeliveryMode }))}
              >
                {DELIVERY_MODE_LABEL[mode]}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="capi-origin">Canonical website address</Label>
            <Input
              id="capi-origin"
              value={form.canonicalOrigin}
              disabled={!canEdit}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, canonicalOrigin: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="capi-origins">Accepted website addresses, one per line</Label>
            <Textarea
              id="capi-origins"
              rows={4}
              value={form.allowedOrigins}
              disabled={!canEdit}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, allowedOrigins: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="capi-timeout">Give up after (milliseconds)</Label>
            <Input
              id="capi-timeout"
              type="number"
              min={1000}
              max={30000}
              value={form.requestTimeoutMs}
              disabled={!canEdit}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, requestTimeoutMs: Number(event.target.value) }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="capi-attempts">Attempts before failing</Label>
            <Input
              id="capi-attempts"
              type="number"
              min={1}
              max={5}
              value={form.maxDeliveryAttempts}
              disabled={!canEdit}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, maxDeliveryAttempts: Number(event.target.value) }))
              }
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">What may be sent for matching</p>
          <p className="text-sm text-muted-foreground">
            AOOS never accepts a raw email address, phone number, or plain customer id. Only values
            the website has already hashed can be sent.
          </p>
          {(
            [
              ["matchEmailSha256", "Hashed email address"],
              ["matchExternalIdSha256", "Hashed customer id"],
              ["matchGeo", "Country, city, and postal code"],
              ["matchIpAddress", "IP address"],
              ["matchUserAgent", "Browser user agent"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <Label htmlFor={`capi-${key}`}>{label}</Label>
              <Switch
                id={`capi-${key}`}
                checked={form[key]}
                disabled={!canEdit}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, [key]: checked }))}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={!canEdit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving" : "Save configuration"}
          </Button>
        </div>
        {!canEdit ? (
          <p className="text-sm text-muted-foreground">
            Only a workspace admin can change these settings.
          </p>
        ) : null}
      </div>
    </GlassCard>
  );
}

function EventRuleRow({ rule, canEdit }: { rule: EventRuleView; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const save = useServerFn(updateOpenAiAdsEventRule);
  const [draft, setDraft] = useState(rule);

  const mutation = useMutation({
    mutationFn: (next: EventRuleView) =>
      save({
        data: {
          eventType: next.eventType as never,
          customEventName: next.customEventName,
          enabled: next.enabled,
          browserEnabled: next.browserEnabled,
          capiEnabled: next.capiEnabled,
          actionSource: next.actionSource as never,
          successBoundary: next.successBoundary,
        },
      }),
    onSuccess: () => {
      toast.success("Conversion event saved");
      void queryClient.invalidateQueries({ queryKey: CAPI_SETTINGS_KEY });
    },
    onError: (error: unknown) => {
      setDraft(rule);
      toast.error(error instanceof Error ? error.message : "Could not save the event");
    },
  });

  const apply = (patch: Partial<EventRuleView>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    mutation.mutate(next);
  };

  return (
    <li className="border-b border-border/50 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {humanizeEventType(draft.eventType, draft.customEventName)}
          </p>
          <p className="text-xs text-muted-foreground">
            {draft.successBoundary || "No success definition recorded yet."}
          </p>
        </div>
        <StatePill
          label={draft.enabled ? "Counted" : "Not counted"}
          tone={draft.enabled ? "positive" : "neutral"}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-foreground/85">
          <Switch
            checked={draft.enabled}
            disabled={!canEdit || mutation.isPending}
            onCheckedChange={(checked) => apply({ enabled: checked })}
          />
          Count this conversion
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground/85">
          <Switch
            checked={draft.browserEnabled}
            disabled={!canEdit || mutation.isPending}
            onCheckedChange={(checked) => apply({ browserEnabled: checked })}
          />
          Browser pixel
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground/85">
          <Switch
            checked={draft.capiEnabled}
            disabled={!canEdit || mutation.isPending}
            onCheckedChange={(checked) => apply({ capiEnabled: checked })}
          />
          Server side from AOOS
        </label>
      </div>
    </li>
  );
}

/**
 * Operator control surface for server-side conversions: what is configured,
 * what is enabled, and what actually reached the provider.
 */
export function OpenAiAdsCapiSettings() {
  const load = useServerFn(getOpenAiAdsCapiSettings);
  const { data } = useSuspenseQuery({
    queryKey: CAPI_SETTINGS_KEY,
    queryFn: () => load({ data: undefined }),
  });

  if (!data.connection) {
    return (
      <EmptyState
        title="No server-side sending configured"
        description="This workspace has no OpenAI Ads pixel configuration yet, so AOOS sends nothing."
      />
    );
  }

  return (
    <div className="space-y-4">
      <ConnectionCard connection={data.connection} canEdit={data.canEdit} />

      <div className="grid gap-3 sm:grid-cols-4">
        <MetricTile label="Delivered" value={data.counts.delivered} />
        <MetricTile label="Validated" value={data.counts.validated} />
        <MetricTile label="Failed" value={data.counts.failed} />
        <MetricTile label="Refused" value={data.counts.rejected} />
      </div>

      <GlassCard className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Conversion events</h3>
        <p className="text-sm text-muted-foreground">
          Each conversion is off until someone turns it on and says what counts as success.
        </p>
        <ul className="mt-2">
          {data.rules.map((rule) => (
            <EventRuleRow key={rule.id} rule={rule} canEdit={data.canEdit} />
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Recent server-side deliveries</h3>
        {data.deliveries.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing has been sent server side yet. Nothing is estimated here.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {data.deliveries.map((delivery) => (
              <li key={delivery.id} className="border-b border-border/50 pb-3 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {humanizeEventType(delivery.eventType, delivery.customEventName)}
                  </p>
                  <StatePill label={delivery.status} tone={statusTone(delivery.status)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatWhen(delivery.lastAttemptAt)} · {delivery.attemptCount} attempt
                  {delivery.attemptCount === 1 ? "" : "s"}
                  {delivery.errorCategory ? ` · ${delivery.errorCategory.replace(/_/g, " ")}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
