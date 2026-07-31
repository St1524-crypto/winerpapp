-- Harden product-image storage policies: validate folder-derived company against
-- the actual product_images/products rows instead of trusting the path alone.
create or replace function private.product_image_path_matches_company(_name text, _company uuid)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select not exists (
    select 1
    from public.product_images pi
    left join public.products p on p.id = pi.product_id
    where pi.image_url like '%/product-images/' || _name
      and coalesce(pi.company_id, p.company_id) is distinct from _company
  )
$$;

revoke all on function private.product_image_path_matches_company(text, uuid) from public;
grant execute on function private.product_image_path_matches_company(text, uuid) to authenticated, service_role;

drop policy if exists "Product images staff list" on storage.objects;
create policy "Product images staff list"
on storage.objects for select to authenticated
using (
  bucket_id = 'product-images'
  and (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    or (
      (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (
        private.has_role(auth.uid(), 'admin'::app_role)
        or private.has_role(auth.uid(), 'sales'::app_role)
        or private.has_role(auth.uid(), 'warehouse'::app_role)
      )
      and private.is_company_member(((storage.foldername(name))[1])::uuid, auth.uid())
      and private.product_image_path_matches_company(name, ((storage.foldername(name))[1])::uuid)
    )
  )
);

drop policy if exists "Staff update product images" on storage.objects;
create policy "Staff update product images"
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    or owner = auth.uid()
    or (
      (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and private.has_role(auth.uid(), 'admin'::app_role)
      and private.is_company_member(((storage.foldername(name))[1])::uuid, auth.uid())
      and private.product_image_path_matches_company(name, ((storage.foldername(name))[1])::uuid)
    )
  )
);

drop policy if exists "Staff delete product images" on storage.objects;
create policy "Staff delete product images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    or owner = auth.uid()
    or (
      (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and private.has_role(auth.uid(), 'admin'::app_role)
      and private.is_company_member(((storage.foldername(name))[1])::uuid, auth.uid())
      and private.product_image_path_matches_company(name, ((storage.foldername(name))[1])::uuid)
    )
  )
);