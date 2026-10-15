-- Hotfix de la RPC atomica de checkout.
--
-- Corrige el error PostgreSQL 42601 provocado por combinar directamente
-- jsonb_to_recordset(...), WITH ORDINALITY y una lista de definicion de columnas.
-- Es idempotente: reemplaza solamente create_checkout_order_atomic(...),
-- restaura sus permisos y no modifica ordenes, productos ni reservas existentes.
--
-- Requisito: haber aplicado docs/supabase-product-stock-publications.sql.

begin;

create or replace function public.create_checkout_order_atomic(
  p_user_id uuid, p_status text, p_total_amount numeric, p_currency text,
  p_shipping_full_name text, p_shipping_address text, p_shipping_city text,
  p_shipping_phone text, p_shipping_requested boolean, p_shipping_cost numeric,
  p_shipping_status text, p_payment_status text, p_payment_detail text, p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  requested_count integer;
  distinct_count integer;
  mismatch_count integer;
  product_total numeric;
  product_currency text;
  product_currencies integer;
  created_order public.orders%rowtype;
  unavailable_ids text[];
begin
  if p_user_id is null or p_status is null or p_status <> all(array['pending','approved']::text[])
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50
     or p_total_amount is null or p_total_amount < 0
     or p_shipping_cost is null or p_shipping_cost < 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  begin
    select count(*), count(distinct product_id)
    into requested_count, distinct_count
    from jsonb_to_recordset(p_items) as requested(product_id uuid, qty integer);
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end;
  if requested_count <> distinct_count then
    return jsonb_build_object('ok', false, 'code', 'duplicate_products');
  end if;

  -- Bloqueo estable de todas las filas evita sobreventa en checkouts simultaneos.
  perform products.id
  from public.products as products
  join jsonb_to_recordset(p_items) as requested(product_id uuid, qty integer)
    on requested.product_id = products.id
  order by products.id
  for update of products;

  select array_agg(requested.product_id::text order by requested.product_id)
  into unavailable_ids
  from jsonb_to_recordset(p_items) as requested(product_id uuid, qty integer)
  left join public.products as products on products.id = requested.product_id
  where products.id is null or requested.qty < 1 or requested.qty > 100
     or products.stock < requested.qty
     or products.publication_status <> 'active'
     or (products.publication_type = 'monthly'
         and (products.publication_expires_at is null or products.publication_expires_at <= now()));
  if coalesce(array_length(unavailable_ids, 1), 0) > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'product_unavailable',
      'sold_product_ids', to_jsonb(unavailable_ids)
    );
  end if;

  select count(*) into mismatch_count
  from jsonb_to_recordset(p_items) as requested(
    product_id uuid, qty integer, unit_price numeric, currency text, provider_user_id uuid
  )
  join public.products as products on products.id = requested.product_id
  where products.price is distinct from requested.unit_price
     or upper(products.currency) is distinct from upper(requested.currency)
     or products.user_id is distinct from requested.provider_user_id
     or products.user_id = p_user_id;
  if mismatch_count > 0 then
    return jsonb_build_object('ok', false, 'code', 'products_changed');
  end if;

  select
    sum(products.price * requested.qty),
    count(distinct upper(products.currency)),
    min(upper(products.currency))
  into product_total, product_currencies, product_currency
  from jsonb_to_recordset(p_items) as requested(product_id uuid, qty integer)
  join public.products as products on products.id = requested.product_id;
  if product_currencies <> 1 or product_currency is distinct from upper(p_currency)
     or product_total + p_shipping_cost is distinct from p_total_amount then
    return jsonb_build_object('ok', false, 'code', 'products_changed');
  end if;

  insert into public.orders (
    user_id,status,total_amount,currency,shipping_full_name,shipping_address,
    shipping_city,shipping_phone,shipping_requested,shipping_cost,shipping_status,
    payment_status,payment_detail
  ) values (
    p_user_id,p_status,p_total_amount,upper(p_currency),nullif(btrim(p_shipping_full_name),''),
    nullif(btrim(p_shipping_address),''),nullif(btrim(p_shipping_city),''),
    nullif(btrim(p_shipping_phone),''),p_shipping_requested,p_shipping_cost,p_shipping_status,
    nullif(btrim(p_payment_status),''),nullif(btrim(p_payment_detail),'')
  ) returning * into created_order;

  insert into public.order_items (
    order_id,product_id,product_uuid,seller_user_id,name,qty,unit_price,unit,provider,image
  )
  select
    created_order.id,
    products.id::text,
    products.id,
    products.user_id,
    products.title,
    requested.qty,
    products.price,
    null,
    nullif(btrim(products.seller_name),''),
    nullif(btrim(products.image_url),'')
  from rows from (
    jsonb_to_recordset(p_items) as (
      product_id uuid, qty integer, unit_price numeric, currency text, provider_user_id uuid
    )
  ) with ordinality as requested(
    product_id, qty, unit_price, currency, provider_user_id, position
  )
  join public.products as products on products.id = requested.product_id
  order by requested.position;

  return jsonb_build_object('ok', true, 'order', to_jsonb(created_order));
end;
$$;

revoke all on function public.create_checkout_order_atomic(
  uuid,text,numeric,text,text,text,text,text,boolean,numeric,text,text,text,jsonb
) from public, anon, authenticated;

grant execute on function public.create_checkout_order_atomic(
  uuid,text,numeric,text,text,text,text,text,boolean,numeric,text,text,text,jsonb
) to service_role;

commit;

select pg_notify('pgrst', 'reload schema');

-- Esta consulta obliga a PostgreSQL a analizar la forma corregida sin crear datos.
with ordinality_syntax_smoke as (
  select count(*) as parsed_rows
  from rows from (
    jsonb_to_recordset('[]'::jsonb) as (
      product_id uuid, qty integer, unit_price numeric, currency text, provider_user_id uuid
    )
  ) with ordinality as requested(
    product_id, qty, unit_price, currency, provider_user_id, position
  )
)
select jsonb_build_object(
  'ordinality_syntax_ok', (select parsed_rows = 0 from ordinality_syntax_smoke),
  'rpc_existe', to_regprocedure(
    'public.create_checkout_order_atomic(uuid,text,numeric,text,text,text,text,text,boolean,numeric,text,text,text,jsonb)'
  ) is not null,
  'rpc_service_role_execute', has_function_privilege(
    'service_role',
    'public.create_checkout_order_atomic(uuid,text,numeric,text,text,text,text,text,boolean,numeric,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'rpc_authenticated_execute', has_function_privilege(
    'authenticated',
    'public.create_checkout_order_atomic(uuid,text,numeric,text,text,text,text,text,boolean,numeric,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'rpc_anon_execute', has_function_privilege(
    'anon',
    'public.create_checkout_order_atomic(uuid,text,numeric,text,text,text,text,text,boolean,numeric,text,text,text,jsonb)',
    'EXECUTE'
  )
) as checkout_ordinality_hotfix_audit;
