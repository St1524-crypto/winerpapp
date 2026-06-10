
REVOKE EXECUTE ON FUNCTION public.gb_validate_open_uniqueness() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gb_validate_join() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gb_after_join() FROM PUBLIC, anon, authenticated;

-- 為現有公司建立預設拼團設定
INSERT INTO public.group_buy_settings (company_id)
SELECT id FROM public.companies
ON CONFLICT (company_id) DO NOTHING;
