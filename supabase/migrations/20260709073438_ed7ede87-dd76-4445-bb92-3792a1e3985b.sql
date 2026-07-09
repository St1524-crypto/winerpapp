create table if not exists public.shop_content_questions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.shop_content_pages(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  author_name text,
  content text not null check (length(btrim(content)) between 1 and 2000),
  reply text,
  replied_by uuid references auth.users(id) on delete set null,
  replied_at timestamptz,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists shop_content_questions_page_id_idx
  on public.shop_content_questions (page_id, created_at desc);

grant select, insert on public.shop_content_questions to authenticated;
grant select on public.shop_content_questions to anon;
grant all on public.shop_content_questions to service_role;

alter table public.shop_content_questions enable row level security;

create policy "questions_public_read"
on public.shop_content_questions
for select
to anon, authenticated
using (
  is_hidden = false
  and exists (
    select 1 from public.shop_content_pages p
    where p.id = shop_content_questions.page_id
      and p.is_published = true
  )
);

create policy "questions_insert_self"
on public.shop_content_questions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "questions_owner_read"
on public.shop_content_questions
for select
to authenticated
using (user_id = auth.uid());

create policy "questions_admin_all"
on public.shop_content_questions
for all
to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'))
with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));