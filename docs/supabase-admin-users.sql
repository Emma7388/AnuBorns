-- Administradores internos para el panel /admin/usuarios.
-- Ejecutar en Supabase SQL editor y luego insertar tu user_id.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.admin_users enable row level security;

revoke all on public.admin_users from anon;
revoke all on public.admin_users from authenticated;

-- Reemplazá el UUID por tu auth.users.id.
-- insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-000000000000')
-- on conflict (user_id) do nothing;
