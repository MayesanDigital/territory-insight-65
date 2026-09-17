-- =============================================================================
-- Contactos: promotor y movilizador responsables
--
-- Cada contacto queda ligado a la persona del equipo que lo promueve y a la que
-- lo moviliza. Sirve para repartir y dar seguimiento a la cartera en campo: el
-- mapa desglosa cada sección por responsable y el listado filtra por ellos.
--
-- Se guardan como texto libre, tal como se pidió, y no como catálogo con llave
-- foránea. El coste es que "Juan Pérez" y "juan  perez" serían dos personas
-- distintas; para evitarlo, el formulario sugiere los nombres ya capturados y
-- normaliza espacios, y esta migración garantiza lo mismo en la base con un
-- CHECK que rechaza espacios sobrantes aunque el dato llegue por la API.
--
-- Ambas columnas admiten NULL: un contacto puede tener promotor sin movilizador,
-- al revés, o ninguno si se capturó antes de que el campo existiera.
-- =============================================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS promotor    text,
  ADD COLUMN IF NOT EXISTS movilizador text;

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_promotor_normalizado;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_promotor_normalizado CHECK (
    promotor IS NULL
    OR (promotor = btrim(promotor) AND promotor !~ '\s{2,}' AND length(promotor) BETWEEN 2 AND 120)
  );

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_movilizador_normalizado;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_movilizador_normalizado CHECK (
    movilizador IS NULL
    OR (movilizador = btrim(movilizador) AND movilizador !~ '\s{2,}' AND length(movilizador) BETWEEN 2 AND 120)
  );

COMMENT ON COLUMN public.contacts.promotor IS
  'Persona del equipo que promueve al contacto. Texto libre normalizado.';
COMMENT ON COLUMN public.contacts.movilizador IS
  'Persona del equipo que moviliza al contacto. Texto libre normalizado.';

-- Los filtros del listado combinan responsable y sección dentro de la
-- organización; estos índices cubren esas consultas.
CREATE INDEX IF NOT EXISTS idx_contacts_promotor
  ON public.contacts (org_id, promotor, section_code);
CREATE INDEX IF NOT EXISTS idx_contacts_movilizador
  ON public.contacts (org_id, movilizador, section_code);
