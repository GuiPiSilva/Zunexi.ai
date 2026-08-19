-- Índices de apoio para as FKs e consultas da Agência 360.
CREATE INDEX IF NOT EXISTS agency_projects_brand_idx ON public.agency_projects (brand_profile_id) WHERE brand_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agency_projects_owner_idx ON public.agency_projects (owner_member_id);
CREATE INDEX IF NOT EXISTS agency_workflows_brand_idx ON public.agency_workflows (brand_profile_id) WHERE brand_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agency_workflows_creator_idx ON public.agency_workflows (created_by_member_id);
CREATE INDEX IF NOT EXISTS agency_tasks_project_idx ON public.agency_tasks (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agency_tasks_assignee_idx ON public.agency_tasks (assigned_member_id) WHERE assigned_member_id IS NOT NULL;

-- Este índice era duplicado do UNIQUE constraint já existente.
DROP INDEX IF EXISTS public.credit_transactions_access_job_uidx;
