-- Zunexi.ai — planos mensais, agenda individual e Brand Kit
-- Execute este arquivo UMA VEZ no SQL Editor do Supabase antes de publicar esta versão.

CREATE EXTENSION IF NOT EXISTS pgcrypto;


CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_key_id uuid NOT NULL REFERENCES public.access_keys(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_access_job_uidx
  ON public.credit_transactions (access_key_id, job_id);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_transactions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.credit_transactions TO service_role;

ALTER TABLE public.access_keys
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'essencial',
  ADD COLUMN IF NOT EXISTS credits_per_month integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS credits_used_month integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_reset_month date NOT NULL DEFAULT date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;

ALTER TABLE public.access_keys DROP CONSTRAINT IF EXISTS access_keys_plan_check;
ALTER TABLE public.access_keys ADD CONSTRAINT access_keys_plan_check CHECK (plan IN ('essencial', 'profissional', 'agencia'));
ALTER TABLE public.access_keys DROP CONSTRAINT IF EXISTS access_keys_credits_per_month_check;
ALTER TABLE public.access_keys ADD CONSTRAINT access_keys_credits_per_month_check CHECK (credits_per_month >= 0);

-- Converte chaves antigas para a estrutura de planos sem apagar seu histórico.
UPDATE public.access_keys
SET plan = CASE
      WHEN credits_per_day >= 300 THEN 'agencia'
      WHEN credits_per_day >= 100 THEN 'profissional'
      ELSE 'essencial'
    END,
    credits_per_month = CASE
      WHEN credits_per_day >= 300 THEN 300
      WHEN credits_per_day >= 100 THEN 100
      ELSE 30
    END,
    credits_used_month = LEAST(credits_used_today, CASE
      WHEN credits_per_day >= 300 THEN 300
      WHEN credits_per_day >= 100 THEN 100
      ELSE 30
    END),
    credits_reset_month = date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;

CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_key_id uuid NOT NULL REFERENCES public.access_keys(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  caption text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT 'instagram' CHECK (platform IN ('instagram', 'facebook', 'linkedin', 'tiktok', 'outro')),
  content_type text NOT NULL DEFAULT 'post' CHECK (content_type IN ('carrossel', 'cartaz', 'reel', 'story', 'post', 'outro')),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'agendado' CHECK (status IN ('rascunho', 'agendado', 'publicado')),
  project_id text,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_posts_access_date_idx
  ON public.scheduled_posts (access_key_id, scheduled_for);

CREATE TABLE IF NOT EXISTS public.brand_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_key_id uuid NOT NULL REFERENCES public.access_keys(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  primary_color text NOT NULL DEFAULT '#4D6BFF',
  secondary_color text NOT NULL DEFAULT '#8B5CF6',
  accent_color text NOT NULL DEFAULT '#12C7FF',
  tone_of_voice text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  visual_style text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_profiles_access_idx
  ON public.brand_profiles (access_key_id, created_at);

ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_posts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.brand_profiles FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.scheduled_posts TO service_role;
GRANT ALL ON public.brand_profiles TO service_role;

DROP FUNCTION IF EXISTS public.consume_access_credit(text);
DROP FUNCTION IF EXISTS public.consume_access_credit(text, uuid);

CREATE OR REPLACE FUNCTION public.consume_access_credit(p_key text, p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.access_keys%ROWTYPE;
  month_brazil date := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;
  next_reset date := (month_brazil + interval '1 month')::date;
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

  IF item.credits_reset_month IS DISTINCT FROM month_brazil THEN
    UPDATE public.access_keys
    SET credits_used_month = 0,
        credits_reset_month = month_brazil
    WHERE id = item.id;
    item.credits_used_month := 0;
    item.credits_reset_month := month_brazil;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE access_key_id = item.id AND job_id = p_job_id
  ) INTO already_consumed;

  IF NOT already_consumed THEN
    IF NOT item.unlimited_credits AND item.credits_used_month >= item.credits_per_month THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREDITS_EXHAUSTED';
    END IF;

    INSERT INTO public.credit_transactions (access_key_id, job_id)
    VALUES (item.id, p_job_id)
    ON CONFLICT (access_key_id, job_id) DO NOTHING;

    IF NOT item.unlimited_credits THEN
      UPDATE public.access_keys
      SET credits_used_month = credits_used_month + 1
      WHERE id = item.id;
      item.credits_used_month := item.credits_used_month + 1;
    END IF;
  END IF;

  remaining := GREATEST(item.credits_per_month - item.credits_used_month, 0);

  RETURN jsonb_build_object(
    'keyId', item.id,
    'plan', item.plan,
    'unlimited', item.unlimited_credits,
    'creditsPerMonth', item.credits_per_month,
    'usedThisMonth', item.credits_used_month,
    'remaining', CASE WHEN item.unlimited_credits THEN NULL ELSE remaining END,
    'resetAt', next_reset,
    'alreadyConsumed', already_consumed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_access_credit(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_access_credit(text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
