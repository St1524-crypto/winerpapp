DELETE FROM public.member_bonus_eligibility_grants WHERE pool_kind = 'business';

INSERT INTO public.member_bonus_eligibility_grants (user_id, pool_kind, starts_on, ends_on, reason, exclusive)
SELECT p.id, 'business', DATE '2026-08-15', DATE '2026-11-15', '2026/08/15 營業分紅合格名冊（名單制）', true
FROM public.profiles p
WHERE p.member_no IN (
  'TW19J00021','TW20F00003','TW24C00023','TW24D00074',
  'TW25I00021','TW25J00036','TW25K00039','TW25L00005'
);