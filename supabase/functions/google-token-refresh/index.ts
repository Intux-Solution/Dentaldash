
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0"
import { getAccessTokenForUser } from "../_shared/google-calendar.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')?.trim()
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { headers: jsonHeaders, status: 500 })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { headers: jsonHeaders, status: 401 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    try {
        const token = authHeader.replace(/^Bearer\s+/, '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized / Invalid Token' }), { headers: jsonHeaders, status: 401 })
        }

        // El refresh token se resuelve server-side por user.id (profiles.google_refresh_token),
        // NUNCA se acepta el que mande el cliente: antes cualquier usuario autenticado podía
        // canjear el refresh_token de OTRO usuario simplemente mandándolo en el body.
        const result = await getAccessTokenForUser(supabase, user.id)
        if ('error' in result) {
            const status = result.error === 'not_configured' ? 500 : 401
            return new Response(JSON.stringify({ error: result.error, details: result.detail }), { headers: jsonHeaders, status })
        }

        return new Response(JSON.stringify({ access_token: result.token }), { headers: jsonHeaders, status: 200 })
    } catch (error) {
        console.error("google-token-refresh error:", error.message)
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: jsonHeaders, status: 500 }
        )
    }
})
