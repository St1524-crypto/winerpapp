-- T 階：日推薦級差 / 升級推薦 = 20%
UPDATE public.vip_tiers SET daily_referral_rate = 20, upgrade_referral_rate = 20, updated_at = now() WHERE code = 'T';

-- 營業分紅：E/A 歸零，星級統一 5%
UPDATE public.vip_tiers SET business_bonus_rate = 0, operating_bonus_rate = 0, updated_at = now() WHERE code IN ('V','S','T','E','A');
UPDATE public.vip_tiers SET business_bonus_rate = 5, operating_bonus_rate = 5, updated_at = now()
WHERE code IN ('STAR1','STAR2','STAR3','STAR4','STAR5','STAR6','STAR7','DIRECTOR');

-- 消費分紅：星級不領消費回饋
UPDATE public.vip_tiers SET revenue_share_rate = 0, updated_at = now()
WHERE code IN ('STAR1','STAR2','STAR3','STAR4','STAR5','STAR6','STAR7','DIRECTOR');
