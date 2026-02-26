/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const EnvSchema = z.object({
    VITE_SUPABASE_URL: z.string().url("VITE_SUPABASE_URL debe ser una URL válida"),
    VITE_SUPABASE_ANON_KEY: z.string().min(1, "VITE_SUPABASE_ANON_KEY no puede estar vacío")
});

let validatedEnv;

try {
    validatedEnv = EnvSchema.parse({
        VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY
    });
} catch (error) {
    console.error('⚠️ [Supabase] Entorno no configurado correctamente. Faltan variables o son inválidas según Zod:', error);
    // Providing a dummy fallback solely to prevent the app from instantly crashing on import,
    // though the DB connections will predictably fail and UI will know how to handle it gracefully.
    validatedEnv = {
        VITE_SUPABASE_URL: 'https://dummy.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'dummy-key'
    };
}

const supabaseUrl: string = validatedEnv.VITE_SUPABASE_URL;
const supabaseAnonKey: string = validatedEnv.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
    },
});
