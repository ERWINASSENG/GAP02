-- Migration: Fix admin RLS to check both app_metadata and user_metadata
-- Date: 2026-07-19

DROP POLICY IF EXISTS "Les administrateurs ont un accès complet en sélection sur les opérations" ON public.operations;
DROP POLICY IF EXISTS "Les administrateurs ont un accès complet en insertion sur les opérations" ON public.operations;
DROP POLICY IF EXISTS "Les administrateurs ont un accès complet en modification sur les opérations" ON public.operations;
DROP POLICY IF EXISTS "Les administrateurs ont un accès complet en suppression sur les opérations" ON public.operations;

DROP POLICY IF EXISTS "Les administrateurs ont un accès complet en sélection sur les items d'opérations" ON public.operation_items;
DROP POLICY IF EXISTS "Les administrateurs ont un accès complet en insertion sur les items d'opérations" ON public.operation_items;
DROP POLICY IF EXISTS "Les administrateurs ont un accès complet en modification sur les items d'opérations" ON public.operation_items;
DROP POLICY IF EXISTS "Les administrateurs ont un accès complet en suppression sur les items d'opérations" ON public.operation_items;

DROP POLICY IF EXISTS "Les administrateurs ont un accès complet en sélection sur le cahier d'opérations" ON public.cahier_operations;
DROP POLICY IF EXISTS "Les administrateurs ont un accès complet en insertion sur le cahier d'opérations" ON public.cahier_operations;
DROP POLICY IF EXISTS "Les administrateurs ont un accès complet en modification sur le cahier d'opérations" ON public.cahier_operations;
DROP POLICY IF EXISTS "Les administrateurs ont un accès complet en suppression sur le cahier d'opérations" ON public.cahier_operations;

-- 2. Politiques pour la table `operations`
CREATE POLICY "Les administrateurs ont un accès complet en sélection sur les opérations" ON public.operations FOR SELECT TO authenticated USING (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'));
CREATE POLICY "Les administrateurs ont un accès complet en insertion sur les opérations" ON public.operations FOR INSERT TO authenticated WITH CHECK (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'));
CREATE POLICY "Les administrateurs ont un accès complet en modification sur les opérations" ON public.operations FOR UPDATE TO authenticated USING (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')) WITH CHECK (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'));
CREATE POLICY "Les administrateurs ont un accès complet en suppression sur les opérations" ON public.operations FOR DELETE TO authenticated USING (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'));

-- 3. Politiques pour la table `operation_items`
CREATE POLICY "Les administrateurs ont un accès complet en sélection sur les items d'opérations" ON public.operation_items FOR SELECT TO authenticated USING (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'));
CREATE POLICY "Les administrateurs ont un accès complet en insertion sur les items d'opérations" ON public.operation_items FOR INSERT TO authenticated WITH CHECK (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'));
CREATE POLICY "Les administrateurs ont un accès complet en modification sur les items d'opérations" ON public.operation_items FOR UPDATE TO authenticated USING (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')) WITH CHECK (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'));
CREATE POLICY "Les administrateurs ont un accès complet en suppression sur les items d'opérations" ON public.operation_items FOR DELETE TO authenticated USING (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'));

-- 4. Politiques pour la table `cahier_operations`
CREATE POLICY "Les administrateurs ont un accès complet en sélection sur le cahier d'opérations" ON public.cahier_operations FOR SELECT TO authenticated USING (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'));
CREATE POLICY "Les administrateurs ont un accès complet en insertion sur le cahier d'opérations" ON public.cahier_operations FOR INSERT TO authenticated WITH CHECK (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'));
CREATE POLICY "Les administrateurs ont un accès complet en modification sur le cahier d'opérations" ON public.cahier_operations FOR UPDATE TO authenticated USING (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')) WITH CHECK (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'));
CREATE POLICY "Les administrateurs ont un accès complet en suppression sur le cahier d'opérations" ON public.cahier_operations FOR DELETE TO authenticated USING (((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'));

-- 5. Fix Manager access (managers can edit/delete operations on their assigned site)
CREATE POLICY "Les managers peuvent modifier les opérations de leur site" ON public.operations FOR UPDATE TO authenticated 
USING (
  (((auth.jwt() -> 'app_metadata' ->> 'role') = 'manager') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'manager'))
  AND (site = (auth.jwt() -> 'app_metadata' ->> 'assignedSiteName') OR site = (auth.jwt() -> 'user_metadata' ->> 'assignedSiteName'))
)
WITH CHECK (
  (((auth.jwt() -> 'app_metadata' ->> 'role') = 'manager') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'manager'))
  AND (site = (auth.jwt() -> 'app_metadata' ->> 'assignedSiteName') OR site = (auth.jwt() -> 'user_metadata' ->> 'assignedSiteName'))
);

CREATE POLICY "Les managers peuvent supprimer les opérations de leur site" ON public.operations FOR DELETE TO authenticated 
USING (
  (((auth.jwt() -> 'app_metadata' ->> 'role') = 'manager') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'manager'))
  AND (site = (auth.jwt() -> 'app_metadata' ->> 'assignedSiteName') OR site = (auth.jwt() -> 'user_metadata' ->> 'assignedSiteName'))
);

-- And for operation_items:
CREATE POLICY "Les managers peuvent modifier les items de leur site" ON public.operation_items FOR UPDATE TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.operations o 
  WHERE o.id = operation_items.operation_id 
  AND (((auth.jwt() -> 'app_metadata' ->> 'role') = 'manager') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'manager'))
  AND (o.site = (auth.jwt() -> 'app_metadata' ->> 'assignedSiteName') OR o.site = (auth.jwt() -> 'user_metadata' ->> 'assignedSiteName'))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.operations o 
  WHERE o.id = operation_items.operation_id 
  AND (((auth.jwt() -> 'app_metadata' ->> 'role') = 'manager') OR ((auth.jwt() -> 'user_metadata' ->> 'role') = 'manager'))
  AND (o.site = (auth.jwt() -> 'app_metadata' ->> 'assignedSiteName') OR o.site = (auth.jwt() -> 'user_metadata' ->> 'assignedSiteName'))
));

