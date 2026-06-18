-- DB_ADMIN_EXECUTION_CHANNEL
-- ENV: production
-- PURPOSE: Enable the member personal storefront for member_no AQTW25F00025.
-- OWNER_APPROVAL: Required before validate_only=false.
-- CHATGPT_REVIEW: Required before validate_only=false.
-- EXPECTED_PROJECT_REF: wvhvjdqbrftjggwwetwf
-- BACKUP_TABLES: public.ops_db_admin_backups
-- ROLLBACK: Execute SECTION: rollback in this file if verification fails or the change must be reverted.

begin;

-- SECTION: backup

create table if not exists public.ops_db_admin_backups (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,
  table_name text not null,
  row_pk text not null,
  row_data jsonb not null,
  backed_up_at timestamptz not null default now(),
  unique (task_id, table_name, row_pk)
);

insert into public.ops_db_admin_backups (task_id, table_name, row_pk, row_data)
select
  '20260618_member_storefront_aqtw25f00025',
  'profiles',
  p.id::text,
  to_jsonb(p)
from public.profiles p
where p.member_no = 'AQTW25F00025'
on conflict (task_id, table_name, row_pk) do nothing;

insert into public.ops_db_admin_backups (task_id, table_name, row_pk, row_data)
select
  '20260618_member_storefront_aqtw25f00025',
  'member_featured_products',
  mfp.id::text,
  to_jsonb(mfp)
from public.member_featured_products mfp
join public.profiles p on p.id = mfp.member_id
where p.member_no = 'AQTW25F00025'
on conflict (task_id, table_name, row_pk) do nothing;

insert into public.ops_db_admin_backups (task_id, table_name, row_pk, row_data)
select
  '20260618_member_storefront_aqtw25f00025',
  'member_custom_products',
  mcp.id::text,
  to_jsonb(mcp)
from public.member_custom_products mcp
join public.profiles p on p.id = mcp.member_id
where p.member_no = 'AQTW25F00025'
on conflict (task_id, table_name, row_pk) do nothing;

insert into public.ops_db_admin_backups (task_id, table_name, row_pk, row_data)
select
  '20260618_member_storefront_aqtw25f00025',
  'member_videos',
  mv.id::text,
  to_jsonb(mv)
from public.member_videos mv
join public.profiles p on p.id = mv.member_id
where p.member_no = 'AQTW25F00025'
on conflict (task_id, table_name, row_pk) do nothing;

-- SECTION: apply

do $$
declare
  v_member_id uuid;
  v_product_id uuid;
begin
  select id
    into v_member_id
  from public.profiles
  where member_no = 'AQTW25F00025'
  limit 1;

  if v_member_id is null then
    raise exception 'Member not found: AQTW25F00025';
  end if;

  select id
    into v_product_id
  from public.products
  where status = 'active'
  order by created_at desc
  limit 1;

  update public.profiles
     set brand_name = coalesce(nullif(brand_name, ''), coalesce(name, member_no, '源晶會員品牌頁')),
         brand_intro = coalesce(
           nullif(brand_intro, ''),
           '這是源晶ERP會員個人品牌頁，可展示個人品牌、推薦商品、影片與會員/VIP招募資訊。'
         ),
         profile_avatar = coalesce(nullif(profile_avatar, ''), avatar_url),
         profile_cover = coalesce(
           nullif(profile_cover, ''),
           'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1600'
         ),
         page_template = coalesce(nullif(page_template, ''), 'A')
   where id = v_member_id;

  if v_product_id is not null then
    insert into public.member_featured_products (
      member_id,
      product_id,
      sort_order
    )
    values (
      v_member_id,
      v_product_id,
      0
    )
    on conflict (member_id, product_id) do update set
      sort_order = excluded.sort_order;
  end if;

  insert into public.member_custom_products (
    id,
    member_id,
    title,
    description,
    image_url,
    video_url,
    purchase_url,
    is_active
  )
  values (
    'a25f0025-0001-4000-8000-000000000001',
    v_member_id,
    '會員精選服務展示',
    '這是會員個人品牌頁的自訂展示內容，可用於介紹個人服務、產品或聯絡方式。',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?w=900',
    null,
    'https://winerp.app/shop',
    true
  )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    image_url = excluded.image_url,
    video_url = excluded.video_url,
    purchase_url = excluded.purchase_url,
    is_active = excluded.is_active,
    updated_at = now();

  insert into public.member_videos (
    id,
    member_id,
    title,
    video_url,
    sort_order
  )
  values (
    'a25f0025-0002-4000-8000-000000000002',
    v_member_id,
    '會員品牌介紹影片',
    'https://www.youtube.com',
    0
  )
  on conflict (id) do update set
    title = excluded.title,
    video_url = excluded.video_url,
    sort_order = excluded.sort_order;
end $$;

-- SECTION: verify

select
  id,
  member_no,
  name,
  brand_name,
  brand_intro,
  page_template
from public.profiles
where member_no = 'AQTW25F00025';

select
  mfp.member_id,
  mfp.product_id,
  mfp.sort_order,
  p.name as product_name,
  p.status as product_status
from public.member_featured_products mfp
join public.products p on p.id = mfp.product_id
join public.profiles pr on pr.id = mfp.member_id
where pr.member_no = 'AQTW25F00025'
order by mfp.sort_order;

select
  mcp.id,
  mcp.title,
  mcp.is_active
from public.member_custom_products mcp
join public.profiles pr on pr.id = mcp.member_id
where pr.member_no = 'AQTW25F00025'
order by mcp.created_at desc;

select
  mv.id,
  mv.title,
  mv.video_url,
  mv.sort_order
from public.member_videos mv
join public.profiles pr on pr.id = mv.member_id
where pr.member_no = 'AQTW25F00025'
order by mv.sort_order;

commit;

-- SECTION: rollback
--
-- To rollback this task, execute the statements below manually after review.
-- They are intentionally left outside the transaction above.
/*
begin;

delete from public.member_featured_products mfp
using public.profiles p
where p.id = mfp.member_id
  and p.member_no = 'AQTW25F00025'
  and not exists (
    select 1
    from public.ops_db_admin_backups b
    where b.task_id = '20260618_member_storefront_aqtw25f00025'
      and b.table_name = 'member_featured_products'
      and b.row_pk = mfp.id::text
  );

delete from public.member_custom_products
where id in (
  'a25f0025-0001-4000-8000-000000000001'
)
and not exists (
  select 1
  from public.ops_db_admin_backups b
  where b.task_id = '20260618_member_storefront_aqtw25f00025'
    and b.table_name = 'member_custom_products'
    and b.row_pk = public.member_custom_products.id::text
);

delete from public.member_videos
where id in (
  'a25f0025-0002-4000-8000-000000000002'
)
and not exists (
  select 1
  from public.ops_db_admin_backups b
  where b.task_id = '20260618_member_storefront_aqtw25f00025'
    and b.table_name = 'member_videos'
    and b.row_pk = public.member_videos.id::text
);

update public.profiles p
   set brand_name = b.row_data->>'brand_name',
       brand_intro = b.row_data->>'brand_intro',
       profile_avatar = b.row_data->>'profile_avatar',
       profile_cover = b.row_data->>'profile_cover',
       line_url = b.row_data->>'line_url',
       facebook_url = b.row_data->>'facebook_url',
       instagram_url = b.row_data->>'instagram_url',
       youtube_url = b.row_data->>'youtube_url',
       page_template = coalesce(b.row_data->>'page_template', 'A')
from public.ops_db_admin_backups b
where b.task_id = '20260618_member_storefront_aqtw25f00025'
  and b.table_name = 'profiles'
  and b.row_pk = p.id::text
  and p.member_no = 'AQTW25F00025';

commit;
*/
