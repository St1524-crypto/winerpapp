DROP POLICY IF EXISTS "public read videos" ON public.member_videos;

CREATE POLICY "public read videos active members"
ON public.member_videos
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = member_videos.member_id
      AND (p.frozen_code IS NULL OR p.frozen_code = 'N')
      AND (p.member_status IS NULL OR p.member_status = 'active' OR p.member_status = '正式會員')
  )
);