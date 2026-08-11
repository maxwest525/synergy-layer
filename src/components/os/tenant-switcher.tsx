import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { useOperatorSession } from "@/hooks/use-operator-session";
import { getTenantContext, switchTenant } from "@/lib/tenant.functions";
import { cn } from "@/lib/utils";

/**
 * Client workspace switcher. The active workspace is stored on the operator
 * profile server-side, so every read and every run is scoped to the same
 * client no matter which surface starts the work.
 */
export function TenantSwitcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const session = useOperatorSession();

  const loadContext = useServerFn(getTenantContext);
  const switchFn = useServerFn(switchTenant);

  // The server function requires a bearer token; asking for it while signed
  // out throws "No authorization header provided" and blanks the shell.
  const { data, isLoading } = useQuery({
    queryKey: ["tenant-context"],
    queryFn: () => loadContext(),
    enabled: session.ready && session.signedIn,
    retry: false,
  });


  const mutation = useMutation({
    mutationFn: (tenantId: string) => switchFn({ data: { tenantId } }),
    onSuccess: async () => {
      setOpen(false);
      // Operator query keys are tenant agnostic, so merely invalidating would
      // let a cached previous-workspace result render instantly, and a request
      // already in flight could repopulate it afterwards. Cancel first, drop
      // the data, then reload for the newly active workspace.
      await queryClient.cancelQueries();
      queryClient.removeQueries();
      await router.invalidate();
      await queryClient.invalidateQueries();
    },
  });


  if (isLoading || !data || data.tenants.length === 0) return null;

  const active = data.tenants.find((tenant) => tenant.id === data.activeTenantId) ?? data.tenants[0]!;

  return (
    <div className="relative mb-4 px-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2 rounded-xl border border-border/70 bg-transparent px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/60 hover:bg-primary/5"
      >
        <Building2 aria-hidden className="size-4 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{active.name}</span>
          <span className="block truncate text-xs text-muted-foreground">Client workspace</span>
        </span>
        <ChevronsUpDown aria-hidden className="size-4 text-muted-foreground" />
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-border/70 bg-popover/95 p-1 shadow-lg backdrop-blur-xl"
        >
          {data.tenants.map((tenant) => {
            const selected = tenant.id === active.id;
            return (
              <li key={tenant.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={mutation.isPending}
                  onClick={() => (selected ? setOpen(false) : mutation.mutate(tenant.id))}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    selected ? "text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{tenant.name}</span>
                  {selected ? <Check aria-hidden className="size-4" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {mutation.isError ? (
        <p className="px-2 pt-2 text-xs text-destructive">Could not switch client workspace.</p>
      ) : null}
    </div>
  );
}
