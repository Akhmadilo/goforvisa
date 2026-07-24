
DROP TRIGGER IF EXISTS enforce_advance_requests_role_columns_trg ON public.advance_requests;
CREATE TRIGGER enforce_advance_requests_role_columns_trg
BEFORE UPDATE ON public.advance_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_advance_requests_role_columns();

DROP TRIGGER IF EXISTS enforce_leave_requests_role_columns_trg ON public.leave_requests;
CREATE TRIGGER enforce_leave_requests_role_columns_trg
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_leave_requests_role_columns();
