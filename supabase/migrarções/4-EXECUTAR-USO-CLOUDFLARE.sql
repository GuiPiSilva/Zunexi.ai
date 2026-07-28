-- Zunexi.ai — rastreamento estimado de uso do Cloudflare Workers AI
-- Execute este arquivo uma vez no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS public.cloudflare_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  model text NOT NULL,
  source text NOT NULL DEFAULT 'generation' CHECK (source IN ('generation', 'test')),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  has_reference boolean NOT NULL DEFAULT false,
  output_tiles integer NOT NULL CHECK (output_tiles > 0),
  input_tiles integer NOT NULL DEFAULT 0 CHECK (input_tiles >= 0),
  estimated_neurons numeric(12,2) NOT NULL CHECK (estimated_neurons >= 0)
);

CREATE INDEX IF NOT EXISTS cloudflare_ai_usage_created_at_idx
  ON public.cloudflare_ai_usage (created_at DESC);

ALTER TABLE public.cloudflare_ai_usage ENABLE ROW LEVEL SECURITY;

-- A aplicação acessa esta tabela somente pelo servidor usando a service role.
REVOKE ALL ON TABLE public.cloudflare_ai_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cloudflare_ai_usage TO service_role;
