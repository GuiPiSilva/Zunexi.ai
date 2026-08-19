-- Zunexi.ai — Central Agência 360
-- Estrutura de projetos, workflows de IA e tarefas operacionais.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.agency_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand_profile_id uuid REFERENCES public.brand_profiles(id) ON DELETE SET NULL,
  owner_member_id uuid NOT NULL REFERENCES public.tenant_members(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 180),
  objective text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  channels text NOT NULL DEFAULT '',
  budget text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agency_projects_tenant_idx ON public.agency_projects (tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.agency_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.agency_projects(id) ON DELETE CASCADE,
  brand_profile_id uuid REFERENCES public.brand_profiles(id) ON DELETE SET NULL,
  created_by_member_id uuid NOT NULL REFERENCES public.tenant_members(id) ON DELETE CASCADE,
  module text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 180),
  brief text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('generating','ready','failed','archived')),
  summary text NOT NULL DEFAULT '',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agency_workflows_tenant_idx ON public.agency_workflows (tenant_id, module, updated_at DESC);
CREATE INDEX IF NOT EXISTS agency_workflows_project_idx ON public.agency_workflows (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agency_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.agency_projects(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES public.agency_workflows(id) ON DELETE CASCADE,
  assigned_member_id uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  module text NOT NULL DEFAULT '',
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 220),
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','in_progress','review','done')),
  due_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agency_tasks_tenant_idx ON public.agency_tasks (tenant_id, status, priority, due_date);
CREATE INDEX IF NOT EXISTS agency_tasks_workflow_idx ON public.agency_tasks (workflow_id, created_at);

ALTER TABLE public.agency_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agency_projects, public.agency_workflows, public.agency_tasks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agency_projects, public.agency_workflows, public.agency_tasks TO service_role;

NOTIFY pgrst, 'reload schema';
