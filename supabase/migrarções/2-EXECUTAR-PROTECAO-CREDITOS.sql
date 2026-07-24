ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS client_job_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS generations_access_key_client_job_uidx
  ON public.generations (access_key_id, client_job_id)
  WHERE access_key_id IS NOT NULL AND client_job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_key_id uuid NOT NULL REFERENCES public.access_keys(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (access_key_id, job_id)
);

GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS public.consume_access_credit(text);

CREATE OR REPLACE FUNCTION public.consume_access_credit(p_key text, p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.access_keys%ROWTYPE;
  today_brazil date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  remaining integer;
  already_consumed boolean;
BEGIN
  SELECT * INTO item
  FROM public.access_keys
  WHERE key = upper(trim(p_key))
  FOR UPDATE;

  IF NOT FOUND OR NOT item.active THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_ACCESS_KEY';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE access_key_id = item.id AND job_id = p_job_id
  ) INTO already_consumed;

  IF item.credits_reset_date IS DISTINCT FROM today_brazil THEN
    UPDATE public.access_keys
    SET credits_used_today = 0,
        credits_reset_date = today_brazil
    WHERE id = item.id;
    item.credits_used_today := 0;
    item.credits_reset_date := today_brazil;
  END IF;

  IF NOT already_consumed THEN
    IF NOT item.unlimited_credits AND item.credits_used_today >= item.credits_per_day THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREDITS_EXHAUSTED';
    END IF;

    IF NOT item.unlimited_credits THEN
      UPDATE public.access_keys
      SET credits_used_today = credits_used_today + 1
      WHERE id = item.id;
      item.credits_used_today := item.credits_used_today + 1;
    END IF;

    INSERT INTO public.credit_transactions (access_key_id, job_id)
    VALUES (item.id, p_job_id)
    ON CONFLICT (access_key_id, job_id) DO NOTHING;
  END IF;

  remaining := GREATEST(item.credits_per_day - item.credits_used_today, 0);

  RETURN jsonb_build_object(
    'keyId', item.id,
    'unlimited', item.unlimited_credits,
    'creditsPerDay', item.credits_per_day,
    'usedToday', item.credits_used_today,
    'remaining', CASE WHEN item.unlimited_credits THEN NULL ELSE remaining END,
    'resetDate', item.credits_reset_date,
    'alreadyConsumed', already_consumed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_access_credit(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_access_credit(text, uuid) TO service_role;
