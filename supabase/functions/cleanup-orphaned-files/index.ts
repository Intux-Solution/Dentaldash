import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Server-to-server: la dispara el cron job de pg_cron vía net.http_post, no un
// navegador. No hay Origin ni preflight, así que los headers de CORS no aportan
// nada. Se mantiene la constante porque las respuestas la esparcen.
const corsHeaders: Record<string, string> = {}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Autorización real: verify_jwt acepta la anon key (pública), así que se exige
  // además un secreto que solo conocen el cron job y el operador.
  const CLEANUP_SECRET = Deno.env.get('CLEANUP_SECRET')?.trim();
  if (!CLEANUP_SECRET || req.headers.get('x-cleanup-secret') !== CLEANUP_SECRET) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // IMPORTANT: Use Service Role for admin bypass
    )

    // Parse request body for optional config (like olderThanDays)
    let olderThanDays = 30; // Default to 30 days
    try {
      const body = await req.json();
      if (body?.olderThanDays !== undefined) {
        olderThanDays = Number(body.olderThanDays);
      }
    } catch (_e) {
      // Body might be empty, that's fine
    }
    // Piso duro: nunca borrar archivos con menos de 7 días de antigüedad,
    // para no pisar subidas en tránsito (el upload ocurre antes del INSERT en DB).
    if (!Number.isFinite(olderThanDays) || olderThanDays < 7) {
      olderThanDays = 7;
    }

    console.log(`Starting orphaned files cleanup. Target: older than ${olderThanDays} days`);

    // 2. Get all clinical_records_urls currently in use by patients
    const { data: patients, error: patientsError } = await supabaseClient
      .from('patients')
      .select('historia_clinica_url, consentimiento_url')

    if (patientsError) throw patientsError

    // Extract just the paths that we care about from the URL/Paths
    // As per PatientService, the history comes as "<uuid>/<file_name>" usually, or an HTTP url.
    // If it's a full URL, we extract the path.
    const baseUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/clinical-records/`;

    const activeFilePaths = new Set(
      patients
        .flatMap(p => [p.historia_clinica_url, p.consentimiento_url])
        .filter(Boolean)
        .map(url => url.startsWith(baseUrl) ? url.replace(baseUrl, '') : url) // Remove base URL if present
        .map(url => url.split('?')[0]) // Remove query params if any
    );

    console.log(`Found ${activeFilePaths.size} active file references in the patients table.`);

    let totalDeleted = 0;

    // 3. List files in the storage bucket.
    // Note: storage.list() is paginated. If you have many users/files, you need to paginate through folders (users)
    // Since we organize by user_id/file.ext, let's first get the folders (user IDs)
    const { data: userFolders, error: lsError } = await supabaseClient.storage.from('clinical-records').list('', { limit: 1000 })
    if (lsError) throw lsError

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - olderThanDays);

    for (const folder of userFolders || []) {
      // Skip files at root and look into folders
      if (folder.id === null) continue; // This means it's a folder in the storage API response

      const folderName = folder.name;

      const { data: filesInFolder, error: filesError } = await supabaseClient.storage.from('clinical-records').list(folderName, { limit: 1000 })
      if (filesError) continue;

      const filesToDelete = [];

      for (const file of filesInFolder || []) {
        if (file.name === '.emptyFolderPlaceholder') continue; // Standard Supabase placeholder

        const filePath = `${folderName}/${file.name}`;

        // 4. Check if the file is in activeFilePaths
        if (!activeFilePaths.has(filePath)) {
          // File is orphaned. Now check its age
          const fileDate = new Date(file.created_at);
          if (fileDate < thresholdDate) {
            filesToDelete.push(filePath);
          }
        }
      }

      // 5. Delete the orphaned files in this folder
      if (filesToDelete.length > 0) {
        console.log(`Deleting ${filesToDelete.length} files in folder ${folderName}...`);
        const { error: deleteError } = await supabaseClient.storage.from('clinical-records').remove(filesToDelete)

        if (deleteError) {
          console.error(`Error deleting files in ${folderName}:`, deleteError);
        } else {
          totalDeleted += filesToDelete.length;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Cleanup completed. Deleted ${totalDeleted} orphaned files.`,
      deletedCount: totalDeleted
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error during cleanup:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
