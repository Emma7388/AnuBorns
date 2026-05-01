-- Servicios de usuario (snapshot simple por usuario).
-- Ejecutar en Supabase SQL editor.

create table if not exists public.user_services (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active jsonb,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.user_services_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_services_set_updated_at on public.user_services;
create trigger user_services_set_updated_at
before update on public.user_services
for each row execute function public.user_services_set_updated_at();

alter table public.user_services enable row level security;

drop policy if exists user_services_select_own on public.user_services;
create policy "user_services_select_own"
  on public.user_services
  for select
  using (auth.uid() = user_id);

drop policy if exists user_services_insert_own on public.user_services;
create policy "user_services_insert_own"
  on public.user_services
  for insert
  with check (auth.uid() = user_id);

drop policy if exists user_services_update_own on public.user_services;
create policy "user_services_update_own"
  on public.user_services
  for update
  using (auth.uid() = user_id);
