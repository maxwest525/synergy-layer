UPDATE public.authorized_operators
SET role = 'admin', revoked_at = NULL, updated_at = now()
WHERE email_normalized = public.normalize_email('mike@trumoveinc.com');

INSERT INTO public.authorized_operators (email_normalized, role)
SELECT public.normalize_email('mike@trumoveinc.com'), 'admin'
WHERE NOT EXISTS (
  SELECT 1 FROM public.authorized_operators
  WHERE email_normalized = public.normalize_email('mike@trumoveinc.com')
);

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE public.normalize_email(u.email) = public.normalize_email('mike@trumoveinc.com')
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id
  AND public.normalize_email(u.email) = public.normalize_email('mike@trumoveinc.com')
  AND ur.role <> 'admin';