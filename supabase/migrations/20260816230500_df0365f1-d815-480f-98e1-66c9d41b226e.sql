insert into public.authorized_operators (email_normalized, role, note)
values (public.normalize_email('mike@trumoveinc.com'), 'operator', 'Granted by admin request')
on conflict (email_normalized) do update
  set role = excluded.role, revoked_at = null, updated_at = now();

insert into public.user_roles (user_id, role)
select u.id, 'operator'::public.app_role
from auth.users u
where lower(u.email) = 'mike@trumoveinc.com'
on conflict (user_id, role) do nothing;