import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { GlassCard, PageHeader } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — AOOS" },
      {
        name: "description",
        content: "Operator sign-in for the AOOS marketing operating system. Read access is open; actions require a role.",
      },
      { property: "og:title", content: "Sign in — AOOS" },
      { property: "og:description", content: "Operator sign-in for AOOS." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");

  const mutation = useMutation({
    mutationFn: async () => {
      const action =
        mode === "sign_in"
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: window.location.origin },
            });
      const { error } = await action;
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(mode === "sign_in" ? "Signed in" : "Account created");
      void navigate({ to: "/" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto max-w-md space-y-8">
      <PageHeader
        eyebrow="Access"
        title="Sign in"
        description="Browsing the registries is open. Approving, running, and syncing require an operator or admin role."
      />

      <GlassCard glow className="p-6">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Working" : mode === "sign_in" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")}
        >
          {mode === "sign_in" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </GlassCard>
    </div>
  );
}
