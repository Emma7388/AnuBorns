-- Storage bucket + policies for product images
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update
set public = true;

-- Public read
drop policy if exists product_images_public_read on storage.objects;
create policy "product_images_public_read"
  on storage.objects
  for select
  using (bucket_id = 'product-images');

-- Authenticated upload
drop policy if exists product_images_auth_insert on storage.objects;
create policy "product_images_auth_insert"
  on storage.objects
  for insert
  with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

-- Owner update/delete
drop policy if exists product_images_auth_update on storage.objects;
create policy "product_images_auth_update"
  on storage.objects
  for update
  using (bucket_id = 'product-images' and auth.uid() = owner);

drop policy if exists product_images_auth_delete on storage.objects;
create policy "product_images_auth_delete"
  on storage.objects
  for delete
  using (bucket_id = 'product-images' and auth.uid() = owner);
