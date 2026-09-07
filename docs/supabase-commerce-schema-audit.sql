-- Auditoría de estructura de compras, ventas y entregas.
-- Sólo lectura: no cambia datos, tablas, índices ni políticas.

with target_tables as (
  select unnest(array[
    'products',
    'orders',
    'order_items',
    'sale_dispatches',
    'purchase_status_reads'
  ]) as table_name
), table_state as (
  select
    targets.table_name,
    coalesce(c.relkind = 'r', false) as exists,
    coalesce(c.relrowsecurity, false) as rls_enabled,
    coalesce(c.relforcerowsecurity, false) as rls_forced
  from target_tables targets
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c on c.relnamespace = n.oid and c.relname = targets.table_name
), columns_state as (
  select
    table_name,
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (select table_name from target_tables)
), policies_state as (
  select
    tablename,
    policyname,
    roles,
    cmd,
    qual,
    with_check
  from pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from target_tables)
), constraints_state as (
  select
    table_name,
    constraint_name,
    constraint_type
  from information_schema.table_constraints
  where table_schema = 'public'
    and table_name in (select table_name from target_tables)
), indexes_state as (
  select
    tablename,
    indexname,
    indexdef
  from pg_indexes
  where schemaname = 'public'
    and tablename in (select table_name from target_tables)
)
select jsonb_build_object(
  'tables', (select coalesce(jsonb_agg(to_jsonb(table_state) order by table_name), '[]'::jsonb) from table_state),
  'columns', (select coalesce(jsonb_agg(to_jsonb(columns_state) order by table_name, ordinal_position), '[]'::jsonb) from (
    select columns_state.*, ordinal_position
    from columns_state
    join information_schema.columns positions
      using (table_name, column_name)
    where positions.table_schema = 'public'
  ) columns_state),
  'policies', (select coalesce(jsonb_agg(to_jsonb(policies_state) order by tablename, policyname), '[]'::jsonb) from policies_state),
  'constraints', (select coalesce(jsonb_agg(to_jsonb(constraints_state) order by table_name, constraint_name), '[]'::jsonb) from constraints_state),
  'indexes', (select coalesce(jsonb_agg(to_jsonb(indexes_state) order by tablename, indexname), '[]'::jsonb) from indexes_state)
) as auditoria;
