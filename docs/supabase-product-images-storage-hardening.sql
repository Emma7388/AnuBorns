-- Endurecimiento incremental de Storage para imágenes de productos.
-- No elimina, mueve ni reescribe objetos existentes.
-- Ejecutar una sola vez en Supabase SQL Editor y conservar la auditoría final.

begin;

-- WhatsApp suele descargar fotos como .jpg o .jpeg. Ambas usan MIME image/jpeg.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  20 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- El bucket público entrega URLs conocidas. Se retira la política SELECT global
-- para que nadie pueda enumerar todos los objetos.
drop policy if exists product_images_public_read on storage.objects;

drop policy if exists product_images_auth_insert on storage.objects;
create policy product_images_auth_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

-- Storage devuelve metadata después del INSERT. Esta lectura queda limitada a
-- objetos propios y no permite enumerar las carpetas de otros usuarios.
drop policy if exists product_images_auth_select_own on storage.objects;
create policy product_images_auth_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'product-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists product_images_auth_update on storage.objects;
create policy product_images_auth_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'product-images'
    and owner_id = (select auth.uid()::text)
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

drop policy if exists product_images_auth_delete on storage.objects;
create policy product_images_auth_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

commit;

select pg_notify('pgrst', 'reload schema');

-- Auditoría posterior e independiente de la transacción.
select jsonb_build_object(
  'product_images_storage_hardening_audit', jsonb_build_object(
    'bucket', (
      select jsonb_build_object(
        'exists', true,
        'public', b.public,
        'file_size_limit', b.file_size_limit,
        'allowed_mime_types', b.allowed_mime_types
      )
      from storage.buckets b
      where b.id = 'product-images'
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
        and p.policyname in (
          'product_images_auth_insert',
          'product_images_auth_select_own',
          'product_images_auth_update',
          'product_images_auth_delete',
          'product_images_public_read'
        )
    ),
    'existing_objects', (
      select jsonb_build_object(
        'total', count(*),
        'unexpected_extension', count(*) filter (
          where lower(storage.extension(o.name)) not in ('jpg', 'jpeg', 'png', 'webp')
        ),
        'unexpected_path_depth', count(*) filter (
          where array_length(storage.foldername(o.name), 1) is distinct from 2
        )
      )
      from storage.objects o
      where o.bucket_id = 'product-images'
    )
  )
) as auditoria;
