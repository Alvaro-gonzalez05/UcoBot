-- Stickers guardados por el negocio para reenviar luego.
-- Los media-id de Meta expiran (~30 días), por eso descargamos el .webp a
-- Supabase Storage (bucket 'chat-media') y guardamos acá el índice.

CREATE TABLE IF NOT EXISTS public.saved_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  mime_type TEXT DEFAULT 'image/webp',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.saved_stickers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_stickers_select_own" ON public.saved_stickers;
DROP POLICY IF EXISTS "saved_stickers_insert_own" ON public.saved_stickers;
DROP POLICY IF EXISTS "saved_stickers_delete_own" ON public.saved_stickers;

CREATE POLICY "saved_stickers_select_own" ON public.saved_stickers
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saved_stickers_insert_own" ON public.saved_stickers
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_stickers_delete_own" ON public.saved_stickers
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS saved_stickers_user_id_idx
  ON public.saved_stickers(user_id);

-- Bucket de Storage para medios del chat (stickers guardados, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  true,
  5242880, -- 5MB
  ARRAY['image/webp', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- RLS del bucket: cada usuario maneja su propia carpeta (primer segmento del path = user_id)
DROP POLICY IF EXISTS "Users can upload chat media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view chat media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own chat media" ON storage.objects;

CREATE POLICY "Users can upload chat media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view chat media" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-media');

CREATE POLICY "Users can delete their own chat media" ON storage.objects
  FOR DELETE USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);
