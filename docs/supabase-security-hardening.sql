-- Security hardening for current Supabase linter warnings.
-- Safe to run from Supabase SQL Editor.

begin;

-- 1. Remove public execution from SECURITY DEFINER helper not used by frontend.
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

-- 2. Fix mutable search_path warnings on trigger helpers.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

commit;

-- 3. Manual follow-up for public buckets:
-- The linter warning means your public buckets can be listed, not just read by URL.
-- Review the avatar bucket policy separately if it is configured as public.
--
-- The product-images policy is removed by docs/supabase-storage.sql. Public
-- buckets can still serve known object URLs without a broad SELECT policy.
-- Remove this separately only if the avatar bucket is also public:
--
-- drop policy if exists "Public avatars are readable" on storage.objects;
--
-- Helpful inspection query:
-- select
--   p.policyname,
--   p.cmd,
--   p.qual,
--   p.with_check
-- from pg_policies p
-- where p.schemaname = 'storage'
--   and p.tablename = 'objects'
-- order by p.policyname;
--
-- 4. Leaked password protection:
-- Not available on the current Supabase plan.
