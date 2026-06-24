-- Uso de IA por llamada: modelo, tokens y costo estimado (USD). Para analítica de admin.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  model text,
  purpose text,                 -- chat | detection | classification | order | reservation
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Admins ven todo (mismo patrón que el resto del admin).
CREATE POLICY "admin_select_ai_usage" ON public.ai_usage FOR SELECT USING (is_admin());

CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON public.ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_user_idx ON public.ai_usage(user_id, created_at DESC);
