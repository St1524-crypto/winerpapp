INSERT INTO public.member_bonus_eligibility_grants (user_id, pool_kind, starts_on, ends_on, reason)
SELECT p.id, 'consumption', DATE '2026-08-10', DATE '2026-11-10', '消費回饋名冊 2026-08-10 匯入（三個月授權）'
FROM public.profiles p
WHERE p.member_no IN ('TW23L00002','TW24D00070','TW24F00033','TW24J00011','TW25A00003','TW25D00011','TW25H00041','TW25H00064','TW25J00037','TW25J00038','TW25J00043','TW25K00032','TW25K00042','TW25K00043','TW25L00008','TW25L00012','TW25L00014','TW26A00021','TW26B00002','TW26B00004','TW26F00010')
ON CONFLICT (user_id, pool_kind) DO UPDATE
SET starts_on = EXCLUDED.starts_on,
    ends_on = EXCLUDED.ends_on,
    reason = EXCLUDED.reason;