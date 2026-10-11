-- Sincroniza nombres históricos de public.profiles hacia la metadata visual de Auth.
-- No cambia email, contraseña, proveedores, confirmaciones ni auth.users.phone.
-- Conserva cualquier metadata existente, incluido avatar_url.

with profile_names as (
  select
    profiles.user_id,
    btrim(profiles.first_name) as first_name,
    btrim(profiles.last_name) as last_name,
    concat_ws(
      ' ',
      nullif(btrim(profiles.first_name), ''),
      nullif(btrim(profiles.last_name), '')
    ) as full_name
  from public.profiles
  where nullif(btrim(profiles.first_name), '') is not null
     or nullif(btrim(profiles.last_name), '') is not null
), updated as (
  update auth.users as users
  set raw_user_meta_data = coalesce(users.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'first_name', profile_names.first_name,
      'last_name', profile_names.last_name,
      'full_name', profile_names.full_name,
      'display_name', profile_names.full_name
    )
  from profile_names
  where users.id = profile_names.user_id
    and (
      coalesce(users.raw_user_meta_data->>'first_name', '') is distinct from profile_names.first_name
      or coalesce(users.raw_user_meta_data->>'last_name', '') is distinct from profile_names.last_name
      or coalesce(users.raw_user_meta_data->>'full_name', '') is distinct from profile_names.full_name
      or coalesce(users.raw_user_meta_data->>'display_name', '') is distinct from profile_names.full_name
    )
  returning users.id
)
select count(*) as usuarios_auth_actualizados
from updated;

-- Verificación conjunta. `telefono_contacto` pertenece al perfil de AnuBorns;
-- `telefono_auth` sólo se completa si se usa autenticación telefónica.
select
  users.id,
  users.email,
  users.raw_user_meta_data->>'display_name' as display_name,
  profiles.phone as telefono_contacto,
  users.phone as telefono_auth
from auth.users as users
left join public.profiles as profiles on profiles.user_id = users.id
order by users.created_at desc;
