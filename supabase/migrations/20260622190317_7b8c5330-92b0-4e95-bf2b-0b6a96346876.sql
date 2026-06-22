
-- 1) GRANTS (missing — root cause of apply failure)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_storefront_pages TO authenticated;
GRANT ALL ON public.member_storefront_pages TO service_role;

GRANT SELECT ON public.member_storefront_templates TO authenticated;
GRANT ALL ON public.member_storefront_templates TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_storefront_custom_templates TO authenticated;
GRANT ALL ON public.member_storefront_custom_templates TO service_role;

-- 2) Seed 社群導流版 if missing (do not touch existing templates)
INSERT INTO public.member_storefront_templates (name, description, content_json, sort_order, is_active, is_default)
SELECT
  '社群導流版',
  '引導粉絲加入 LINE / IG / FB 等社群通路，強化互動與名單收集。',
  '{"sections":[{"type":"hero","title":"加入我的社群","subtitle":"獲得最新優惠與專屬內容"},{"type":"social_links","items":[{"label":"LINE 官方帳號","url":""},{"label":"Instagram","url":""},{"label":"Facebook 粉絲頁","url":""}]},{"type":"cta","title":"立即加入","description":"第一手活動與限時優惠都在這裡"}]}'::jsonb,
  25,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.member_storefront_templates WHERE name = '社群導流版'
);
