-- =============================================================================
-- Contactos: dirección en lugar de correo, y categoría de seguimiento
--
-- El formulario de alta sustituye el campo de correo por una dirección postal:
-- en captura de campo se recoge dónde vive la persona, no su correo. La columna
-- email NO se elimina —hay contactos capturados con ella y borrarla perdería ese
-- dato de forma irreversible—, simplemente deja de ofrecerse en el formulario.
-- Cuando se confirme que no queda información útil ahí, se podrá retirar en una
-- migración aparte.
--
-- category clasifica al contacto en el seguimiento operativo: 'fidelizado' o
-- 'seguro'. Se valida con un CHECK para que la base rechace cualquier otro valor,
-- aunque llegue por la API y no por el formulario.
--
-- Ambas columnas nacen NULL-ables a propósito: ya existen filas capturadas antes
-- de este cambio y ponerlas NOT NULL abortaría la migración. La obligatoriedad se
-- aplica en el formulario (src/lib/validation.ts). Una vez categorizados los
-- contactos antiguos, se puede endurecer con:
--
--   ALTER TABLE public.contacts ALTER COLUMN category SET NOT NULL;
-- =============================================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS address  text,
  ADD COLUMN IF NOT EXISTS category text;

-- El CHECK admite NULL para no invalidar las filas previas al cambio.
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_category_valida;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_category_valida
  CHECK (category IS NULL OR category IN ('fidelizado', 'seguro'));

COMMENT ON COLUMN public.contacts.address IS
  'Dirección postal del contacto. Dato administrativo, sujeto al mismo '
  'consentimiento de almacenamiento que el resto de la ficha.';

COMMENT ON COLUMN public.contacts.category IS
  'Clasificación de seguimiento: fidelizado o seguro. NULL solo en contactos '
  'capturados antes de que el campo existiera.';

-- Filtrar el padrón por categoría es una de las consultas previstas del listado.
CREATE INDEX IF NOT EXISTS idx_contacts_category ON public.contacts(org_id, category);
