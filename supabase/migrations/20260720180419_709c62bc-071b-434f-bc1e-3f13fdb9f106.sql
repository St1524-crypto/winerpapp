CREATE OR REPLACE FUNCTION public.get_operation_role(_user_id uuid)
RETURNS operation_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT op_role
  FROM public.operation_participants
  WHERE user_id = _user_id AND is_active = true
  ORDER BY CASE op_role
    WHEN 'manager' THEN 1
    WHEN 'staff' THEN 2
    WHEN 'assistant' THEN 3
    WHEN 'collaborator' THEN 4
  END ASC
  LIMIT 1
$function$;