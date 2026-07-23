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
app.post('/api/admin/users', async (req, res) => {
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

    const { email, password, displayName, role, assignedSiteName } = req.body;

    // Create the new user using the admin API
    const { data: createData, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        role: role || 'user',
        created_by: user.id,
        ...(assignedSiteName ? { assignedSiteName } : {})
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
    console.error('Error in POST /api/admin/users:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

// API: Récupérer les utilisateurs créés par cet administrateur (rôle administrateur requis)
app.get('/api/admin/users', async (req, res) => {
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
    console.error('Error in GET /api/admin/users:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

// API: Modifier le profil d'un utilisateur (rôle administrateur requis)
app.patch('/api/admin/users/:id', async (req, res) => {
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

    const { email, displayName, avatarUrl, role, assignedSiteName } = req.body ?? {};

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
    if (typeof avatarUrl !== 'string' || typeof assignedSiteName !== 'string') {
      res.status(400).json({ error: 'Les informations du profil sont invalides.' });
      return;
    }

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
        assignedSiteName: assignedSiteName.trim()
      }
    });

    if (updateError || !updateData.user) {
      res.status(400).json({ error: updateError?.message || 'La mise à jour du profil a échoué.' });
      return;
    }

    res.json({ success: true, user: updateData.user });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('Error in PATCH /api/admin/users/:id:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

// API: Récupérer toutes les opérations (rôle administrateur requis)
app.get('/api/admin/operations', async (req, res) => {
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
    console.error('Error in GET /api/admin/operations:', errMsg);
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
