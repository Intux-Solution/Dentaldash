/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        '[supabaseClient] Faltan variables de entorno críticas. ' +
        'Asegúrate de definir VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu archivo .env'
    );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
    },
});
