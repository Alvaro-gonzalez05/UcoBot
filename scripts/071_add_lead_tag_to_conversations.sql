-- Add lead_tag column to conversations for AI-based lead classification
-- Hot/cold temperature is computed from last_message_at, not stored
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS lead_tag TEXT;

-- Index for efficient lead queries per user
CREATE INDEX IF NOT EXISTS conversations_lead_tag_idx
  ON public.conversations(user_id, lead_tag)
  WHERE lead_tag IS NOT NULL;
