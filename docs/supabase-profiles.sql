-- Profiles table for private user profile data.
-- Run this in the Supabase SQL editor before deploying code that reads/writes profiles.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  dni text not null default '',
  address text not null default '',
  city text not null default '',
  province text not null default '',
  postal_code text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

alter table public.profiles enable row level security;

grant select, insert, update on public.profiles to authenticated;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
on public.profiles
for select
using (auth.uid() = user_id);

drop policy if exists "Profiles are insertable by owner" on public.profiles;
create policy "Profiles are insertable by owner"
on public.profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "Profiles are editable by owner" on public.profiles;
create policy "Profiles are editable by owner"
on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into public.profiles (
  user_id,
  first_name,
  last_name,
  phone,
  dni,
  address,
  city,
  province,
  postal_code
)
select
  id,
  coalesce(raw_user_meta_data->>'first_name', ''),
  coalesce(raw_user_meta_data->>'last_name', ''),
  coalesce(raw_user_meta_data->>'phone', ''),
  coalesce(raw_user_meta_data->>'dni', ''),
  coalesce(raw_user_meta_data->>'address', ''),
  coalesce(raw_user_meta_data->>'city', ''),
  coalesce(raw_user_meta_data->>'province', ''),
  coalesce(raw_user_meta_data->>'postal_code', '')
from auth.users
where raw_user_meta_data ?| array[
  'first_name',
  'last_name',
  'phone',
  'dni',
  'address',
  'city',
  'province',
  'postal_code'
]
on conflict (user_id) do update set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  phone = excluded.phone,
  dni = excluded.dni,
  address = excluded.address,
  city = excluded.city,
  province = excluded.province,
  postal_code = excluded.postal_code,
  updated_at = now();
