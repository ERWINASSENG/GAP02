import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json());

// API: Créer un utilisateur via le serveur (rôle administrateur requis)
app.post('/api/system/collaborators', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Non autorisé' });
      return;
    }

    let supabaseUrl = process.env['SUPABASE_URL'];
    if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
      supabaseUrl = 'https://jwpigzkxkbszxzngfepn.supabase.co';
    }
    const supabaseServiceRole = process.env['SUPABASE_SERVICE_ROLE_KEY'];

    if (!supabaseServiceRole) {
      res.status(500).json({ error: 'La configuration du serveur est incomplète (SUPABASE_SERVICE_ROLE_KEY manquant).' });
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Verify the admin making the request
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = authData?.user;

    if (authError || !user || user.app_metadata?.['role'] !== 'admin') {
      res.status(403).json({ error: 'Privilèges administrateur requis.' });
      return;
    }

    const { email, password, displayName, role, assignedSiteName, assignedSiteNames } = req.body;
    const rawSitesInput: string[] = [];
    if (Array.isArray(assignedSiteNames)) {
      assignedSiteNames.forEach((s: unknown) => {
        if (typeof s === 'string') {
          s.split(',').forEach((sub: string) => {
            const t = sub.trim();
            if (t) rawSitesInput.push(t);
          });
        }
      });
    }
    if (typeof assignedSiteName === 'string') {
      assignedSiteName.split(',').forEach((sub: string) => {
        const t = sub.trim();
        if (t) rawSitesInput.push(t);
      });
    }
    const sitesList = Array.from(new Set(rawSitesInput));
    const primarySite = sitesList.length > 0 ? sitesList[0] : '';

    // Create the new user using the admin API
    const { data: createData, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        role: role || 'user',
        created_by: user.id,
        ...(primarySite ? { assignedSiteName: primarySite } : {}),
        assignedSiteNames: sitesList
      },
      user_metadata: {
        display_name: displayName,
        avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      }
    });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ success: true, user: createData.user });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('Error in POST /api/system/collaborators:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

// API: Récupérer les utilisateurs créés par cet administrateur (rôle administrateur requis)
app.get('/api/system/collaborators', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Non autorisé' });
      return;
    }

    let supabaseUrl = process.env['SUPABASE_URL'];
    if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
      supabaseUrl = 'https://jwpigzkxkbszxzngfepn.supabase.co';
    }
    const supabaseServiceRole = process.env['SUPABASE_SERVICE_ROLE_KEY'];

    if (!supabaseServiceRole) {
      res.status(500).json({ error: 'La configuration du serveur est incomplète (SUPABASE_SERVICE_ROLE_KEY manquant).' });
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Verify the admin making the request
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = authData?.user;

    if (authError || !user || user.app_metadata?.['role'] !== 'admin') {
      res.status(403).json({ error: 'Privilèges administrateur requis.' });
      return;
    }

    // Fetch all users
    const { data: listData, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error || !listData || !listData.users) {
      res.status(400).json({ error: error?.message || 'Failed to list users' });
      return;
    }

    // Filter users to return all except the admin making the request
    const createdUsers = listData.users.filter((u) => u.id !== user.id);

    res.json({ success: true, users: createdUsers });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('Error in GET /api/system/collaborators:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

// API: Modifier le profil d'un utilisateur (rôle administrateur requis)
app.patch('/api/system/collaborators/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Non autorisé' });
      return;
    }

    let supabaseUrl = process.env['SUPABASE_URL'];
    if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
      supabaseUrl = 'https://jwpigzkxkbszxzngfepn.supabase.co';
    }
    const supabaseServiceRole = process.env['SUPABASE_SERVICE_ROLE_KEY'];

    if (!supabaseServiceRole) {
      res.status(500).json({ error: 'La configuration du serveur est incomplète (SUPABASE_SERVICE_ROLE_KEY manquant).' });
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const adminUser = authData?.user;

    if (authError || !adminUser || adminUser.app_metadata?.['role'] !== 'admin') {
      res.status(403).json({ error: 'Privilèges administrateur requis.' });
      return;
    }

    const userId = req.params['id'];
    if (!userId || userId === adminUser.id) {
      res.status(400).json({ error: 'Utilisateur cible invalide.' });
      return;
    }

    const { email, displayName, avatarUrl, role, assignedSiteName, assignedSiteNames } = req.body ?? {};

    if (typeof email !== 'string' || !email.trim() || !email.includes('@')) {
      res.status(400).json({ error: 'Une adresse e-mail valide est requise.' });
      return;
    }
    if (typeof displayName !== 'string' || !displayName.trim()) {
      res.status(400).json({ error: 'Le nom complet est requis.' });
      return;
    }
    if (role !== 'admin' && role !== 'manager' && role !== 'user') {
      res.status(400).json({ error: 'Le rôle sélectionné est invalide.' });
      return;
    }
    if (typeof avatarUrl !== 'string') {
      res.status(400).json({ error: 'Les informations du profil sont invalides.' });
      return;
    }

    const rawUpdateSitesInput: string[] = [];
    if (Array.isArray(assignedSiteNames)) {
      assignedSiteNames.forEach((s: unknown) => {
        if (typeof s === 'string') {
          s.split(',').forEach((sub: string) => {
            const t = sub.trim();
            if (t) rawUpdateSitesInput.push(t);
          });
        }
      });
    }
    if (typeof assignedSiteName === 'string') {
      assignedSiteName.split(',').forEach((sub: string) => {
        const t = sub.trim();
        if (t) rawUpdateSitesInput.push(t);
      });
    }
    const sitesList = Array.from(new Set(rawUpdateSitesInput));
    const primarySiteName = sitesList.length > 0 ? sitesList[0] : '';

    const { data: existingUserData, error: existingUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (existingUserError || !existingUserData.user) {
      res.status(404).json({ error: 'Utilisateur introuvable.' });
      return;
    }

    const existingAppMetadata = existingUserData.user.app_metadata || {};
    if (existingAppMetadata['created_by'] !== adminUser.id) {
      res.status(403).json({ error: 'Vous ne pouvez modifier que les collaborateurs que vous avez créés.' });
      return;
    }

    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: email.trim(),
      user_metadata: {
        ...(existingUserData.user.user_metadata || {}),
        display_name: displayName.trim(),
        avatar_url: avatarUrl.trim()
      },
      app_metadata: {
        ...existingAppMetadata,
        role,
        assignedSiteName: primarySiteName,
        assignedSiteNames: sitesList
      }
    });

    if (updateError || !updateData.user) {
      res.status(400).json({ error: updateError?.message || 'La mise à jour du profil a échoué.' });
      return;
    }

    res.json({ success: true, user: updateData.user });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('Error in PATCH /api/system/collaborators/:id:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

// API: Récupérer toutes les opérations (rôle administrateur requis)
app.get('/api/system/operations', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Non autorisé' });
      return;
    }

    let supabaseUrl = process.env['SUPABASE_URL'];
    if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
      supabaseUrl = 'https://jwpigzkxkbszxzngfepn.supabase.co';
    }
    const supabaseServiceRole = process.env['SUPABASE_SERVICE_ROLE_KEY'];

    if (!supabaseServiceRole) {
      res.status(500).json({ error: 'La configuration du serveur est incomplète (SUPABASE_SERVICE_ROLE_KEY manquant).' });
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Verify the admin making the request
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = authData?.user;

    if (authError || !user || user.app_metadata?.['role'] !== 'admin') {
      res.status(403).json({ error: 'Privilèges administrateur requis.' });
      return;
    }

    // Fetch all operations with admin privileges
    const { data: operationsData, error } = await supabaseAdmin
      .from('operations')
      .select('*, operation_items(*)')
      .order('date', { ascending: false });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ success: true, operations: operationsData });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('Error in GET /api/system/operations:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

// API: Récupérer toutes les semaines de travail (pour Contournement RLS)
app.get('/api/cahier/weeks', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Non autorisé' });
      return;
    }
    const token = authHeader.replace('Bearer ', '');

    let supabaseUrl = process.env['SUPABASE_URL'];
    if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
      supabaseUrl = 'https://jwpigzkxkbszxzngfepn.supabase.co';
    }
    const supabaseServiceRole = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!supabaseServiceRole) {
      res.status(500).json({ error: 'Configuration serveur incomplète.' });
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) {
      res.status(401).json({ error: 'Utilisateur non authentifié.' });
      return;
    }

    const role = user.app_metadata?.['role'];
    const assignedSiteName = user.app_metadata?.['assignedSiteName'];
    const assignedSiteNames: string[] = Array.isArray(user.app_metadata?.['assignedSiteNames'])
      ? user.app_metadata['assignedSiteNames']
      : [];

    let query = supabaseAdmin.from('cahier_weeks').select('*').order('start_date', { ascending: false });

    if (role !== 'admin') {
      const allowedSites = Array.from(new Set(['AUTRE', assignedSiteName, ...assignedSiteNames].filter(Boolean))) as string[];
      if (allowedSites.length > 0) {
        query = query.in('site', allowedSites);
      }
    }

    const { data, error } = await query;

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ success: true, weeks: data || [] });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error';
    res.status(500).json({ error: errMsg });
  }
});

// API: Créer une semaine de travail (Contournement RLS si la politique Supabase rejette l'insertion directe)
app.post('/api/cahier/weeks', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Non autorisé' });
      return;
    }
    const token = authHeader.replace('Bearer ', '');

    let supabaseUrl = process.env['SUPABASE_URL'];
    if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
      supabaseUrl = 'https://jwpigzkxkbszxzngfepn.supabase.co';
    }
    const supabaseServiceRole = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!supabaseServiceRole) {
      res.status(500).json({ error: 'Configuration serveur incomplète.' });
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) {
      res.status(401).json({ error: 'Utilisateur non authentifié.' });
      return;
    }

    const role = user.app_metadata?.['role'];
    const assignedSiteName = user.app_metadata?.['assignedSiteName'];
    const assignedSiteNames: string[] = Array.isArray(user.app_metadata?.['assignedSiteNames'])
      ? user.app_metadata['assignedSiteNames']
      : [];

    function userCanAccessSite(site: string): boolean {
      return role === 'admin'
        || site === 'AUTRE'
        || site === assignedSiteName
        || assignedSiteNames.includes(site);
    }

    const { id, site, start_date, end_date, is_closed, user_id } = req.body;
    if (!site || !start_date || !end_date) {
      res.status(400).json({ error: 'Champs obligatoires manquants (site, start_date, end_date).' });
      return;
    }

    const cleanSite = (site as string).trim();

    if (!userCanAccessSite(cleanSite)) {
      res.status(403).json({ error: 'Accès refusé à ce site.' });
      return;
    }

    const weekPayload = {
      id: id || crypto.randomUUID(),
      site: cleanSite,
      start_date,
      end_date,
      is_closed: !!is_closed,
      user_id: user_id || user.id
    };

    const { data, error } = await supabaseAdmin
      .from('cahier_weeks')
      .insert([weekPayload])
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await supabaseAdmin
          .from('cahier_weeks')
          .select('*')
          .eq('site', cleanSite)
          .eq('start_date', start_date)
          .eq('end_date', end_date)
          .maybeSingle();
        if (existing) {
          res.json({ success: true, week: existing });
          return;
        }
      }
      res.status(400).json({ error: error.message, code: error.code });
      return;
    }

    res.json({ success: true, week: data || weekPayload });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error';
    res.status(500).json({ error: errMsg });
  }
});

// API: Modifier une semaine de travail (Contournement RLS)
app.patch('/api/cahier/weeks/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Non autorisé' });
      return;
    }
    const token = authHeader.replace('Bearer ', '');

    let supabaseUrl = process.env['SUPABASE_URL'];
    if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
      supabaseUrl = 'https://jwpigzkxkbszxzngfepn.supabase.co';
    }
    const supabaseServiceRole = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!supabaseServiceRole) {
      res.status(500).json({ error: 'Configuration serveur incomplète.' });
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) {
      res.status(401).json({ error: 'Utilisateur non authentifié.' });
      return;
    }

    const role = user.app_metadata?.['role'];
    const assignedSiteName = user.app_metadata?.['assignedSiteName'];
    const assignedSiteNames: string[] = Array.isArray(user.app_metadata?.['assignedSiteNames'])
      ? user.app_metadata['assignedSiteNames']
      : [];

    function userCanAccessSite(site: string): boolean {
      return role === 'admin'
        || site === 'AUTRE'
        || site === assignedSiteName
        || assignedSiteNames.includes(site);
    }

    const weekId = req.params.id;

    const { data: existingWeek } = await supabaseAdmin.from('cahier_weeks').select('site').eq('id', weekId).maybeSingle();
    if (!existingWeek || !userCanAccessSite(existingWeek.site)) {
      res.status(403).json({ error: 'Accès refusé à cette semaine.' });
      return;
    }

    const allowedFields = ['site', 'start_date', 'end_date', 'is_closed', 'closed_at'];
    const updates = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => allowedFields.includes(key))
    );

    const { data, error } = await supabaseAdmin
      .from('cahier_weeks')
      .update(updates)
      .eq('id', weekId)
      .select();

    if (error) {
      res.status(400).json({ error: error.message, code: error.code });
      return;
    }

    res.json({ success: true, week: data?.[0] });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error';
    res.status(500).json({ error: errMsg });
  }
});

// API: Marquer une semaine comme supprimée (Soft delete)
app.delete('/api/cahier/weeks/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Non autorisé' });
      return;
    }
    const token = authHeader.replace('Bearer ', '');

    let supabaseUrl = process.env['SUPABASE_URL'];
    if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
      supabaseUrl = 'https://jwpigzkxkbszxzngfepn.supabase.co';
    }
    const supabaseServiceRole = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!supabaseServiceRole) {
      res.status(500).json({ error: 'Configuration serveur incomplète.' });
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) {
      res.status(401).json({ error: 'Utilisateur non authentifié.' });
      return;
    }

    const role = user.app_metadata?.['role'];
    if (role !== 'admin') {
      res.status(403).json({ error: 'Seul un administrateur peut supprimer une semaine.' });
      return;
    }

    const weekId = req.params.id;

    let { data, error } = await supabaseAdmin
      .from('cahier_weeks')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString()
      })
      .eq('id', weekId)
      .select();

    if (error && (error.code === 'PGRST204' || error.message.includes('deleted_at'))) {
      const res1 = await supabaseAdmin
        .from('cahier_weeks')
        .update({ is_deleted: true })
        .eq('id', weekId)
        .select();
      data = res1.data;
      error = res1.error;
    }

    if (error && (error.code === 'PGRST204' || error.message.includes('is_deleted'))) {
      const res2 = await supabaseAdmin
        .from('cahier_weeks')
        .delete()
        .eq('id', weekId);
      if (!res2.error) {
        res.json({ success: true, week: { id: weekId, is_deleted: true } });
        return;
      }
      error = res2.error;
    }

    if (error) {
      res.status(400).json({ error: error.message, code: error.code });
      return;
    }

    res.json({ success: true, week: data?.[0] || { id: weekId, is_deleted: true } });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error';
    res.status(500).json({ error: errMsg });
  }
});

// API: Restaurer une semaine supprimée (Annuler la suppression - Administrateur)
app.post('/api/cahier/weeks/:id/restore', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Non autorisé' });
      return;
    }
    const token = authHeader.replace('Bearer ', '');

    let supabaseUrl = process.env['SUPABASE_URL'];
    if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
      supabaseUrl = 'https://jwpigzkxkbszxzngfepn.supabase.co';
    }
    const supabaseServiceRole = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!supabaseServiceRole) {
      res.status(500).json({ error: 'Configuration serveur incomplète.' });
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) {
      res.status(401).json({ error: 'Utilisateur non authentifié.' });
      return;
    }

    const role = user.app_metadata?.['role'];
    if (role !== 'admin') {
      res.status(403).json({ error: 'Seul un administrateur peut restaurer une semaine.' });
      return;
    }

    const weekId = req.params.id;

    let { data, error } = await supabaseAdmin
      .from('cahier_weeks')
      .update({
        is_deleted: false,
        deleted_at: null
      })
      .eq('id', weekId)
      .select();

    if (error && (error.code === 'PGRST204' || error.message.includes('deleted_at'))) {
      const res1 = await supabaseAdmin
        .from('cahier_weeks')
        .update({ is_deleted: false })
        .eq('id', weekId)
        .select();
      data = res1.data;
      error = res1.error;
    }

    if (error) {
      res.status(400).json({ error: error.message, code: error.code });
      return;
    }

    res.json({ success: true, week: data?.[0] || { id: weekId, is_deleted: false } });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error';
    res.status(500).json({ error: errMsg });
  }
});

// API 404 handler - empêche les requêtes API d'échouer sur le rendu HTML d'Angular
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ressource API non trouvée.' });
});

// API Error handler - garantit que toutes les erreurs d'API retournent du JSON
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use('/api', (err: Error & { status?: number }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Une erreur interne est survenue sur le serveur.'
  });
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  })
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next()
    )
    .catch(next);
});

/**
 * Fallback for unresolved routes (CSR)
 */
app.use((req, res) => {
  res.sendFile(resolve(browserDistFolder, 'index.html'));
});

/**
 * Global Error Handler
 */
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  void _next;
  const error = err instanceof Error ? err : new Error('Unknown server error');
  console.error('Server error:', error);
  res.status(500).send('Internal Server Error');
});

/**
 * Start the server if this file is run directly.
 */
if (process.env['NODE_ENV'] === 'production') {
  const port = process.env['PORT'] || 3000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * The request handler used by the Angular CLI (for dev server)
 */
export const reqHandler = createNodeRequestHandler(app);
