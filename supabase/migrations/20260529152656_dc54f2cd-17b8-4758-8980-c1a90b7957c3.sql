GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.categories TO anon;
CREATE POLICY "Anyone view active products" ON public.products FOR SELECT TO anon USING (status = 'active');
CREATE POLICY "Anyone view active categories" ON public.categories FOR SELECT TO anon USING (status = 'active');