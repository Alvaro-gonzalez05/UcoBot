-- El bucket chat-media guardaba solo imágenes hasta 5MB. Para poder persistir
-- también videos, audios y documentos entrantes/salientes de WhatsApp,
-- ampliamos el límite de tamaño y quitamos la restricción de tipos.
UPDATE storage.buckets
SET
  file_size_limit = 52428800,        -- 50MB
  allowed_mime_types = NULL          -- permitir cualquier tipo (imagen, video, audio, documento)
WHERE id = 'chat-media';
