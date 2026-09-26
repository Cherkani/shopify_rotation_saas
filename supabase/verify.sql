-- Run after all migrations and optional seed data.
-- These checks are read-only and can be pasted into Supabase SQL Editor.

select id, name, shop_domain, rotation_position, enabled, current_order_count
from public.stores
order by rotation_position;

select id, target_timezone from public.rotator_settings where id = true;

select g.name as product_group,
       g.slug,
       g.enabled,
       state.remaining_steps,
       p.name as active_product,
       sp.name as active_listing,
       s.name as active_store
from public.product_groups g
left join public.product_group_state state on state.group_id = g.id
left join public.store_products sp on sp.id = state.active_member_store_product_id
left join public.products p on p.id = sp.product_id
left join public.stores s on s.id = sp.store_id
order by g.created_at desc;

select count(*) as total_orders,
       count(*) filter (where counted_in_rotation) as counted_orders
from public.orders_log;

select rc.created_at, g.name as product_group, p.name as product,
       sp.name as listing, s.name as store, rc.source, rc.campaign, rc.medium
from public.route_clicks rc
left join public.product_groups g on g.id = rc.product_group_id
left join public.store_products sp on sp.id = rc.product_group_member_store_product_id
left join public.products p on p.id = sp.product_id
left join public.stores s on s.id = rc.store_id
order by rc.created_at desc
limit 25;

select from_store_id, to_store_id, product_group_id, reason, order_count, created_at
from public.rotation_events
order by created_at desc
limit 25;
