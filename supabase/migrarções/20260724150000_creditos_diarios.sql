ALTER TABLE public.access_keys
  ADD COLUMN IF NOT EXISTS credits_per_day integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS unlimited_credits boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credits_used_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_reset_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date);

ALTER TABLE public.access_keys
  DROP CONSTRAINT IF EXISTS access_keys_credits_per_day_check;
ALTER TABLE public.access_keys
  ADD CONSTRAINT access_keys_credits_per_day_check CHECK (credits_per_day >= 0);

CREATE OR REPLACE FUNCTION public.consume_access_credit(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.access_keys%ROWTYPE;
  today_brazil date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  remaining integer;
BEGIN
  SELECT * INTO item
  FROM public.access_keys
  WHERE key = upper(trim(p_key))
  FOR UPDATE;

  IF NOT FOUND OR NOT item.active THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_ACCESS_KEY';
  END IF;

  IF item.credits_reset_date IS DISTINCT FROM today_brazil THEN
    UPDATE public.access_keys
    SET credits_used_today = 0,
        credits_reset_date = today_brazil
    WHERE id = item.id;
    item.credits_used_today := 0;
    item.credits_reset_date := today_brazil;
  END IF;

  IF NOT item.unlimited_credits AND item.credits_used_today >= item.credits_per_day THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREDITS_EXHAUSTED';
  END IF;

  IF NOT item.unlimited_credits THEN
    UPDATE public.access_keys
    SET credits_used_today = credits_used_today + 1
    WHERE id = item.id;
    item.credits_used_today := item.credits_used_today + 1;
  END IF;

  remaining := GREATEST(item.credits_per_day - item.credits_used_today, 0);

  RETURN jsonb_build_object(
    'keyId', item.id,
    'unlimited', item.unlimited_credits,
    'creditsPerDay', item.credits_per_day,
    'usedToday', item.credits_used_today,
    'remaining', CASE WHEN item.unlimited_credits THEN NULL ELSE remaining END,
    'resetDate', item.credits_reset_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_access_credit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_access_credit(text) TO service_role;
