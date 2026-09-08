CREATE TABLE public.company_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  body TEXT,
  file_path TEXT,
  file_name TEXT,
  file_size BIGINT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.company_document_viewers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.company_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, user_id)
);

CREATE TABLE public.company_document_access_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.company_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  member_no TEXT,
  member_name TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_documents_company ON public.company_documents(company_id);
CREATE INDEX idx_company_document_viewers_user ON public.company_document_viewers(user_id);
CREATE INDEX idx_company_document_logs_doc ON public.company_document_access_logs(document_id, accessed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_documents TO authenticated;
GRANT ALL ON public.company_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_document_viewers TO authenticated;
GRANT ALL ON public.company_document_viewers TO service_role;
GRANT SELECT, INSERT ON public.company_document_access_logs TO authenticated;
GRANT ALL ON public.company_document_access_logs TO service_role;

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_document_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_document_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage company documents"
  ON public.company_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage company document viewers"
  ON public.company_document_viewers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins read company document logs"
  ON public.company_document_access_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_company_documents_updated_at
  BEFORE UPDATE ON public.company_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "admins manage company document files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'company-documents' AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')))
  WITH CHECK (bucket_id = 'company-documents' AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')));