-- Agregar feature_config a bots para terminología configurable por negocio
ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS feature_config JSONB DEFAULT '{}'::jsonb;

-- Tabla para sesiones de demo (potenciales clientes que prueban el bot)
CREATE TABLE IF NOT EXISTS public.demo_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,

  -- Info del contacto
  contact_name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  business_description TEXT NOT NULL,
  contact_email TEXT,

  -- Config generada por IA
  bot_name TEXT,
  personality_prompt TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  feature_config JSONB DEFAULT '{}'::jsonb,
  allowed_tags TEXT[] DEFAULT '{}',
  business_summary TEXT,
  business_type TEXT,
  suggested_questions JSONB DEFAULT '[]'::jsonb,

  -- Estado
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'claimed', 'expired')),
  claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days')
);

-- Mensajes del chat de demo
CREATE TABLE IF NOT EXISTS public.demo_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.demo_sessions(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'bot')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS demo_sessions_token_idx ON public.demo_sessions(session_token);
CREATE INDEX IF NOT EXISTS demo_sessions_status_idx ON public.demo_sessions(status);
CREATE INDEX IF NOT EXISTS demo_messages_session_idx ON public.demo_messages(session_id);

-- RLS: demo_sessions y demo_messages son públicas para lectura/escritura via service role
-- No habilitamos RLS para que las API routes (admin client) puedan operar sin restricciones
-- Los endpoints de demo usan SUPABASE_SERVICE_ROLE_KEY
