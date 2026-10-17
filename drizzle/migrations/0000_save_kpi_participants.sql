CREATE OR REPLACE FUNCTION public.save_kpi_participants(p_participants jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tid uuid; r text; item jsonb;
BEGIN
 tid := public.current_tenant_id();
 IF auth.uid() IS NULL OR tid IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND tenant_id=tid AND role='admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF jsonb_typeof(p_participants) <> 'object' OR p_participants - ARRAY['sales','back_office','call_centre','visa_bonus']::text[] <> '{}'::jsonb THEN RAISE EXCEPTION 'Invalid participants'; END IF;
 FOREACH r IN ARRAY ARRAY['sales','back_office','call_centre','visa_bonus'] LOOP
  IF jsonb_typeof(p_participants->r) IS DISTINCT FROM 'array' OR jsonb_array_length(p_participants->r)>500 THEN RAISE EXCEPTION 'Invalid role roster'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_participants->r) LOOP
   IF jsonb_typeof(item)<>'string' OR length(item #>> '{}') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid name'; END IF;
  END LOOP;
 END LOOP;
 INSERT INTO public.tenant_settings(tenant_id,business_rules) VALUES(tid,jsonb_build_object('kpi_participants',p_participants))
 ON CONFLICT(tenant_id) DO UPDATE SET business_rules=jsonb_set(COALESCE(tenant_settings.business_rules,'{}'::jsonb),'{kpi_participants}',p_participants),updated_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.save_kpi_participants(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_kpi_participants(jsonb) TO authenticated;