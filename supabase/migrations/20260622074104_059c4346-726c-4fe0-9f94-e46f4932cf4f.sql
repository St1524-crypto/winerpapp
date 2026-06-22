
-- 1. Templates table
CREATE TABLE public.member_storefront_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  cover_image text,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.member_storefront_templates TO authenticated;
GRANT ALL ON public.member_storefront_templates TO service_role;

ALTER TABLE public.member_storefront_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active templates"
  ON public.member_storefront_templates FOR SELECT
  TO authenticated
  USING (
    is_active = true
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Admins manage templates"
  ON public.member_storefront_templates FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE TRIGGER trg_member_storefront_templates_updated
  BEFORE UPDATE ON public.member_storefront_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Member pages
CREATE TABLE public.member_storefront_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_template_id uuid NULL REFERENCES public.member_storefront_templates(id) ON DELETE SET NULL,
  published_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_storefront_pages TO authenticated;
GRANT ALL ON public.member_storefront_pages TO service_role;

ALTER TABLE public.member_storefront_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own page"
  ON public.member_storefront_pages FOR ALL
  TO authenticated
  USING (
    member_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    member_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE TRIGGER trg_member_storefront_pages_updated
  BEFORE UPDATE ON public.member_storefront_pages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Seed 4 default templates
INSERT INTO public.member_storefront_templates (name, description, content_json, sort_order, is_active, is_default) VALUES
  ('專家形象版', '突顯專業背景與信任感，適合顧問、講師、品牌主理人。', '{
    "layout": "expert",
    "sections": [
      {"type": "hero", "title": "您的專業，值得被看見", "subtitle": "歡迎來到我的品牌頁", "ctaText": "預約諮詢"},
      {"type": "about", "title": "關於我", "body": "請在這裡介紹您的專業背景、經歷與服務領域。"},
      {"type": "services", "title": "服務項目", "items": [{"title": "服務一", "desc": "服務說明"}, {"title": "服務二", "desc": "服務說明"}]},
      {"type": "contact", "title": "聯絡我", "showLine": true, "showFacebook": true}
    ]
  }'::jsonb, 10, true, true),
  ('產品銷售版', '聚焦商品展示與購買轉換，適合電商與帶貨型會員。', '{
    "layout": "shop",
    "sections": [
      {"type": "hero", "title": "嚴選好物推薦", "subtitle": "我精挑細選的商品都在這裡", "ctaText": "立即選購"},
      {"type": "featured_products", "title": "熱門商品", "limit": 6},
      {"type": "custom_products", "title": "獨家推薦"},
      {"type": "contact", "title": "有問題嗎？", "showLine": true}
    ]
  }'::jsonb, 20, true, false),
  ('社群導流版', '把訪客導到 LINE / FB / IG / YT，適合內容創作者與社群經營者。', '{
    "layout": "social",
    "sections": [
      {"type": "hero", "title": "在每個平台與我相遇", "subtitle": "追蹤我，獲得最新內容", "ctaText": "加入社群"},
      {"type": "social_links", "title": "我的社群", "showLine": true, "showFacebook": true, "showInstagram": true, "showYoutube": true},
      {"type": "videos", "title": "精選影片"},
      {"type": "about", "title": "關於我", "body": "簡單介紹自己。"}
    ]
  }'::jsonb, 30, true, false),
  ('活動報名版', '主打活動 / 課程 / 聚會報名，適合主辦人與招商使用。', '{
    "layout": "event",
    "sections": [
      {"type": "hero", "title": "下一場活動，等你加入", "subtitle": "限額報名中", "ctaText": "立即報名"},
      {"type": "event_info", "title": "活動資訊", "date": "", "location": "", "body": "請填寫活動詳情。"},
      {"type": "agenda", "title": "活動流程", "items": [{"time": "", "title": ""}]},
      {"type": "cta", "title": "我要報名", "buttonText": "報名連結", "url": ""},
      {"type": "contact", "title": "聯絡主辦", "showLine": true}
    ]
  }'::jsonb, 40, true, false);
