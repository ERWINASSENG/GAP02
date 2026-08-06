-- Migration: Accès complet pour les administrateurs aux opérations des utilisateurs
-- Date: 2026-07-18
-- Auteur: Expert Senior Angular & Supabase

-- 1. Nettoyage préventif des politiques existantes si déjà créées pour éviter les conflits
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
CREATE POLICY "Les administrateurs ont un accès complet en sélection sur les opérations" 
ON public.operations 
FOR SELECT 
TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Les administrateurs ont un accès complet en insertion sur les opérations" 
ON public.operations 
FOR INSERT 
TO authenticated 
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Les administrateurs ont un accès complet en modification sur les opérations" 
ON public.operations 
FOR UPDATE 
TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') 
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Les administrateurs ont un accès complet en suppression sur les opérations" 
ON public.operations 
FOR DELETE 
TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');


-- 3. Politiques pour la table `operation_items`
CREATE POLICY "Les administrateurs ont un accès complet en sélection sur les items d'opérations" 
ON public.operation_items 
FOR SELECT 
TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Les administrateurs ont un accès complet en insertion sur les items d'opérations" 
ON public.operation_items 
FOR INSERT 
TO authenticated 
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Les administrateurs ont un accès complet en modification sur les items d'opérations" 
ON public.operation_items 
FOR UPDATE 
TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') 
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Les administrateurs ont un accès complet en suppression sur les items d'opérations" 
ON public.operation_items 
FOR DELETE 
TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');


-- 4. Politiques pour la table `cahier_operations`
CREATE POLICY "Les administrateurs ont un accès complet en sélection sur le cahier d'opérations" 
ON public.cahier_operations 
FOR SELECT 
TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Les administrateurs ont un accès complet en insertion sur le cahier d'opérations" 
ON public.cahier_operations 
FOR INSERT 
TO authenticated 
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Les administrateurs ont un accès complet en modification sur le cahier d'opérations" 
ON public.cahier_operations 
FOR UPDATE 
TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') 
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Les administrateurs ont un accès complet en suppression sur le cahier d'opérations" 
ON public.cahier_operations 
FOR DELETE 
TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
