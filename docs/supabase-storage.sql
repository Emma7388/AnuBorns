-- Storage bucket + policies for product images.
-- WhatsApp suele descargar fotos como .jpg o .jpeg; ambas extensiones usan image/jpeg.
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

-- Remove the legacy policy that allowed clients to list every object.
drop policy if exists product_images_public_read on storage.objects;

-- Authenticated upload only under <auth.uid>/<product-id>/<file>.
drop policy if exists product_images_auth_insert on storage.objects;
create policy "product_images_auth_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

-- Storage returns object metadata after an upload. This SELECT policy only
-- exposes metadata from the authenticated user's own folder.
drop policy if exists product_images_auth_select_own on storage.objects;
create policy "product_images_auth_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'product-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Owner update/delete
drop policy if exists product_images_auth_update on storage.objects;
create policy "product_images_auth_update"
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
create policy "product_images_auth_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
