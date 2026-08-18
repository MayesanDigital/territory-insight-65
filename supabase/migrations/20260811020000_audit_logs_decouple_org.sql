-- =============================================================================
-- La auditoría deja de tener llave foránea hacia organizations
--
-- Con la FK, borrar una organización era imposible: el DELETE cascadea a
-- contacts y territorial_units, cuyos triggers AFTER DELETE insertan filas de
-- auditoría que apuntan a la organización que se está eliminando en ese mismo
-- statement. La FK rechaza esas inserciones y aborta toda la transacción.
--
--   ERROR: insert or update on table "audit_logs" violates foreign key
--          constraint "audit_logs_org_id_fkey"
--
-- Un registro de auditoría es un hecho histórico: describe algo que ocurrió, no
-- una relación viva con una fila que aún existe. Mantener integridad referencial
-- contra una tabla mutable es justamente lo que impide conservar el rastro de lo
-- que se borró. Por eso org_id pasa a ser un uuid sin FK, que es el patrón
-- habitual en tablas de auditoría.
-- =============================================================================

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_org_id_fkey;

-- Sin FK, el índice es lo único que sostiene el rendimiento de las políticas RLS
-- y de las consultas del panel de auditoría.
CREATE INDEX IF NOT EXISTS idx_audit_org ON public.audit_logs(org_id);

COMMENT ON COLUMN public.audit_logs.org_id IS
  'Organización a la que pertenecía el hecho auditado. Sin FK a propósito: el '
  'rastro debe sobrevivir al borrado de la organización.';

-- contact_history tiene el mismo problema por la misma razón.
ALTER TABLE public.contact_history DROP CONSTRAINT IF EXISTS contact_history_org_id_fkey;
CREATE INDEX IF NOT EXISTS idx_history_org ON public.contact_history(org_id);
