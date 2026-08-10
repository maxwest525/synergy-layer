import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { syncRegistryDefinitions } from "@/registry/sync.server";

const client = createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
console.log(JSON.stringify(await syncRegistryDefinitions(client), null, 2));
