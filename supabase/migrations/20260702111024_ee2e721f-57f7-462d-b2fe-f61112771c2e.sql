INSERT INTO public.system_settings (key, value, description)
VALUES ('guest_signup_discount_points', '1000'::jsonb, '新會員（含訪客快速註冊）首次註冊贈送折扣點')
ON CONFLICT (key) DO NOTHING;