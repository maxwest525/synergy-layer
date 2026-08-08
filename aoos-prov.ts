import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const uid = "f5bc135a-b595-421e-96b5-5955767e286d";
const { data, error } = await db.rpc("provision_operator_from_allowlist", { _auth_user_id: uid });
console.log("provision:", data, error?.message ?? "");
const { data: roles } = await db.from("user_roles").select("role").eq("user_id", uid);
console.log("roles:", JSON.stringify(roles));
await db.from("activity_events").insert({
  actor_kind: "system", actor_id: uid, verb: "auth.provisioned",
  subject_kind: "user", subject_id: uid,
  summary: "Allowlist provisioning re-run after email verification; admin role granted.",
  payload: { reason: "initial attempt skipped: email not verified at signup", result: data } as never,
});
