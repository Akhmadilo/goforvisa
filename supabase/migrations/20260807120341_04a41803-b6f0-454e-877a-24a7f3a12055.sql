CREATE OR REPLACE FUNCTION public.enforce_advance_requests_role_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean := has_role(uid, 'admin'::app_role);
  is_ceo boolean := has_role(uid, 'owner_ceo'::app_role);
  is_fin boolean := has_role(uid, 'financier'::app_role);
BEGIN
  IF uid IS NULL OR is_admin THEN
    RETURN NEW;
  END IF;

  -- Financier (and not CEO/admin): may only touch finance-step fields, and only after CEO approval.
  IF is_fin AND NOT is_ceo THEN
    IF OLD.ceo_approved_at IS NULL AND NEW.status <> 'rejected' THEN
      RAISE EXCEPTION 'Financier cannot act before CEO approval';
    END IF;
    IF NEW.ceo_approved_by IS DISTINCT FROM OLD.ceo_approved_by
       OR NEW.ceo_approved_at IS DISTINCT FROM OLD.ceo_approved_at
       OR NEW.ceo_note IS DISTINCT FROM OLD.ceo_note THEN
      RAISE EXCEPTION 'Financier cannot modify CEO decision fields';
    END IF;
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.amount_uzs IS DISTINCT FROM OLD.amount_uzs
       OR NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.telegram_id IS DISTINCT FROM OLD.telegram_id
       OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Financier cannot modify request core fields';
    END IF;
    -- Financier may only move the request into a payment/rejection state.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('paid', 'rejected', 'finance_approved', 'approved') THEN
      RAISE EXCEPTION 'Financier cannot set status %', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  -- CEO (not also financier/admin): may not touch finance-step fields.
  IF is_ceo AND NOT is_fin THEN
    IF NEW.finance_approved_by IS DISTINCT FROM OLD.finance_approved_by
       OR NEW.finance_approved_at IS DISTINCT FROM OLD.finance_approved_at
       OR NEW.finance_note IS DISTINCT FROM OLD.finance_note
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR NEW.paid_by IS DISTINCT FROM OLD.paid_by
       OR NEW.deducted_in_salary_id IS DISTINCT FROM OLD.deducted_in_salary_id THEN
      RAISE EXCEPTION 'CEO cannot modify finance step fields';
    END IF;
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.amount_uzs IS DISTINCT FROM OLD.amount_uzs
       OR NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.telegram_id IS DISTINCT FROM OLD.telegram_id
       OR NEW.source IS DISTINCT FROM OLD.source THEN
      RAISE EXCEPTION 'CEO cannot modify request core fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;