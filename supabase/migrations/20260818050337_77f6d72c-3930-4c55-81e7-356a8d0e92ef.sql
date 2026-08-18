create or replace function public.set_concern_ownership(
  p_concern_id uuid,
  p_owner_name text,
  p_target_date date
) returns public.essential_concerns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.essential_concerns;
  v_owner text;
begin
  select * into v_row from public.essential_concerns where id = p_concern_id;
  if not found then
    raise exception 'That concern is not visible to this account.';
  end if;
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_row.tenant_id and m.user_id = auth.uid()
  ) then
    raise exception 'That concern is not visible to this account.';
  end if;

  v_owner := nullif(btrim(coalesce(p_owner_name, '')), '');

  update public.essential_concerns
     set owner_name = v_owner,
         target_date = p_target_date,
         updated_at = now()
   where id = p_concern_id
   returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_concern_ownership(uuid, text, date) from public, anon;
grant execute on function public.set_concern_ownership(uuid, text, date) to authenticated, service_role;