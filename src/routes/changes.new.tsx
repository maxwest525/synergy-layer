import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { GlassCard, PageHeader } from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateTitleH1Proposal } from "@/lib/title-h1-proposals.functions";

type ProposalMode = "gemini" | "deterministic_dev";

export const Route = createFileRoute("/changes/new")({
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "New title/H1 proposal — AOOS" },
      {
        name: "description",
        content: "Generate one operator-reviewed title and H1 proposal from required evidence.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewTitleH1ProposalPage,
});

function NewTitleH1ProposalPage() {
  const navigate = Route.useNavigate();
  const generate = useServerFn(generateTitleH1Proposal);
  const [targetUrl, setTargetUrl] = useState("");

  const mutation = useMutation({
    mutationFn: (mode: ProposalMode) =>
      generate({
        data: {
          targetUrl,
          idempotencyKey: crypto.randomUUID(),
          mode,
        },
      }),
    onSuccess: (result) => {
      toast.success(result.changed ? "Draft proposal generated." : "Existing draft opened.");
      void navigate({
        to: "/changes/$id",
        params: { id: result.changeRequest.id },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Title/H1 workflow"
        title="New title/H1 proposal"
        description="Gemini drafts wording only when you click Generate. Live page, exact-page GSC, and relevant tracked-competitor DataForSEO evidence are all required."
      />
      <GlassCard className="max-w-2xl p-5">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate("gemini");
          }}
        >
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Target URL</span>
            <Input
              type="url"
              required
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
              placeholder="https://trumoveinc.com/services/..."
            />
          </label>
          <p className="text-sm text-muted-foreground">
            Knowledge entries may guide the writing, but they are not evidence and an empty
            knowledge match does not block generation.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && mutation.variables === "gemini"
                ? "Generating…"
                : "Generate proposal"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("deterministic_dev")}
            >
              {mutation.isPending && mutation.variables === "deterministic_dev"
                ? "Generating dev draft…"
                : "Generate dev draft"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Gemini remains the default. Dev mode bypasses only Gemini wording generation;
            operator access, the live page, GSC, DataForSEO, source proof, review, and approval
            are still required.
          </p>
        </form>
      </GlassCard>
    </div>
  );
}
