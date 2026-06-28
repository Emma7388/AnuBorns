-- Adds the new product categories and refreshes icon paths.
-- Safe to run multiple times in Supabase SQL editor.
insert into public.categories (name, slug, icon)
values
  ('Plomería', 'plomeria', '/icons/Plomeria.svg'),
  ('Cocina', 'cocina', '/icons/cocina.svg'),
  ('Cuidado personal', 'cuidado-personal', '/icons/cuidadopersonal.svg'),
  ('Deporte', 'deporte', '/icons/deporte.svg'),
  ('Dispositivos', 'dispositivos', '/icons/dispositivo.svg'),
  ('Mascotas', 'mascotas', '/icons/mascotas.svg'),
  ('Moda', 'moda', '/icons/moda.svg'),
  ('Vehículos', 'vehiculos', '/icons/vehiculos.svg')
on conflict (slug) do update
set name = excluded.name,
    icon = excluded.icon,
    updated_at = now();
