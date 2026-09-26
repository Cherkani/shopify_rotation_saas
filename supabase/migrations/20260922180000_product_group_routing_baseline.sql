


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."process_shopify_order_v2"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text" DEFAULT NULL::"text", "p_route_click_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_event_id uuid;
  v_order_id uuid;
  v_safe_route_click_id uuid;
begin
  insert into public.webhook_events (shopify_event_id, store_id, topic, payload_hash, status, processed_at)
  values (p_event_id, p_store_id, 'orders/create', p_payload_hash, 'processed', now())
  on conflict (shopify_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('duplicate', true);
  end if;

  if p_route_click_id is not null then
    select id into v_safe_route_click_id
    from public.route_clicks
    where id = p_route_click_id and store_id = p_store_id;
  end if;

  insert into public.orders_log (
    store_id, shopify_order_id, shopify_event_id, total_price, currency,
    landing_site, financial_status, counted_in_rotation, route_click_id, revenue_status
  ) values (
    p_store_id, p_shopify_order_id, p_event_id, p_total_price, p_currency,
    p_landing_site, p_financial_status, false, v_safe_route_click_id, 'paid'
  )
  on conflict (store_id, shopify_order_id) do nothing
  returning id into v_order_id;

  if v_order_id is null then
    update public.webhook_events set status = 'duplicate', processed_at = now() where id = v_event_id;
    return jsonb_build_object('duplicate', true);
  end if;

  return jsonb_build_object('duplicate', false, 'order_id', v_order_id);
exception when others then
  update public.webhook_events set status = 'failed', error_message = sqlerrm where shopify_event_id = p_event_id;
  raise;
end;
$$;


ALTER FUNCTION "public"."process_shopify_order_v2"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_route_click_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_shopify_order_v7"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text" DEFAULT NULL::"text", "p_product_items" "jsonb" DEFAULT NULL::"jsonb", "p_route_click" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_event_id uuid;
  v_order_id uuid;
  v_click public.route_clicks%rowtype;
  v_state public.product_group_state%rowtype;
  v_current public.product_group_members%rowtype;
  v_next public.product_group_members%rowtype;
  v_group public.product_groups%rowtype;
  v_remaining integer;
  v_next_step integer;
  v_rotated boolean := false;
begin
  if p_financial_status not in ('paid', 'authorized') then raise exception 'Order status is not eligible'; end if;
  if p_product_items is not null and jsonb_typeof(p_product_items) <> 'array' then raise exception 'Product items must be an array'; end if;

  insert into public.webhook_events (shopify_event_id, store_id, topic, payload_hash, status, processed_at)
  values (p_event_id, p_store_id, 'orders/create', p_payload_hash, 'processed', now())
  on conflict (shopify_event_id) do nothing returning id into v_event_id;
  if v_event_id is null then
    if p_product_items is not null then
      update public.orders_log set product_items = p_product_items where store_id = p_store_id and shopify_order_id = p_shopify_order_id and product_items is null;
    end if;
    return jsonb_build_object('duplicate', true, 'rotated', false);
  end if;

  if nullif(trim(coalesce(p_route_click, '')), '') is not null then
    select * into v_click from public.route_clicks where rt_click = trim(p_route_click) and store_id = p_store_id limit 1;
  end if;

  insert into public.orders_log (store_id, shopify_order_id, shopify_event_id, total_price, currency, landing_site, financial_status, counted_in_rotation, route_click_id, product_items, product_group_id, product_group_member_store_product_id, store_product_id, attribution_status, revenue_status)
  values (p_store_id, p_shopify_order_id, p_event_id, p_total_price, p_currency, p_landing_site, p_financial_status, false, v_click.id, p_product_items, v_click.product_group_id, v_click.product_group_member_store_product_id, v_click.product_group_member_store_product_id, case when v_click.id is null then 'unattributed' else 'attributed' end, 'paid')
  on conflict (store_id, shopify_order_id) do nothing returning id into v_order_id;
  if v_order_id is null then update public.webhook_events set status = 'duplicate', processed_at = now() where id = v_event_id; return jsonb_build_object('duplicate', true, 'rotated', false); end if;

  if v_click.id is not null then
    select * into v_group from public.product_groups where id = v_click.product_group_id;
    insert into public.product_group_state (group_id) values (v_click.product_group_id) on conflict (group_id) do nothing;
    select * into v_state from public.product_group_state where group_id = v_click.product_group_id for update;
    if v_state.active_member_store_product_id = v_click.product_group_member_store_product_id and v_state.remaining_steps > 0 then
      update public.orders_log set counted_in_rotation = true where id = v_order_id;
      v_remaining := v_state.remaining_steps - 1;
      if v_remaining > 0 then
        update public.product_group_state set remaining_steps = v_remaining, updated_at = now() where group_id = v_click.product_group_id;
      else
        select * into v_current from public.product_group_members where group_id = v_click.product_group_id and store_product_id = v_click.product_group_member_store_product_id;
        select m.* into v_next from public.product_group_members m join public.store_products sp on sp.id = m.store_product_id join public.products p on p.id = sp.product_id join public.stores s on s.id = sp.store_id
        where m.group_id = v_click.product_group_id and m.enabled and sp.enabled and p.enabled and s.enabled and nullif(trim(coalesce(s.webhook_secret_ciphertext, '')), '') is not null
        order by case when m.sequence_position > v_current.sequence_position then 0 else 1 end, m.sequence_position limit 1;
        if v_next.store_product_id is null then
          update public.product_group_state set active_member_store_product_id = null, remaining_steps = 0, updated_at = now() where group_id = v_click.product_group_id;
        else
          v_next_step := case when v_group.step_mode = 'equal_step' then v_group.equal_step else v_next.step_count end;
          update public.product_group_state set active_member_group_id = v_click.product_group_id, active_member_store_product_id = v_next.store_product_id, remaining_steps = v_next_step, updated_at = now() where group_id = v_click.product_group_id;
          if v_next.store_product_id <> v_click.product_group_member_store_product_id then
            insert into public.rotation_events (from_store_id, to_store_id, group_id, reason, order_count)
            select old_sp.store_id, new_sp.store_id, v_click.product_group_id, 'product_group_sales_step', case when v_group.step_mode = 'equal_step' then v_group.equal_step else v_current.step_count end
            from public.store_products old_sp, public.store_products new_sp where old_sp.id = v_click.product_group_member_store_product_id and new_sp.id = v_next.store_product_id;
            v_rotated := true;
          end if;
        end if;
      end if;
    end if;
  end if;
  return jsonb_build_object('duplicate', false, 'order_id', v_order_id, 'rotated', v_rotated, 'attribution_status', case when v_click.id is null then 'unattributed' else 'attributed' end);
exception when others then
  update public.webhook_events set status = 'failed', error_message = sqlerrm where shopify_event_id = p_event_id;
  raise;
end;
$$;


ALTER FUNCTION "public"."process_shopify_order_v7"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_shopify_order_v8"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text" DEFAULT NULL::"text", "p_product_items" "jsonb" DEFAULT NULL::"jsonb", "p_route_click" "text" DEFAULT NULL::"text", "p_topic" "text" DEFAULT 'orders/create'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_event_id uuid;
  v_order_id uuid;
  v_click public.route_clicks%rowtype;
  v_listing public.store_products%rowtype;
  v_state public.product_group_state%rowtype;
  v_current public.product_group_members%rowtype;
  v_next public.product_group_members%rowtype;
  v_group public.product_groups%rowtype;
  v_remaining integer;
  v_next_step integer;
  v_rotated boolean := false;
  v_product_matches boolean := true;
begin
  if p_topic not in ('orders/create', 'orders/paid') then raise exception 'Unsupported Shopify order topic'; end if;
  if p_financial_status <> 'paid' then raise exception 'Order status is not paid'; end if;
  if p_product_items is not null and jsonb_typeof(p_product_items) <> 'array' then raise exception 'Product items must be an array'; end if;
  insert into public.webhook_events (shopify_event_id, store_id, topic, payload_hash, status, processed_at)
  values (p_event_id, p_store_id, p_topic, p_payload_hash, 'processed', now())
  on conflict (shopify_event_id) do nothing returning id into v_event_id;
  if v_event_id is null then
    if p_product_items is not null then update public.orders_log set product_items = p_product_items where store_id = p_store_id and shopify_order_id = p_shopify_order_id and product_items is null; end if;
    return jsonb_build_object('duplicate', true, 'rotated', false);
  end if;
  if nullif(trim(coalesce(p_route_click, '')), '') is not null then
    select * into v_click from public.route_clicks where rt_click = trim(p_route_click) and store_id = p_store_id limit 1;
  end if;
  if v_click.id is not null then
    select * into v_listing from public.store_products where id = v_click.product_group_member_store_product_id;
    if nullif(trim(coalesce(v_listing.shopify_product_id, '')), '') is not null then
      v_product_matches := p_product_items is not null and exists (select 1 from jsonb_array_elements(p_product_items) as item where item->>'productId' = v_listing.shopify_product_id);
    end if;
  end if;
  insert into public.orders_log (store_id, shopify_order_id, shopify_event_id, total_price, currency, landing_site, financial_status, counted_in_rotation, route_click_id, product_items, product_group_id, product_group_member_store_product_id, store_product_id, attribution_status, revenue_status)
  values (p_store_id, p_shopify_order_id, p_event_id, p_total_price, p_currency, p_landing_site, p_financial_status, false, v_click.id, p_product_items, v_click.product_group_id, v_click.product_group_member_store_product_id, v_click.product_group_member_store_product_id, case when v_click.id is null then 'unattributed' when not v_product_matches then 'review' else 'attributed' end, 'paid')
  on conflict (store_id, shopify_order_id) do nothing returning id into v_order_id;
  if v_order_id is null then update public.webhook_events set status = 'duplicate', processed_at = now() where id = v_event_id; return jsonb_build_object('duplicate', true, 'rotated', false); end if;
  if v_click.id is not null and v_product_matches then
    select * into v_group from public.product_groups where id = v_click.product_group_id;
    insert into public.product_group_state (group_id) values (v_click.product_group_id) on conflict (group_id) do nothing;
    select * into v_state from public.product_group_state where group_id = v_click.product_group_id for update;
    if v_state.active_member_store_product_id = v_click.product_group_member_store_product_id and v_state.remaining_steps > 0 then
      update public.orders_log set counted_in_rotation = true where id = v_order_id;
      v_remaining := v_state.remaining_steps - 1;
      if v_remaining > 0 then
        update public.product_group_state set remaining_steps = v_remaining, updated_at = now() where group_id = v_click.product_group_id;
      else
        select * into v_current from public.product_group_members where group_id = v_click.product_group_id and store_product_id = v_click.product_group_member_store_product_id;
        select m.* into v_next from public.product_group_members m join public.store_products sp on sp.id = m.store_product_id join public.products p on p.id = sp.product_id join public.stores s on s.id = sp.store_id
        where m.group_id = v_click.product_group_id and m.enabled and sp.enabled and p.enabled and s.enabled and nullif(trim(coalesce(s.webhook_secret_ciphertext, '')), '') is not null
        order by case when m.sequence_position > v_current.sequence_position then 0 else 1 end, m.sequence_position limit 1;
        if v_next.store_product_id is null then
          update public.product_group_state set active_member_store_product_id = null, remaining_steps = 0, updated_at = now() where group_id = v_click.product_group_id;
        else
          v_next_step := case when v_group.step_mode = 'equal_step' then v_group.equal_step else v_next.step_count end;
          update public.product_group_state set active_member_group_id = v_click.product_group_id, active_member_store_product_id = v_next.store_product_id, remaining_steps = v_next_step, updated_at = now() where group_id = v_click.product_group_id;
          if v_next.store_product_id <> v_click.product_group_member_store_product_id then
            insert into public.rotation_events (from_store_id, to_store_id, group_id, reason, order_count)
            select old_sp.store_id, new_sp.store_id, v_click.product_group_id, 'product_group_sales_step', case when v_group.step_mode = 'equal_step' then v_group.equal_step else v_current.step_count end
            from public.store_products old_sp, public.store_products new_sp where old_sp.id = v_click.product_group_member_store_product_id and new_sp.id = v_next.store_product_id;
            v_rotated := true;
          end if;
        end if;
      end if;
    end if;
  end if;
  return jsonb_build_object('duplicate', false, 'order_id', v_order_id, 'rotated', v_rotated, 'attribution_status', case when v_click.id is null then 'unattributed' when not v_product_matches then 'review' else 'attributed' end);
exception when others then
  update public.webhook_events set status = 'failed', error_message = sqlerrm where shopify_event_id = p_event_id;
  raise;
end;
$$;


ALTER FUNCTION "public"."process_shopify_order_v8"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_shopify_order_v9"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text" DEFAULT NULL::"text", "p_product_items" "jsonb" DEFAULT NULL::"jsonb", "p_route_click" "text" DEFAULT NULL::"text", "p_topic" "text" DEFAULT 'orders/create'::"text", "p_order_created_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_result jsonb;
  v_order_group_id uuid;
  v_before public.product_group_state%rowtype;
  v_after public.product_group_state%rowtype;
  v_before_member public.product_group_members%rowtype;
  v_after_member public.product_group_members%rowtype;
  v_group public.product_groups%rowtype;
  v_next_round integer;
  v_base_step integer;
begin
  if nullif(trim(coalesce(p_route_click, '')), '') is not null then
    select rc.product_group_id into v_order_group_id
    from public.route_clicks rc
    where rc.store_id = p_store_id and rc.rt_click = trim(p_route_click)
    limit 1;
  end if;

  if v_order_group_id is not null then
    select * into v_before from public.product_group_state where group_id = v_order_group_id;
    select * into v_before_member from public.product_group_members
    where group_id = v_order_group_id and store_product_id = v_before.active_member_store_product_id;
  end if;

  v_result := public.process_shopify_order_v9_fixed_round(
    p_event_id, p_store_id, p_shopify_order_id, p_total_price, p_currency,
    p_landing_site, p_financial_status, p_payload_hash, p_product_items,
    p_route_click, p_topic, p_order_created_at
  );

  if coalesce((v_result->>'rotated')::boolean, false) then
    select o.product_group_id into v_order_group_id
    from public.orders_log o
    where o.store_id = p_store_id and o.shopify_order_id = p_shopify_order_id;
    select * into v_after from public.product_group_state where group_id = v_order_group_id;

    -- No eligible next listing is a valid terminal state, not a progressive
    -- round. Leave the processor's remaining_steps = 0 untouched.
    if v_after.active_member_store_product_id is null then
      return v_result;
    end if;

    select * into v_after_member from public.product_group_members
    where group_id = v_order_group_id and store_product_id = v_after.active_member_store_product_id;
    select * into v_group from public.product_groups where id = v_order_group_id;
    if v_before_member.store_product_id is null or v_after_member.store_product_id is null then
      return v_result;
    end if;

    v_next_round := case
      when v_after_member.sequence_position <= v_before_member.sequence_position then v_before.rotation_round + 1
      else v_before.rotation_round
    end;
    v_base_step := case when v_group.step_mode = 'equal_step' then v_group.equal_step else v_after_member.step_count end;
    update public.product_group_state
    set rotation_round = v_next_round,
        remaining_steps = greatest(1, v_base_step * v_next_round),
        updated_at = now()
    where group_id = v_order_group_id;
  end if;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."process_shopify_order_v9"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text", "p_order_created_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_shopify_order_v9_fixed_round"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text" DEFAULT NULL::"text", "p_product_items" "jsonb" DEFAULT NULL::"jsonb", "p_route_click" "text" DEFAULT NULL::"text", "p_topic" "text" DEFAULT 'orders/create'::"text", "p_order_created_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_event_id uuid;
  v_order_id uuid;
  v_click public.route_clicks%rowtype;
  v_listing public.store_products%rowtype;
  v_state public.product_group_state%rowtype;
  v_current public.product_group_members%rowtype;
  v_next public.product_group_members%rowtype;
  v_group public.product_groups%rowtype;
  v_remaining integer;
  v_next_step integer;
  v_rotated boolean := false;
  v_product_matches boolean := true;
  v_order_created_at timestamptz := coalesce(p_order_created_at, now());
begin
  if p_topic not in ('orders/create', 'orders/paid') then raise exception 'Unsupported Shopify order topic'; end if;
  if p_financial_status <> 'paid' then raise exception 'Order status is not paid'; end if;
  if p_product_items is not null and jsonb_typeof(p_product_items) <> 'array' then raise exception 'Product items must be an array'; end if;

  insert into public.webhook_events (shopify_event_id, store_id, topic, payload_hash, status, processed_at)
  values (p_event_id, p_store_id, p_topic, p_payload_hash, 'processed', now())
  on conflict (shopify_event_id) do nothing returning id into v_event_id;
  if v_event_id is null then
    if p_product_items is not null then
      update public.orders_log set product_items = p_product_items
      where store_id = p_store_id and shopify_order_id = p_shopify_order_id and product_items is null;
    end if;
    return jsonb_build_object('duplicate', true, 'rotated', false);
  end if;

  if nullif(trim(coalesce(p_route_click, '')), '') is not null then
    select * into v_click from public.route_clicks
    where rt_click = trim(p_route_click) and store_id = p_store_id limit 1;
  end if;

  if v_click.id is null and p_product_items is not null then
    select rc.* into v_click
    from public.route_clicks rc
    join public.store_products sp on sp.id = rc.product_group_member_store_product_id
    join public.product_group_members gm on gm.group_id = rc.product_group_id
      and gm.store_product_id = rc.product_group_member_store_product_id and gm.enabled
    where rc.store_id = p_store_id
      and rc.created_at <= v_order_created_at
      and rc.created_at >= v_order_created_at - interval '1 hour'
      and nullif(trim(coalesce(sp.shopify_product_id, '')), '') is not null
      and exists (select 1 from jsonb_array_elements(p_product_items) as item where item->>'productId' = sp.shopify_product_id)
      and not exists (select 1 from public.orders_log existing where existing.route_click_id = rc.id)
    order by rc.created_at desc
    limit 1
    for update of rc skip locked;
  end if;

  if v_click.id is not null then
    select * into v_listing from public.store_products where id = v_click.product_group_member_store_product_id;
    if nullif(trim(coalesce(v_listing.shopify_product_id, '')), '') is not null then
      v_product_matches := p_product_items is not null and exists (
        select 1 from jsonb_array_elements(p_product_items) as item
        where item->>'productId' = v_listing.shopify_product_id
      );
    end if;
  end if;

  insert into public.orders_log (
    store_id, shopify_order_id, shopify_event_id, total_price, currency, landing_site,
    financial_status, counted_in_rotation, route_click_id, product_items, product_group_id,
    product_group_member_store_product_id, store_product_id, attribution_status, revenue_status
  ) values (
    p_store_id, p_shopify_order_id, p_event_id, p_total_price, p_currency, p_landing_site,
    p_financial_status, false, v_click.id, p_product_items, v_click.product_group_id,
    v_click.product_group_member_store_product_id, v_click.product_group_member_store_product_id,
    case when v_click.id is null then 'unattributed' when not v_product_matches then 'review' else 'attributed' end,
    'paid'
  ) on conflict (store_id, shopify_order_id) do nothing returning id into v_order_id;
  if v_order_id is null then
    update public.webhook_events set status = 'duplicate', processed_at = now() where id = v_event_id;
    return jsonb_build_object('duplicate', true, 'rotated', false);
  end if;

  if v_click.id is not null and v_product_matches then
    select * into v_group from public.product_groups where id = v_click.product_group_id;
    insert into public.product_group_state (group_id) values (v_click.product_group_id) on conflict (group_id) do nothing;
    select * into v_state from public.product_group_state where group_id = v_click.product_group_id for update;
    if v_state.active_member_store_product_id = v_click.product_group_member_store_product_id and v_state.remaining_steps > 0 then
      update public.orders_log set counted_in_rotation = true where id = v_order_id;
      v_remaining := v_state.remaining_steps - 1;
      if v_remaining > 0 then
        update public.product_group_state set remaining_steps = v_remaining, updated_at = now() where group_id = v_click.product_group_id;
      else
        select * into v_current from public.product_group_members
        where group_id = v_click.product_group_id and store_product_id = v_click.product_group_member_store_product_id;
        select m.* into v_next
        from public.product_group_members m
        join public.store_products sp on sp.id = m.store_product_id
        join public.products p on p.id = sp.product_id
        join public.stores s on s.id = sp.store_id
        where m.group_id = v_click.product_group_id and m.enabled and sp.enabled and p.enabled and s.enabled
          and nullif(trim(coalesce(s.webhook_secret_ciphertext, '')), '') is not null
        order by case when m.sequence_position > v_current.sequence_position then 0 else 1 end, m.sequence_position
        limit 1;
        if v_next.store_product_id is null then
          update public.product_group_state set active_member_store_product_id = null, remaining_steps = 0, updated_at = now()
          where group_id = v_click.product_group_id;
        else
          v_next_step := case when v_group.step_mode = 'equal_step' then v_group.equal_step else v_next.step_count end;
          update public.product_group_state set active_member_group_id = v_click.product_group_id,
            active_member_store_product_id = v_next.store_product_id, remaining_steps = v_next_step, updated_at = now()
          where group_id = v_click.product_group_id;
          if v_next.store_product_id <> v_click.product_group_member_store_product_id then
            insert into public.rotation_events (from_store_id, to_store_id, product_group_id, reason, order_count)
            select old_sp.store_id, new_sp.store_id, v_click.product_group_id, 'product_group_sales_step',
              case when v_group.step_mode = 'equal_step' then v_group.equal_step else v_current.step_count end
            from public.store_products old_sp, public.store_products new_sp
            where old_sp.id = v_click.product_group_member_store_product_id and new_sp.id = v_next.store_product_id;
            v_rotated := true;
          end if;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object('duplicate', false, 'order_id', v_order_id, 'rotated', v_rotated,
    'attribution_status', case when v_click.id is null then 'unattributed' when not v_product_matches then 'review' else 'attributed' end);
exception when others then
  update public.webhook_events set status = 'failed', error_message = sqlerrm where shopify_event_id = p_event_id;
  raise;
end;
$$;


ALTER FUNCTION "public"."process_shopify_order_v9_fixed_round"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text", "p_order_created_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_product_group_redirect"("p_group_slug" "text", "p_click_id" "uuid", "p_rt_click" "text", "p_source" "text" DEFAULT ''::"text", "p_campaign" "text" DEFAULT ''::"text", "p_medium" "text" DEFAULT ''::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_group public.product_groups%rowtype;
  v_state public.product_group_state%rowtype;
  v_member public.product_group_members%rowtype;
  v_listing public.store_products%rowtype;
  v_store public.stores%rowtype;
  v_step integer;
  v_date date;
  v_timezone text;
begin
  if nullif(trim(coalesce(p_group_slug, '')), '') is null or p_click_id is null or nullif(trim(coalesce(p_rt_click, '')), '') is null then
    raise exception 'A product group and click id are required';
  end if;
  select * into v_group from public.product_groups where slug = lower(trim(p_group_slug)) and enabled for update;
  if not found then raise exception 'No enabled product group matches this link'; end if;
  insert into public.product_group_state (group_id) values (v_group.id) on conflict (group_id) do nothing;
  select * into v_state from public.product_group_state where group_id = v_group.id for update;
  if v_state.active_member_store_product_id is not null and v_state.remaining_steps > 0 then
    select m.* into v_member from public.product_group_members m join public.store_products sp on sp.id = m.store_product_id join public.products p on p.id = sp.product_id join public.stores s on s.id = sp.store_id
    where m.group_id = v_group.id and m.store_product_id = v_state.active_member_store_product_id and m.enabled and sp.enabled and p.enabled and s.enabled and nullif(trim(coalesce(s.webhook_secret_ciphertext, '')), '') is not null;
  end if;
  if v_member.store_product_id is null then
    select m.* into v_member from public.product_group_members m join public.store_products sp on sp.id = m.store_product_id join public.products p on p.id = sp.product_id join public.stores s on s.id = sp.store_id
    where m.group_id = v_group.id and m.enabled and sp.enabled and p.enabled and s.enabled and nullif(trim(coalesce(s.webhook_secret_ciphertext, '')), '') is not null
    order by case when v_state.active_member_store_product_id is not null and m.sequence_position > coalesce((select sequence_position from public.product_group_members where group_id = v_group.id and store_product_id = v_state.active_member_store_product_id), 0) then 0 else 1 end, m.sequence_position limit 1;
    if not found then raise exception 'No eligible product is configured in this group'; end if;
    v_step := case when v_group.step_mode = 'equal_step' then v_group.equal_step else v_member.step_count end;
    update public.product_group_state set active_member_group_id = v_group.id, active_member_store_product_id = v_member.store_product_id, remaining_steps = v_step, updated_at = now() where group_id = v_group.id;
  end if;
  select sp.* into v_listing from public.store_products sp where sp.id = v_member.store_product_id;
  select * into v_store from public.stores where id = v_listing.store_id;
  select target_timezone into v_timezone from public.rotator_settings where id = true;
  v_date := (now() at time zone coalesce(v_timezone, 'UTC'))::date;
  insert into public.route_clicks (id, rt_click, store_id, product_group_id, product_group_member_store_product_id, product_id, source, campaign, medium)
  values (p_click_id, p_rt_click, v_store.id, v_group.id, v_member.store_product_id, v_listing.product_id, left(coalesce(p_source, ''), 120), left(coalesce(p_campaign, ''), 200), left(coalesce(p_medium, ''), 120));
  insert into public.redirect_metrics (store_id, metric_date, source, campaign, medium, click_count)
  values (v_store.id, v_date, left(coalesce(p_source, ''), 120), left(coalesce(p_campaign, ''), 200), left(coalesce(p_medium, ''), 120), 1)
  on conflict (store_id, metric_date, source, campaign, medium) do update set click_count = public.redirect_metrics.click_count + 1;
  return jsonb_build_object('id', v_store.id, 'store_name', v_store.name, 'shop_domain', v_store.shop_domain, 'product_id', v_listing.product_id, 'store_product_id', v_listing.id, 'product_name', (select name from public.products where id = v_listing.product_id), 'product_url', v_listing.product_url, 'group_id', v_group.id, 'group_name', v_group.name, 'group_slug', v_group.slug, 'rt_click', p_rt_click, 'sales_remaining', (select remaining_steps from public.product_group_state where group_id = v_group.id));
end;
$$;


ALTER FUNCTION "public"."record_product_group_redirect"("p_group_slug" "text", "p_click_id" "uuid", "p_rt_click" "text", "p_source" "text", "p_campaign" "text", "p_medium" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_target_redirect"("p_click_id" "uuid", "p_source" "text" DEFAULT ''::"text", "p_campaign" "text" DEFAULT ''::"text", "p_medium" "text" DEFAULT ''::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_store public.stores%rowtype;
  v_mode text;
  v_target_timezone text;
  v_target_date date;
  v_period_start timestamptz;
begin
  select allocation_mode, target_timezone into v_mode, v_target_timezone
  from public.rotator_settings
  where id = true;
  v_mode := coalesce(v_mode, 'target_balance');
  v_target_timezone := coalesce(v_target_timezone, 'UTC');
  v_target_date := (now() at time zone v_target_timezone)::date;
  v_period_start := v_target_date::timestamp at time zone v_target_timezone;

  with daily_revenue as (
    select store_id, coalesce(sum(total_price) filter (where revenue_status = 'paid'), 0) as revenue
    from public.orders_log
    where created_at >= v_period_start
    group by store_id
  ), daily_clicks as (
    select store_id, coalesce(sum(click_count), 0) as clicks
    from public.redirect_metrics
    where metric_date = v_target_date
    group by store_id
  ), eligible as (
    select s.*, coalesce(r.revenue, 0) as revenue, coalesce(c.clicks, 0) as clicks,
      case
        when s.daily_revenue_target <= 0 then s.traffic_weight
        else greatest(s.daily_revenue_target - coalesce(r.revenue, 0), 0) / s.daily_revenue_target * s.traffic_weight
      end as target_score
    from public.stores s
    left join daily_revenue r on r.store_id = s.id
    left join daily_clicks c on c.store_id = s.id
    where s.enabled
      and s.accepting_traffic
      and s.health_status = 'healthy'
      and (s.daily_revenue_cap is null or coalesce(r.revenue, 0) < s.daily_revenue_cap)
      and (not s.pause_at_target or s.daily_revenue_target = 0 or coalesce(r.revenue, 0) < s.daily_revenue_target)
  )
  select id, name, shop_domain, checkout_url, rotation_position, current_order_count,
         enabled, webhook_secret_slot, daily_revenue_target, daily_revenue_cap,
         pause_at_target, traffic_weight, accepting_traffic, health_status
  into v_store
  from eligible
  order by
    case when v_mode = 'equal_rotation' then clicks end asc,
    case when v_mode = 'weighted' then traffic_weight end desc,
    case when v_mode = 'target_balance' then target_score end desc,
    rotation_position asc
  limit 1;

  if not found then
    raise exception 'No eligible store is configured';
  end if;

  insert into public.route_clicks (id, store_id, source, campaign, medium)
  values (
    p_click_id,
    v_store.id,
    left(coalesce(p_source, ''), 120),
    left(coalesce(p_campaign, ''), 200),
    left(coalesce(p_medium, ''), 120)
  );

  insert into public.redirect_metrics (store_id, metric_date, source, campaign, medium, click_count)
  values (v_store.id, v_target_date, left(coalesce(p_source, ''), 120), left(coalesce(p_campaign, ''), 200), left(coalesce(p_medium, ''), 120), 1)
  on conflict (store_id, metric_date, source, campaign, medium)
  do update set click_count = public.redirect_metrics.click_count + 1;

  return jsonb_build_object(
    'id', v_store.id,
    'name', v_store.name,
    'checkout_url', v_store.checkout_url,
    'shop_domain', v_store.shop_domain,
    'daily_revenue_target', v_store.daily_revenue_target
  );
end;
$$;


ALTER FUNCTION "public"."record_target_redirect"("p_click_id" "uuid", "p_source" "text", "p_campaign" "text", "p_medium" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_target_redirect"("p_click_id" "uuid", "p_source" "text", "p_campaign" "text", "p_medium" "text") IS 'Selects an eligible destination from independent daily revenue targets and records an opaque click.';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_profiles" (
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "password_hash" "text" NOT NULL,
    CONSTRAINT "admin_profiles_email_check" CHECK (("email" = "lower"("email"))),
    CONSTRAINT "admin_profiles_role_check" CHECK (("role" = 'admin'::"text"))
);


ALTER TABLE "public"."admin_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_profiles" IS 'Administrator allowlist. Never use a shared or documented default credential.';



COMMENT ON COLUMN "public"."admin_profiles"."password_hash" IS 'Salted scrypt password hash. Never store or return plaintext passwords.';



CREATE TABLE IF NOT EXISTS "public"."orders_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "shopify_order_id" "text" NOT NULL,
    "shopify_event_id" "text" NOT NULL,
    "total_price" numeric(12,2),
    "currency" "text",
    "landing_site" "text",
    "financial_status" "text" NOT NULL,
    "counted_in_rotation" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "route_click_id" "uuid",
    "revenue_status" "text" DEFAULT 'paid'::"text" NOT NULL,
    "product_items" "jsonb",
    "product_group_id" "uuid",
    "product_group_member_store_product_id" "uuid",
    "store_product_id" "uuid",
    "attribution_status" "text" DEFAULT 'unattributed'::"text" NOT NULL,
    CONSTRAINT "orders_log_attribution_status_check" CHECK (("attribution_status" = ANY (ARRAY['attributed'::"text", 'unattributed'::"text", 'review'::"text"]))),
    CONSTRAINT "orders_log_revenue_status_check" CHECK (("revenue_status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'refunded'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "orders_product_items_array" CHECK ((("product_items" IS NULL) OR ("jsonb_typeof"("product_items") = 'array'::"text")))
);


ALTER TABLE "public"."orders_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_group_members" (
    "group_id" "uuid" NOT NULL,
    "store_product_id" "uuid" NOT NULL,
    "sequence_position" integer NOT NULL,
    "step_count" integer DEFAULT 1 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_group_members_sequence_position_check" CHECK (("sequence_position" > 0)),
    CONSTRAINT "product_group_members_step_count_check" CHECK ((("step_count" >= 1) AND ("step_count" <= 1000000)))
);


ALTER TABLE "public"."product_group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_group_state" (
    "group_id" "uuid" NOT NULL,
    "active_member_group_id" "uuid",
    "active_member_store_product_id" "uuid",
    "remaining_steps" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rotation_round" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "product_group_state_remaining_steps_check" CHECK (("remaining_steps" >= 0)),
    CONSTRAINT "product_group_state_rotation_round_check" CHECK (("rotation_round" >= 1))
);


ALTER TABLE "public"."product_group_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "step_mode" "text" DEFAULT 'equal_step'::"text" NOT NULL,
    "equal_step" integer DEFAULT 1 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_groups_equal_step_check" CHECK ((("equal_step" >= 1) AND ("equal_step" <= 1000000))),
    CONSTRAINT "product_groups_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 100))),
    CONSTRAINT "product_groups_slug_check" CHECK (("slug" ~ '^[a-z0-9][a-z0-9-]{0,63}$'::"text")),
    CONSTRAINT "product_groups_step_mode_check" CHECK (("step_mode" = ANY (ARRAY['equal_step'::"text", 'custom_step'::"text"])))
);


ALTER TABLE "public"."product_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "products_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 160))),
    CONSTRAINT "products_slug_check" CHECK (("slug" ~ '^[a-z0-9][a-z0-9-]{0,63}$'::"text"))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."redirect_metrics" (
    "store_id" "uuid" NOT NULL,
    "metric_date" "date" NOT NULL,
    "source" "text" DEFAULT ''::"text" NOT NULL,
    "campaign" "text" DEFAULT ''::"text" NOT NULL,
    "medium" "text" DEFAULT ''::"text" NOT NULL,
    "click_count" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "redirect_metrics_click_count_check" CHECK (("click_count" >= 0))
);


ALTER TABLE "public"."redirect_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rotation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_store_id" "uuid",
    "to_store_id" "uuid",
    "reason" "text" NOT NULL,
    "order_count" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "product_group_id" "uuid"
);


ALTER TABLE "public"."rotation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rotator_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    CONSTRAINT "rotator_settings_id_check" CHECK ("id")
);


ALTER TABLE "public"."rotator_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."route_clicks" (
    "id" "uuid" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "source" "text" DEFAULT ''::"text" NOT NULL,
    "campaign" "text" DEFAULT ''::"text" NOT NULL,
    "medium" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "product_group_id" "uuid",
    "product_group_member_store_product_id" "uuid",
    "product_id" "uuid",
    "rt_click" "text"
);


ALTER TABLE "public"."route_clicks" OWNER TO "postgres";


COMMENT ON TABLE "public"."route_clicks" IS 'Opaque router click IDs. No customer PII is stored.';



CREATE TABLE IF NOT EXISTS "public"."store_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "product_url" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shopify_product_id" "text",
    CONSTRAINT "store_products_product_url_check" CHECK (("product_url" ~ '^https://'::"text"))
);


ALTER TABLE "public"."store_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "shop_domain" "text" NOT NULL,
    "checkout_url" "text" NOT NULL,
    "rotation_position" integer NOT NULL,
    "current_order_count" integer DEFAULT 0 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "webhook_secret_slot" "text",
    "daily_revenue_target" numeric(12,2) DEFAULT 0 NOT NULL,
    "daily_revenue_cap" numeric(12,2),
    "pause_at_target" boolean DEFAULT false NOT NULL,
    "traffic_weight" numeric(10,4) DEFAULT 1 NOT NULL,
    "accepting_traffic" boolean DEFAULT true NOT NULL,
    "health_status" "text" DEFAULT 'healthy'::"text" NOT NULL,
    "webhook_secret_ciphertext" "text",
    "webhook_secret_hint" "text",
    CONSTRAINT "stores_checkout_url_check" CHECK (("checkout_url" ~ '^https://'::"text")),
    CONSTRAINT "stores_current_order_count_check" CHECK (("current_order_count" >= 0)),
    CONSTRAINT "stores_daily_revenue_cap_check" CHECK ((("daily_revenue_cap" IS NULL) OR ("daily_revenue_cap" >= (0)::numeric))),
    CONSTRAINT "stores_daily_revenue_target_check" CHECK (("daily_revenue_target" >= (0)::numeric)),
    CONSTRAINT "stores_health_status_check" CHECK (("health_status" = ANY (ARRAY['healthy'::"text", 'degraded'::"text", 'unavailable'::"text"]))),
    CONSTRAINT "stores_rotation_position_check" CHECK (("rotation_position" > 0)),
    CONSTRAINT "stores_traffic_weight_check" CHECK (("traffic_weight" > (0)::numeric)),
    CONSTRAINT "stores_webhook_secret_hint_check" CHECK ((("webhook_secret_hint" IS NULL) OR ("webhook_secret_hint" ~ '^[^:]{0,4}$'::"text")))
);


ALTER TABLE "public"."stores" OWNER TO "postgres";


COMMENT ON TABLE "public"."stores" IS 'Configured Shopify destinations. Seed Store A and Store B after migration.';



COMMENT ON COLUMN "public"."stores"."webhook_secret_slot" IS 'Stable A/B mapping to the server-only Shopify webhook secret environment variable.';



COMMENT ON COLUMN "public"."stores"."webhook_secret_ciphertext" IS 'AES-GCM encrypted Shopify webhook secret; never expose to the admin client.';



COMMENT ON COLUMN "public"."stores"."webhook_secret_hint" IS 'Last four characters shown to an administrator for recognition.';



CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shopify_event_id" "text" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "topic" "text" NOT NULL,
    "payload_hash" "text",
    "status" "text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    CONSTRAINT "webhook_events_status_check" CHECK (("status" = ANY (ARRAY['processed'::"text", 'duplicate'::"text", 'rejected'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."webhook_events" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_profiles"
    ADD CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."orders_log"
    ADD CONSTRAINT "orders_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders_log"
    ADD CONSTRAINT "orders_log_shopify_event_id_key" UNIQUE ("shopify_event_id");



ALTER TABLE ONLY "public"."orders_log"
    ADD CONSTRAINT "orders_log_store_id_shopify_order_id_key" UNIQUE ("store_id", "shopify_order_id");



ALTER TABLE ONLY "public"."product_group_members"
    ADD CONSTRAINT "product_group_members_pkey" PRIMARY KEY ("group_id", "store_product_id");



ALTER TABLE ONLY "public"."product_group_state"
    ADD CONSTRAINT "product_group_state_pkey" PRIMARY KEY ("group_id");



ALTER TABLE ONLY "public"."product_groups"
    ADD CONSTRAINT "product_groups_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."product_groups"
    ADD CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_groups"
    ADD CONSTRAINT "product_groups_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."redirect_metrics"
    ADD CONSTRAINT "redirect_metrics_pkey" PRIMARY KEY ("store_id", "metric_date", "source", "campaign", "medium");



ALTER TABLE ONLY "public"."rotation_events"
    ADD CONSTRAINT "rotation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rotator_settings"
    ADD CONSTRAINT "rotator_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."route_clicks"
    ADD CONSTRAINT "route_clicks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."store_products"
    ADD CONSTRAINT "store_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."store_products"
    ADD CONSTRAINT "store_products_product_id_store_id_key" UNIQUE ("product_id", "store_id");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_rotation_position_key" UNIQUE ("rotation_position");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_shop_domain_key" UNIQUE ("shop_domain");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_shopify_event_id_key" UNIQUE ("shopify_event_id");



CREATE INDEX "orders_log_click_idx" ON "public"."orders_log" USING "btree" ("route_click_id") WHERE ("route_click_id" IS NOT NULL);



CREATE INDEX "orders_log_product_group_idx" ON "public"."orders_log" USING "btree" ("product_group_id", "created_at" DESC);



CREATE INDEX "orders_log_reporting_idx" ON "public"."orders_log" USING "btree" ("created_at", "id");



CREATE INDEX "orders_log_store_created_idx" ON "public"."orders_log" USING "btree" ("store_id", "created_at" DESC);



CREATE INDEX "orders_log_store_product_idx" ON "public"."orders_log" USING "btree" ("store_product_id", "created_at" DESC);



CREATE UNIQUE INDEX "product_group_members_one_group_per_listing_idx" ON "public"."product_group_members" USING "btree" ("store_product_id");



CREATE INDEX "product_group_members_sequence_idx" ON "public"."product_group_members" USING "btree" ("group_id", "enabled", "sequence_position");



CREATE INDEX "rotation_events_created_idx" ON "public"."rotation_events" USING "btree" ("created_at" DESC);



CREATE INDEX "rotation_events_product_group_created_idx" ON "public"."rotation_events" USING "btree" ("product_group_id", "created_at" DESC);



CREATE INDEX "route_clicks_product_group_idx" ON "public"."route_clicks" USING "btree" ("product_group_id", "created_at" DESC);



CREATE UNIQUE INDEX "route_clicks_rt_click_idx" ON "public"."route_clicks" USING "btree" ("rt_click") WHERE ("rt_click" IS NOT NULL);



CREATE INDEX "route_clicks_store_created_idx" ON "public"."route_clicks" USING "btree" ("store_id", "created_at" DESC);



CREATE INDEX "store_products_product_enabled_idx" ON "public"."store_products" USING "btree" ("product_id", "enabled");



CREATE INDEX "store_products_store_enabled_idx" ON "public"."store_products" USING "btree" ("store_id", "enabled");



CREATE UNIQUE INDEX "store_products_store_shopify_product_idx" ON "public"."store_products" USING "btree" ("store_id", "shopify_product_id") WHERE ("shopify_product_id" IS NOT NULL);



CREATE INDEX "stores_enabled_position_idx" ON "public"."stores" USING "btree" ("enabled", "rotation_position");



CREATE INDEX "webhook_events_store_created_idx" ON "public"."webhook_events" USING "btree" ("store_id", "created_at" DESC);



ALTER TABLE ONLY "public"."orders_log"
    ADD CONSTRAINT "orders_log_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "public"."product_groups"("id");



ALTER TABLE ONLY "public"."orders_log"
    ADD CONSTRAINT "orders_log_route_click_id_fkey" FOREIGN KEY ("route_click_id") REFERENCES "public"."route_clicks"("id");



ALTER TABLE ONLY "public"."orders_log"
    ADD CONSTRAINT "orders_log_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."orders_log"
    ADD CONSTRAINT "orders_log_store_product_id_fkey" FOREIGN KEY ("store_product_id") REFERENCES "public"."store_products"("id");



ALTER TABLE ONLY "public"."product_group_members"
    ADD CONSTRAINT "product_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."product_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_group_members"
    ADD CONSTRAINT "product_group_members_store_product_id_fkey" FOREIGN KEY ("store_product_id") REFERENCES "public"."store_products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."product_group_state"
    ADD CONSTRAINT "product_group_state_group_id_active_member_store_product_i_fkey" FOREIGN KEY ("group_id", "active_member_store_product_id") REFERENCES "public"."product_group_members"("group_id", "store_product_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_group_state"
    ADD CONSTRAINT "product_group_state_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."product_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."redirect_metrics"
    ADD CONSTRAINT "redirect_metrics_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."rotation_events"
    ADD CONSTRAINT "rotation_events_from_store_id_fkey" FOREIGN KEY ("from_store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."rotation_events"
    ADD CONSTRAINT "rotation_events_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "public"."product_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rotation_events"
    ADD CONSTRAINT "rotation_events_to_store_id_fkey" FOREIGN KEY ("to_store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."route_clicks"
    ADD CONSTRAINT "route_clicks_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "public"."product_groups"("id");



ALTER TABLE ONLY "public"."route_clicks"
    ADD CONSTRAINT "route_clicks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."route_clicks"
    ADD CONSTRAINT "route_clicks_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."store_products"
    ADD CONSTRAINT "store_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."store_products"
    ADD CONSTRAINT "store_products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE "public"."admin_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_group_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_group_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."redirect_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rotation_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rotator_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."route_clicks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."store_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_shopify_order_v2"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_route_click_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_shopify_order_v2"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_route_click_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_shopify_order_v2"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_route_click_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_shopify_order_v2"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_route_click_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_shopify_order_v7"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_shopify_order_v7"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_shopify_order_v7"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_shopify_order_v7"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_shopify_order_v8"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_shopify_order_v8"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_shopify_order_v8"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_shopify_order_v8"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_shopify_order_v9"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text", "p_order_created_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_shopify_order_v9"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text", "p_order_created_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."process_shopify_order_v9"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text", "p_order_created_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_shopify_order_v9"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text", "p_order_created_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_shopify_order_v9_fixed_round"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text", "p_order_created_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_shopify_order_v9_fixed_round"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text", "p_order_created_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."process_shopify_order_v9_fixed_round"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text", "p_order_created_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_shopify_order_v9_fixed_round"("p_event_id" "text", "p_store_id" "uuid", "p_shopify_order_id" "text", "p_total_price" numeric, "p_currency" "text", "p_landing_site" "text", "p_financial_status" "text", "p_payload_hash" "text", "p_product_items" "jsonb", "p_route_click" "text", "p_topic" "text", "p_order_created_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_product_group_redirect"("p_group_slug" "text", "p_click_id" "uuid", "p_rt_click" "text", "p_source" "text", "p_campaign" "text", "p_medium" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_product_group_redirect"("p_group_slug" "text", "p_click_id" "uuid", "p_rt_click" "text", "p_source" "text", "p_campaign" "text", "p_medium" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_product_group_redirect"("p_group_slug" "text", "p_click_id" "uuid", "p_rt_click" "text", "p_source" "text", "p_campaign" "text", "p_medium" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_product_group_redirect"("p_group_slug" "text", "p_click_id" "uuid", "p_rt_click" "text", "p_source" "text", "p_campaign" "text", "p_medium" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_target_redirect"("p_click_id" "uuid", "p_source" "text", "p_campaign" "text", "p_medium" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_target_redirect"("p_click_id" "uuid", "p_source" "text", "p_campaign" "text", "p_medium" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_target_redirect"("p_click_id" "uuid", "p_source" "text", "p_campaign" "text", "p_medium" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_target_redirect"("p_click_id" "uuid", "p_source" "text", "p_campaign" "text", "p_medium" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."admin_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."orders_log" TO "service_role";



GRANT ALL ON TABLE "public"."product_group_members" TO "service_role";



GRANT ALL ON TABLE "public"."product_group_state" TO "service_role";



GRANT ALL ON TABLE "public"."product_groups" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."redirect_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."rotation_events" TO "service_role";



GRANT ALL ON TABLE "public"."rotator_settings" TO "service_role";



GRANT ALL ON TABLE "public"."route_clicks" TO "service_role";



GRANT ALL ON TABLE "public"."store_products" TO "service_role";



GRANT ALL ON TABLE "public"."stores" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







-- Clean baseline: remove retired store-routing functions retained by the schema dump.
drop function if exists public.process_shopify_order_v2(text, uuid, text, numeric, text, text, text, text, uuid);
drop function if exists public.process_shopify_order_v7(text, uuid, text, numeric, text, text, text, text, jsonb, text);
drop function if exists public.process_shopify_order_v8(text, uuid, text, numeric, text, text, text, text, jsonb, text, text);
drop function if exists public.record_target_redirect(uuid, text, text, text);

-- Initial administrator for this installation. The password is stored only as
-- a salted scrypt hash; the plaintext never enters the database.
insert into public.admin_profiles (email, role, enabled, password_hash)
values (
  'abdullah@admin.com',
  'admin',
  true,
  'scrypt$16384$8$1$yfXGnx5rvP1wkEn_fvuhRA$mUR5pFG-TllsNXLIusQFvnnIev03d394YEYwxBt3Elw'
)
on conflict (email) do update
set password_hash = excluded.password_hash,
    enabled = true,
    updated_at = now();
