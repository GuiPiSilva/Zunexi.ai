-- Zunexi.ai — multi-tenant completo, Brand Guide em PDF e sincronização em nuvem
-- Execute UMA VEZ no SQL Editor do Supabase depois das migrações anteriores.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'essencial' CHECK (plan IN ('essencial','profissional','agencia')),
  credits_per_month integer NOT NULL DEFAULT 30 CHECK (credits_per_month >= 0),
  credits_used_month integer NOT NULL DEFAULT 0 CHECK (credits_used_month >= 0),
  credits_reset_month date NOT NULL DEFAULT date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date,
  unlimited_credits boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.access_keys ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  access_key_id uuid NOT NULL UNIQUE REFERENCES public.access_keys(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Usuário Zunexi.ai',
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Converte cada chave antiga em um tenant independente sem misturar dados.
INSERT INTO public.tenants (
  id, name, slug, plan, credits_per_month, credits_used_month,
  credits_reset_month, unlimited_credits, active, created_at, updated_at
)
SELECT
  ak.id,
  COALESCE(NULLIF(trim(ak.label), ''), 'Conta Zunexi.ai'),
  'tenant-' || replace(ak.id::text, '-', ''),
  COALESCE(NULLIF(ak.plan, ''), 'essencial'),
  COALESCE(ak.credits_per_month, 30),
  COALESCE(ak.credits_used_month, 0),
  COALESCE(ak.credits_reset_month, date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date),
  COALESCE(ak.unlimited_credits, false),
  COALESCE(ak.active, true),
  COALESCE(ak.created_at, now()),
  now()
FROM public.access_keys ak
ON CONFLICT (id) DO NOTHING;

UPDATE public.access_keys SET tenant_id = id WHERE tenant_id IS NULL;
ALTER TABLE public.access_keys ALTER COLUMN tenant_id SET NOT NULL;

INSERT INTO public.tenant_members (tenant_id, access_key_id, display_name, role, active)
SELECT ak.tenant_id, ak.id, COALESCE(NULLIF(trim(ak.label), ''), 'Usuário Zunexi.ai'), 'owner', ak.active
FROM public.access_keys ak
ON CONFLICT (access_key_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS access_keys_tenant_idx ON public.access_keys (tenant_id);
CREATE INDEX IF NOT EXISTS tenant_members_tenant_idx ON public.tenant_members (tenant_id, active);

ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by_member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS typography jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS content_pillars jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS prohibited_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS brand_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS guide_summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS guide_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS guide_updated_at timestamptz;

UPDATE public.brand_profiles bp
SET tenant_id = ak.tenant_id,
    created_by_member_id = tm.id
FROM public.access_keys ak
LEFT JOIN public.tenant_members tm ON tm.access_key_id = ak.id
WHERE bp.access_key_id = ak.id AND bp.tenant_id IS NULL;

ALTER TABLE public.brand_profiles ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS brand_profiles_tenant_idx ON public.brand_profiles (tenant_id, is_primary DESC, created_at);

CREATE TABLE IF NOT EXISTS public.brand_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand_profile_id uuid NOT NULL REFERENCES public.brand_profiles(id) ON DELETE CASCADE,
  uploaded_by_member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  size_bytes bigint NOT NULL DEFAULT 0,
  page_count integer NOT NULL DEFAULT 0,
  extracted_text text NOT NULL DEFAULT '',
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_documents_tenant_brand_idx ON public.brand_documents (tenant_id, brand_profile_id, created_at DESC);

ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS owner_member_id uuid REFERENCES public.tenant_members(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS brand_profile_id uuid REFERENCES public.brand_profiles(id) ON DELETE SET NULL;

UPDATE public.scheduled_posts sp
SET tenant_id = ak.tenant_id,
    owner_member_id = tm.id
FROM public.access_keys ak
JOIN public.tenant_members tm ON tm.access_key_id = ak.id
WHERE sp.access_key_id = ak.id AND (sp.tenant_id IS NULL OR sp.owner_member_id IS NULL);

ALTER TABLE public.scheduled_posts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.scheduled_posts ALTER COLUMN owner_member_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS scheduled_posts_member_date_idx ON public.scheduled_posts (tenant_id, owner_member_id, scheduled_for);

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand_profile_id uuid REFERENCES public.brand_profiles(id) ON DELETE SET NULL;

UPDATE public.generations g
SET tenant_id = ak.tenant_id,
    member_id = tm.id
FROM public.access_keys ak
LEFT JOIN public.tenant_members tm ON tm.access_key_id = ak.id
WHERE g.access_key_id = ak.id AND g.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS generations_tenant_member_idx ON public.generations (tenant_id, member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.cloud_projects (
  id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_member_id uuid NOT NULL REFERENCES public.tenant_members(id) ON DELETE CASCADE,
  name text NOT NULL,
  project_type text NOT NULL CHECK (project_type IN ('carrossel','cartaz')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, owner_member_id, id)
);
CREATE INDEX IF NOT EXISTS cloud_projects_tenant_member_idx ON public.cloud_projects (tenant_id, owner_member_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.cloud_library_items (
  id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_member_id uuid NOT NULL REFERENCES public.tenant_members(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, owner_member_id, id)
);
CREATE INDEX IF NOT EXISTS cloud_library_tenant_member_idx ON public.cloud_library_items (tenant_id, owner_member_id, created_at DESC);

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL;

UPDATE public.credit_transactions ct
SET tenant_id = ak.tenant_id,
    member_id = tm.id
FROM public.access_keys ak
LEFT JOIN public.tenant_members tm ON tm.access_key_id = ak.id
WHERE ct.access_key_id = ak.id AND ct.tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_tenant_job_uidx ON public.credit_transactions (tenant_id, job_id);

-- Mantém as tabelas privadas. O app acessa somente por funções server-side que validam chave, tenant e membro.
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_library_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenants, public.tenant_members, public.brand_documents, public.cloud_projects, public.cloud_library_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tenants, public.tenant_members, public.brand_documents, public.cloud_projects, public.cloud_library_items TO service_role;

DROP FUNCTION IF EXISTS public.consume_access_credit(text, uuid);
CREATE OR REPLACE FUNCTION public.consume_access_credit(p_key text, p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_row public.access_keys%ROWTYPE;
  tenant_row public.tenants%ROWTYPE;
  member_row public.tenant_members%ROWTYPE;
  month_brazil date := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;
  next_reset date := (month_brazil + interval '1 month')::date;
  already_consumed boolean;
BEGIN
  SELECT * INTO key_row FROM public.access_keys WHERE key = upper(trim(p_key)) FOR UPDATE;
  IF NOT FOUND OR NOT key_row.active THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_ACCESS_KEY';
  END IF;

  SELECT * INTO tenant_row FROM public.tenants WHERE id = key_row.tenant_id FOR UPDATE;
  IF NOT FOUND OR NOT tenant_row.active THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_TENANT';
  END IF;

  SELECT * INTO member_row FROM public.tenant_members WHERE access_key_id = key_row.id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_MEMBER';
  END IF;

  IF tenant_row.credits_reset_month IS DISTINCT FROM month_brazil THEN
    UPDATE public.tenants SET credits_used_month = 0, credits_reset_month = month_brazil, updated_at = now() WHERE id = tenant_row.id;
    tenant_row.credits_used_month := 0;
    tenant_row.credits_reset_month := month_brazil;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.credit_transactions WHERE tenant_id = tenant_row.id AND job_id = p_job_id)
  INTO already_consumed;

  IF NOT already_consumed THEN
    IF NOT tenant_row.unlimited_credits AND tenant_row.credits_used_month >= tenant_row.credits_per_month THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREDITS_EXHAUSTED';
    END IF;

    INSERT INTO public.credit_transactions (access_key_id, tenant_id, member_id, job_id)
    VALUES (key_row.id, tenant_row.id, member_row.id, p_job_id)
    ON CONFLICT (tenant_id, job_id) DO NOTHING;

    IF NOT tenant_row.unlimited_credits THEN
      UPDATE public.tenants SET credits_used_month = credits_used_month + 1, updated_at = now() WHERE id = tenant_row.id;
      tenant_row.credits_used_month := tenant_row.credits_used_month + 1;
    END IF;
  END IF;

  -- Campos antigos são sincronizados apenas para compatibilidade do painel atual.
  UPDATE public.access_keys
  SET plan = tenant_row.plan,
      credits_per_month = tenant_row.credits_per_month,
      credits_used_month = tenant_row.credits_used_month,
      credits_reset_month = tenant_row.credits_reset_month,
      unlimited_credits = tenant_row.unlimited_credits
  WHERE tenant_id = tenant_row.id;

  RETURN jsonb_build_object(
    'keyId', key_row.id,
    'tenantId', tenant_row.id,
    'memberId', member_row.id,
    'memberRole', member_row.role,
    'tenantName', tenant_row.name,
    'plan', tenant_row.plan,
    'unlimited', tenant_row.unlimited_credits,
    'creditsPerMonth', tenant_row.credits_per_month,
    'usedThisMonth', tenant_row.credits_used_month,
    'remaining', CASE WHEN tenant_row.unlimited_credits THEN NULL ELSE GREATEST(tenant_row.credits_per_month - tenant_row.credits_used_month, 0) END,
    'resetAt', next_reset,
    'alreadyConsumed', already_consumed
  );
END;
$$;
REVOKE ALL ON FUNCTION public.consume_access_credit(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_access_credit(text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
