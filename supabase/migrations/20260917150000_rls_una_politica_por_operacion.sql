-- =============================================================================
-- Rendimiento de RLS: una sola política por operación
-- =============================================================================
-- Cada tabla tenía dos políticas permisivas para SELECT: la de lectura y la de
-- escritura declarada FOR ALL. Postgres evalúa ambas en cada consulta de
-- lectura, y la segunda además llama a can_admin()/can_analyze() sin que sirva
-- para nada: leer nunca dependió de poder escribir.
--
-- Se sustituye cada política FOR ALL por tres, una por operación de escritura.
-- Los permisos no cambian: quien podía escribir sigue pudiendo, con la misma
-- condición, y quien solo lee deja de pagar la comprobación de escritura.
-- =============================================================================

DROP POLICY IF EXISTS "candidato write in org" ON public.candidates;
CREATE POLICY "candidato write in org insert" ON public.candidates
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "candidato write in org update" ON public.candidates
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "candidato write in org delete" ON public.candidates
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));

DROP POLICY IF EXISTS "consents write in org" ON public.contact_consents;
CREATE POLICY "consents write in org insert" ON public.contact_consents
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "consents write in org update" ON public.contact_consents
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "consents write in org delete" ON public.contact_consents
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));

DROP POLICY IF EXISTS "contacts write in org" ON public.contacts;
CREATE POLICY "contacts write in org insert" ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "contacts write in org update" ON public.contacts
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "contacts write in org delete" ON public.contacts
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));

DROP POLICY IF EXISTS "demographics write in org" ON public.demographics;
CREATE POLICY "demographics write in org insert" ON public.demographics
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "demographics write in org update" ON public.demographics
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "demographics write in org delete" ON public.demographics
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));

DROP POLICY IF EXISTS "mention topics write in org" ON public.mention_topics;
CREATE POLICY "mention topics write in org insert" ON public.mention_topics
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "mention topics write in org update" ON public.mention_topics
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "mention topics write in org delete" ON public.mention_topics
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));

DROP POLICY IF EXISTS "runs write in org" ON public.monitor_runs;
CREATE POLICY "runs write in org insert" ON public.monitor_runs
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "runs write in org update" ON public.monitor_runs
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "runs write in org delete" ON public.monitor_runs
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));

DROP POLICY IF EXISTS "municipal demo write in org" ON public.municipal_demographics;
CREATE POLICY "municipal demo write in org insert" ON public.municipal_demographics
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "municipal demo write in org update" ON public.municipal_demographics
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "municipal demo write in org delete" ON public.municipal_demographics
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));

DROP POLICY IF EXISTS "invitations managed by admins" ON public.organization_invitations;
CREATE POLICY "invitations managed by admins insert" ON public.organization_invitations
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "invitations managed by admins update" ON public.organization_invitations
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "invitations managed by admins delete" ON public.organization_invitations
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));

DROP POLICY IF EXISTS "org managed by super admin" ON public.organizations;
CREATE POLICY "org managed by super admin insert" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
CREATE POLICY "org managed by super admin update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (( SELECT is_super_admin() AS is_super_admin))
  WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
CREATE POLICY "org managed by super admin delete" ON public.organizations
  FOR DELETE TO authenticated
  USING (( SELECT is_super_admin() AS is_super_admin));

DROP POLICY IF EXISTS "reports write in org" ON public.reports;
CREATE POLICY "reports write in org insert" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "reports write in org update" ON public.reports
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "reports write in org delete" ON public.reports
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));

DROP POLICY IF EXISTS "resultados write in org" ON public.section_election_results;
CREATE POLICY "resultados write in org insert" ON public.section_election_results
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "resultados write in org update" ON public.section_election_results
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "resultados write in org delete" ON public.section_election_results
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));

DROP POLICY IF EXISTS "metas write in org" ON public.section_goals;
CREATE POLICY "metas write in org insert" ON public.section_goals
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "metas write in org update" ON public.section_goals
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "metas write in org delete" ON public.section_goals
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));

DROP POLICY IF EXISTS "sentiment write in org" ON public.sentiment_analysis;
CREATE POLICY "sentiment write in org insert" ON public.sentiment_analysis
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "sentiment write in org update" ON public.sentiment_analysis
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "sentiment write in org delete" ON public.sentiment_analysis
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));

DROP POLICY IF EXISTS "geometries write in org" ON public.territorial_geometries;
CREATE POLICY "geometries write in org insert" ON public.territorial_geometries
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "geometries write in org update" ON public.territorial_geometries
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "geometries write in org delete" ON public.territorial_geometries
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));

DROP POLICY IF EXISTS "units write in org" ON public.territorial_units;
CREATE POLICY "units write in org insert" ON public.territorial_units
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "units write in org update" ON public.territorial_units
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));
CREATE POLICY "units write in org delete" ON public.territorial_units
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin)));

DROP POLICY IF EXISTS "topics write in org" ON public.topics;
CREATE POLICY "topics write in org insert" ON public.topics
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "topics write in org update" ON public.topics
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "topics write in org delete" ON public.topics
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));

DROP POLICY IF EXISTS "admins grant org roles" ON public.user_roles;
CREATE POLICY "admins grant org roles insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin) AND (role <> 'SUPER_ADMIN'::app_role)));
CREATE POLICY "admins grant org roles update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin) AND (role <> 'SUPER_ADMIN'::app_role)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin) AND (role <> 'SUPER_ADMIN'::app_role)));
CREATE POLICY "admins grant org roles delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_admin() AS can_admin) AND (role <> 'SUPER_ADMIN'::app_role)));

DROP POLICY IF EXISTS "mentions write in org" ON public.web_mentions;
CREATE POLICY "mentions write in org insert" ON public.web_mentions
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "mentions write in org update" ON public.web_mentions
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "mentions write in org delete" ON public.web_mentions
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));

DROP POLICY IF EXISTS "monitors write in org" ON public.web_monitors;
CREATE POLICY "monitors write in org insert" ON public.web_monitors
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "monitors write in org update" ON public.web_monitors
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "monitors write in org delete" ON public.web_monitors
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));

DROP POLICY IF EXISTS "sources write in org" ON public.web_sources;
CREATE POLICY "sources write in org insert" ON public.web_sources
  FOR INSERT TO authenticated
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "sources write in org update" ON public.web_sources
  FOR UPDATE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)))
  WITH CHECK (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
CREATE POLICY "sources write in org delete" ON public.web_sources
  FOR DELETE TO authenticated
  USING (((org_id = ( SELECT current_org() AS current_org)) AND ( SELECT can_analyze() AS can_analyze)));
