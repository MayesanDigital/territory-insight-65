-- =============================================================================
-- Almacenamiento para la fotografía de la candidatura
--
-- Hasta ahora la foto se capturaba pegando una URL externa. Eso obliga a alojar
-- la imagen en otro sitio y deja la ficha a merced de que ese enlace siga vivo.
-- Con un bucket propio, la campaña sube el archivo desde su dispositivo y la
-- imagen queda bajo el mismo proyecto que el resto de los datos.
--
-- El bucket es de LECTURA PÚBLICA a propósito: la fotografía de una candidatura
-- es material de campaña, se muestra en la cabecera de la aplicación y no revela
-- nada que no esté ya en la vía pública. La escritura sí queda restringida.
--
-- Aislamiento entre organizaciones: los archivos se guardan bajo una carpeta con
-- el id de la organización, y las políticas de escritura comprueban que esa
-- carpeta coincida con la del usuario. Sin eso, cualquier administrador podría
-- sobrescribir la foto de otra campaña alojada en el mismo proyecto.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'candidatos',
  'candidatos',
  true,
  5242880,  -- 5 MB: de sobra para un retrato y suficiente freno ante subidas por error
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Lectura: abierta, para que la cabecera pinte la imagen sin firmar cada URL.
DROP POLICY IF EXISTS "candidatos lectura publica" ON storage.objects;
CREATE POLICY "candidatos lectura publica" ON storage.objects
FOR SELECT
USING (bucket_id = 'candidatos');

-- Escritura: solo administradores y solo dentro de la carpeta de su organización.
DROP POLICY IF EXISTS "candidatos alta admin" ON storage.objects;
CREATE POLICY "candidatos alta admin" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'candidatos'
  AND public.can_admin()
  AND (storage.foldername(name))[1] = public.current_org()::text
);

DROP POLICY IF EXISTS "candidatos cambio admin" ON storage.objects;
CREATE POLICY "candidatos cambio admin" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'candidatos'
  AND public.can_admin()
  AND (storage.foldername(name))[1] = public.current_org()::text
)
WITH CHECK (
  bucket_id = 'candidatos'
  AND public.can_admin()
  AND (storage.foldername(name))[1] = public.current_org()::text
);

DROP POLICY IF EXISTS "candidatos baja admin" ON storage.objects;
CREATE POLICY "candidatos baja admin" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'candidatos'
  AND public.can_admin()
  AND (storage.foldername(name))[1] = public.current_org()::text
);
