DO $$
DECLARE
  test_member_ids uuid[] := ARRAY[
    '00000000-0000-4000-8000-000000000101'::uuid,
    '00000000-0000-4000-8000-000000000102'::uuid,
    '00000000-0000-4000-8000-000000000103'::uuid,
    '00000000-0000-4000-8000-000000000104'::uuid
  ];
  test_bonus_ids uuid[] := ARRAY[
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000202'::uuid,
    '00000000-0000-4000-8000-000000000203'::uuid,
    '00000000-0000-4000-8000-000000000204'::uuid
  ];
BEGIN
  DELETE FROM public.audit_logs
   WHERE (entity = 'bonus_records' AND entity_id = ANY(test_bonus_ids))
      OR (entity IN ('members','profiles','auth.users') AND entity_id = ANY(test_member_ids));

  DELETE FROM public.reward_wallet_logs WHERE member_id = ANY(test_member_ids);
  DELETE FROM public.point_transactions WHERE user_id = ANY(test_member_ids);
  DELETE FROM public.bonus_records
    WHERE id = ANY(test_bonus_ids)
       OR member_id = ANY(test_member_ids)
       OR original_member_id = ANY(test_member_ids)
       OR released_member_id = ANY(test_member_ids);
  DELETE FROM public.member_points_wallet WHERE user_id = ANY(test_member_ids);
  DELETE FROM public.profiles WHERE id = ANY(test_member_ids);
  DELETE FROM auth.users WHERE id = ANY(test_member_ids);
END $$;