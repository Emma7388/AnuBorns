-- Endurecimiento incremental de Storage para fotos de perfil.
-- No elimina, mueve ni reescribe objetos existentes.
-- Ejecutar una sola vez en Supabase SQL Editor y conservar la auditoría final.

begin;

-- WhatsApp suele descargar fotos como .jpg o .jpeg. Ambas usan MIME image/jpeg.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatar',
  'avatar',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- El bucket público entrega URLs conocidas. Se retira cualquier lectura global
-- que permita enumerar fotos; cada usuario sólo lista sus propios objetos.
drop policy if exists avatar_public_read on storage.objects;
drop policy if exists "Public avatars are readable" on storage.objects;
-- Políticas históricas reemplazadas por las reglas canónicas de este archivo.
-- Se eliminan por nombre; no se alteran objetos ni políticas de otros buckets.
drop policy if exists "Authenticated users can update avatars" on storage.objects;
drop policy if exists avatar_insert_own_folder on storage.objects;
drop policy if exists avatar_select_own_folder on storage.objects;
drop policy if exists avatar_auth_insert on storage.objects;
create policy avatar_auth_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatar'
    -- Para `usuario/archivo.webp`, foldername contiene sólo `[usuario]`.
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

drop policy if exists avatar_auth_select_own on storage.objects;
create policy avatar_auth_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatar'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists avatar_auth_update on storage.objects;
create policy avatar_auth_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatar'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'avatar'
    and owner_id = (select auth.uid()::text)
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

drop policy if exists avatar_auth_delete on storage.objects;
create policy avatar_auth_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatar'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

commit;

select pg_notify('pgrst', 'reload schema');

select jsonb_build_object(
  'avatar_storage_hardening_audit', jsonb_build_object(
    'bucket', (
      select jsonb_build_object(
        'exists', true,
        'public', b.public,
        'file_size_limit', b.file_size_limit,
        'allowed_mime_types', b.allowed_mime_types
      )
      from storage.buckets b
      where b.id = 'avatar'
    ),
    'policies', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'name', p.policyname,
            'command', p.cmd,
            'roles', p.roles,
            'using', p.qual,
            'check', p.with_check
          )
          order by p.policyname
        ),
        '[]'::jsonb
      )
      from pg_policies p
      where p.schemaname = 'storage'
        and p.tablename = 'objects'
        and (
          p.policyname in (
            'avatar_auth_insert',
            'avatar_auth_select_own',
            'avatar_auth_update',
            'avatar_auth_delete'
          )
          or coalesce(p.qual, '') ilike '%avatar%'
          or coalesce(p.with_check, '') ilike '%avatar%'
        )
    ),
    'unexpected_policies', (
      select count(*)
      from pg_policies p
      where p.schemaname = 'storage'
        and p.tablename = 'objects'
        and (
          coalesce(p.qual, '') ilike '%avatar%'
          or coalesce(p.with_check, '') ilike '%avatar%'
        )
        and p.policyname not in (
          'avatar_auth_insert',
          'avatar_auth_select_own',
          'avatar_auth_update',
          'avatar_auth_delete'
        )
    ),
    'existing_objects', (
      select jsonb_build_object(
        'total', count(*),
        'unexpected_extension', count(*) filter (
          where lower(storage.extension(o.name)) not in ('jpg', 'jpeg', 'png', 'webp')
        ),
        'unexpected_path_depth', count(*) filter (
          where array_length(storage.foldername(o.name), 1) is distinct from 1
        )
      )
      from storage.objects o
      where o.bucket_id = 'avatar'
    )
  )
) as auditoria;
