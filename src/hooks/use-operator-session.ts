import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getInitialOperatorSession, resolveOperatorEmail } from "@/lib/operator-session-gate";

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

    const apply = (email: string | null) => {
      if (active) setState({ ready: true, email, signedIn: email !== null });
    };

    void resolveOperatorEmail(async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.user.email ?? null;
    }).then(apply);

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user.email ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}
