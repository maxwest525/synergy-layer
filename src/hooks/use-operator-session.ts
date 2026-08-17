import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getInitialOperatorSession } from "@/lib/operator-session-gate";

export type OperatorSession = {
  ready: boolean;
  email: string | null;
  signedIn: boolean;
};

/**
 * Client-side view of the operator session. The server decides what data an
 * operator may read; this only lets the shell tell the truth about whether
 * anyone is signed in, so an empty screen is never mistaken for empty data.
 */
export function useOperatorSession(): OperatorSession {
  const [state, setState] = useState<OperatorSession>(getInitialOperatorSession);

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;

    const apply = (email: string | null) => {
      if (active) setState({ ready: true, email, signedIn: email !== null });
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true;
      apply(session?.user.email ?? null);
    });

    // onAuthStateChange reliably reports future changes, but its initial event
    // can be delayed or skipped while the auth client is restoring a persisted
    // token. Read the current session explicitly so a cold workspace load never
    // remains behind the shell's "Checking operator session" gate.
    void supabase.auth.getSession().then(
      ({ data }) => {
        if (!receivedAuthEvent) apply(data.session?.user.email ?? null);
      },
      () => {
        if (!receivedAuthEvent) apply(null);
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}
