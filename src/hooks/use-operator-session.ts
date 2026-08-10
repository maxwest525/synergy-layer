import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

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
  const [state, setState] = useState<OperatorSession>({ ready: false, email: null, signedIn: false });

  useEffect(() => {
    let active = true;

    const apply = (email: string | null) => {
      if (active) setState({ ready: true, email, signedIn: email !== null });
    };

    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user.email ?? null));

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
