CREATE OR REPLACE FUNCTION public.enforce_shop_content_question_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  -- Always bind the row to the authenticated caller when there is one.
  IF auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    SELECT NULLIF(btrim(COALESCE(p.display_name, p.name, '')), '')
      INTO v_name
      FROM public.profiles p
     WHERE p.id = NEW.user_id;
  END IF;

  IF v_name IS NULL OR v_name LIKE '%@%' THEN
    v_name := '會員';
  END IF;

  NEW.author_name := v_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_shop_content_question_author ON public.shop_content_questions;
CREATE TRIGGER trg_enforce_shop_content_question_author
BEFORE INSERT OR UPDATE OF author_name, user_id ON public.shop_content_questions
FOR EACH ROW EXECUTE FUNCTION public.enforce_shop_content_question_author();