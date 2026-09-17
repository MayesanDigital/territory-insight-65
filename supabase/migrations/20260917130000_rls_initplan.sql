-- =============================================================================
-- Rendimiento de RLS: evaluar las funciones de sesión una vez por consulta
-- =============================================================================
-- Las políticas llamaban a current_org(), can_admin(), is_super_admin() y
-- auth.uid() directamente. Postgres las reevaluaba FILA POR FILA: cada llamada a
-- current_org() consulta profiles, y el listado de secciones (1,828 filas con
-- dos joins) tardaba 3.5 s por página solo en eso.
--
-- Envolverlas en (SELECT ...) convierte cada llamada en un InitPlan que se
-- calcula una sola vez por consulta. Es la recomendación de Supabase y NO cambia
-- qué filas ve nadie: las expresiones son idénticas, solo cambia cuándo se
-- evalúan. Se generó a partir de pg_policies para no dejar ninguna fuera.
--
-- Las políticas de storage.objects no se tocan: esa tabla pertenece a Supabase
-- y su volumen (fotos de candidatura) no justifica el cambio.
-- =============================================================================

ALTER POLICY "audit insert as self" ON public.audit_logs
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND (actor = ( SELECT auth.uid() ))));

ALTER POLICY "audit read by admins" ON public.audit_logs
  USING ((((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "candidato read in org" ON public.candidates
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "candidato write in org" ON public.candidates
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )));

ALTER POLICY "consents read in org" ON public.contact_consents
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "consents write in org" ON public.contact_consents
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )));

ALTER POLICY "history insert in org" ON public.contact_history
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )));

ALTER POLICY "history read in org" ON public.contact_history
  USING ((org_id = ( SELECT public.current_org() )));

ALTER POLICY "contacts read in org" ON public.contacts
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "contacts write in org" ON public.contacts
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )));

ALTER POLICY "demographics read in org" ON public.demographics
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "demographics write in org" ON public.demographics
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )));

ALTER POLICY "mention topics read in org" ON public.mention_topics
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "mention topics write in org" ON public.mention_topics
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )));

ALTER POLICY "runs read in org" ON public.monitor_runs
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "runs write in org" ON public.monitor_runs
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )));

ALTER POLICY "municipal demo read in org" ON public.municipal_demographics
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "municipal demo write in org" ON public.municipal_demographics
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )));

ALTER POLICY "pobreza municipal read in org" ON public.municipal_poverty
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "invitations managed by admins" ON public.organization_invitations
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )));

ALTER POLICY "invitations read in org" ON public.organization_invitations
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "org managed by super admin" ON public.organizations
  USING (( SELECT public.is_super_admin() ))
  WITH CHECK (( SELECT public.is_super_admin() ));

ALTER POLICY "org members read organization" ON public.organizations
  USING (((id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "org updated by admins" ON public.organizations
  USING (((id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )))
  WITH CHECK (((id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )));

ALTER POLICY "read own profile" ON public.profiles
  USING ((id = ( SELECT auth.uid() )));

ALTER POLICY "read profiles in same org" ON public.profiles
  USING (((org_id IS NOT NULL) AND (org_id = ( SELECT public.current_org() ))));

ALTER POLICY "update own profile" ON public.profiles
  USING ((id = ( SELECT auth.uid() )))
  WITH CHECK ((id = ( SELECT auth.uid() )));

ALTER POLICY "reports read in org" ON public.reports
  USING ((org_id = ( SELECT public.current_org() )));

ALTER POLICY "reports write in org" ON public.reports
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )));

ALTER POLICY "resultados read in org" ON public.section_election_results
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "resultados write in org" ON public.section_election_results
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )));

ALTER POLICY "metas read in org" ON public.section_goals
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "metas write in org" ON public.section_goals
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )));

ALTER POLICY "marginacion read in org" ON public.section_marginacion
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "sentiment read in org" ON public.sentiment_analysis
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "sentiment write in org" ON public.sentiment_analysis
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )));

ALTER POLICY "geometries read in org" ON public.territorial_geometries
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "geometries write in org" ON public.territorial_geometries
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )));

ALTER POLICY "units read in org" ON public.territorial_units
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "units write in org" ON public.territorial_units
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )));

ALTER POLICY "topics read in org" ON public.topics
  USING (((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "topics write in org" ON public.topics
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )));

ALTER POLICY "admins grant org roles" ON public.user_roles
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() ) AND (role <> 'SUPER_ADMIN'::app_role)))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() ) AND (role <> 'SUPER_ADMIN'::app_role)));

ALTER POLICY "admins read org roles" ON public.user_roles
  USING ((((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() )) OR ( SELECT public.is_super_admin() )));

ALTER POLICY "read own roles" ON public.user_roles
  USING ((user_id = ( SELECT auth.uid() )));

ALTER POLICY "mentions read in org" ON public.web_mentions
  USING ((org_id = ( SELECT public.current_org() )));

ALTER POLICY "mentions write in org" ON public.web_mentions
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )));

ALTER POLICY "monitors read in org" ON public.web_monitors
  USING ((org_id = ( SELECT public.current_org() )));

ALTER POLICY "monitors write in org" ON public.web_monitors
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )));

ALTER POLICY "sources read in org" ON public.web_sources
  USING ((org_id = ( SELECT public.current_org() )));

ALTER POLICY "sources write in org" ON public.web_sources
  USING (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )))
  WITH CHECK (((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_analyze() )));
