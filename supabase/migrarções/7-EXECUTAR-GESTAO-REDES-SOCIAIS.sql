-- Zunexi.ai — gestão completa de redes sociais
-- Execute UMA VEZ no SQL Editor do Supabase depois da migração 6.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.tenant_members DROP CONSTRAINT IF EXISTS tenant_members_role_check;
ALTER TABLE public.tenant_members
  ADD CONSTRAINT tenant_members_role_check
  CHECK (role IN ('owner','admin','member','social','designer','approver','analyst','viewer','support'));

CREATE TABLE IF NOT EXISTS public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand_profile_id uuid REFERENCES public.brand_profiles(id) ON DELETE SET NULL,
  created_by_member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('instagram','facebook','threads','tiktok','linkedin','youtube','pinterest','x','google_business','outro')),
  account_name text NOT NULL CHECK (char_length(account_name) BETWEEN 2 AND 160),
  username text NOT NULL DEFAULT '',
  external_account_id text NOT NULL DEFAULT '',
  page_id text NOT NULL DEFAULT '',
  instagram_business_account_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','attention','disconnected')),
  access_token_cipher text NOT NULL DEFAULT '',
  refresh_token_cipher text NOT NULL DEFAULT '',
  token_expires_at timestamptz,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_accounts_tenant_idx ON public.social_accounts (tenant_id, platform, status);
CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_external_uidx
  ON public.social_accounts (tenant_id, platform, external_account_id)
  WHERE external_account_id <> '';

CREATE TABLE IF NOT EXISTS public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand_profile_id uuid REFERENCES public.brand_profiles(id) ON DELETE SET NULL,
  owner_member_id uuid NOT NULL REFERENCES public.tenant_members(id) ON DELETE CASCADE,
  approved_by_member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 180),
  caption text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT 'post' CHECK (content_type IN ('carrossel','cartaz','reel','story','post','video','outro')),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_revisao','alteracoes','aprovado','agendado','publicando','publicado','falhou','arquivado')),
  platforms jsonb NOT NULL DEFAULT '[]'::jsonb,
  social_account_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  project_id text,
  campaign text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheduled_for timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  publish_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_items_tenant_status_idx ON public.content_items (tenant_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS content_items_brand_idx ON public.content_items (tenant_id, brand_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.content_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  content_item_id uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.tenant_members(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_comments_item_idx ON public.content_comments (tenant_id, content_item_id, created_at);

CREATE TABLE IF NOT EXISTS public.inbox_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  brand_profile_id uuid REFERENCES public.brand_profiles(id) ON DELETE SET NULL,
  assigned_member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  platform text NOT NULL,
  external_thread_id text NOT NULL,
  external_user_id text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT 'Contato',
  user_avatar_url text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'message' CHECK (kind IN ('message','comment','mention','review')),
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','em_atendimento','aguardando','resolvido','spam')),
  sentiment text NOT NULL DEFAULT 'neutral' CHECK (sentiment IN ('positive','neutral','negative','urgent')),
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_message text NOT NULL DEFAULT '',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, social_account_id, external_thread_id)
);
CREATE INDEX IF NOT EXISTS inbox_threads_tenant_status_idx ON public.inbox_threads (tenant_id, status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  external_message_id text NOT NULL DEFAULT '',
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','note')),
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','video','audio','file','reaction','system')),
  body text NOT NULL DEFAULT '',
  media_url text NOT NULL DEFAULT '',
  delivery_status text NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('queued','sent','delivered','read','failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbox_messages_thread_idx ON public.inbox_messages (tenant_id, thread_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_external_uidx
  ON public.inbox_messages (tenant_id, external_message_id)
  WHERE external_message_id <> '';

CREATE TABLE IF NOT EXISTS public.social_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  content_item_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL,
  metric_date date NOT NULL,
  platform text NOT NULL,
  followers integer NOT NULL DEFAULT 0,
  reach integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  engagements integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, social_account_id, content_item_id, metric_date)
);
CREATE INDEX IF NOT EXISTS social_metrics_tenant_date_idx ON public.social_metrics (tenant_id, metric_date DESC, platform);

CREATE TABLE IF NOT EXISTS public.listening_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  brand_profile_id uuid REFERENCES public.brand_profiles(id) ON DELETE SET NULL,
  platform text NOT NULL,
  external_id text NOT NULL DEFAULT '',
  author_name text NOT NULL DEFAULT '',
  author_username text NOT NULL DEFAULT '',
  text text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  sentiment text NOT NULL DEFAULT 'neutral' CHECK (sentiment IN ('positive','neutral','negative','urgent')),
  mention_type text NOT NULL DEFAULT 'mention' CHECK (mention_type IN ('mention','comment','review','keyword')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listening_mentions_tenant_date_idx ON public.listening_mentions (tenant_id, occurred_at DESC, sentiment);
CREATE UNIQUE INDEX IF NOT EXISTS listening_mentions_external_uidx
  ON public.listening_mentions (tenant_id, platform, external_id)
  WHERE external_id <> '';

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand_profile_id uuid REFERENCES public.brand_profiles(id) ON DELETE CASCADE,
  created_by_member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  rule_type text NOT NULL CHECK (rule_type IN ('publicar_aprovado','responder_palavra','alertar_reclamacao','lembrar_aprovacao','alertar_desempenho','preencher_calendario')),
  active boolean NOT NULL DEFAULT true,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_rules_tenant_idx ON public.automation_rules (tenant_id, active, rule_type);

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  automation_rule_id uuid REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('success','skipped','failed')),
  message text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_runs_tenant_idx ON public.automation_runs (tenant_id, created_at DESC);

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listening_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.social_accounts, public.content_items, public.content_comments,
  public.inbox_threads, public.inbox_messages, public.social_metrics,
  public.listening_mentions, public.automation_rules, public.automation_runs
  FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.social_accounts, public.content_items, public.content_comments,
  public.inbox_threads, public.inbox_messages, public.social_metrics,
  public.listening_mentions, public.automation_rules, public.automation_runs
  TO service_role;

NOTIFY pgrst, 'reload schema';
