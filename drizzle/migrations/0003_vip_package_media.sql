ALTER TABLE public.vip_upgrade_packages ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.vip_upgrade_packages ADD COLUMN IF NOT EXISTS youtube_url text;