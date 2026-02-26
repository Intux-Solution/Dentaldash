/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const fallbackUrl = 'https://dummy.supabase.co';
const fallbackKey = 'dummy-key';

const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL as string || fallbackUrl;
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY as string || fallbackKey;

if (supabaseUrl === fallbackUrl || supabaseAnonKey === fallbackKey) {
    console.error(
        '⚠️ [Supabase] Entorno no configurado correctamente. ' +
        'Asegúrate de definir VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu archivo .env para evitar fallos en la aplicación.'
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
