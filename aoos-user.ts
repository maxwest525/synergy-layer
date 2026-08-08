import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data, error } = await db.auth.admin.listUsers();
if (error) throw error;
console.log(JSON.stringify(data.users.map(u => ({ id:u.id, email:u.email, email_confirmed_at:u.email_confirmed_at, providers:u.app_metadata?.providers, verified:u.user_metadata?.email_verified, last:u.last_sign_in_at })), null, 2));
