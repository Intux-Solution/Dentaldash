import { useQuery } from '@tanstack/react-query';
import { supabase } from '../config/supabaseClient';
import { queryKeys } from '../lib/queryKeys';

export interface ProfileSummary {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string | null;
    business_name: string | null;
}

/**
 * Perfil del dentista, cacheado por React Query.
 *
 * El `select` es la unión de lo que necesitan `Header` y `AuthContext`, que hasta
 * ahora hacían cada uno su propio fetch.
 *
 * Para refrescarlo tras editar el perfil:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.profile.detail(userId) })
 *
 * NOTA: no hay suscripción de realtime acá a propósito. `Header` tenía un canal
 * sobre `profiles`, pero la tabla NO está en la publicación `supabase_realtime`
 * (solo `appointments` lo está), así que ese canal nunca disparaba: era código
 * muerto y lo único que actualizaba el header era el `CustomEvent`
 * `profile:updated`. La invalidación explícita reemplaza a ambos.
 */
export function useProfile(userId?: string) {
    return useQuery<ProfileSummary | null, Error>({
        queryKey: queryKeys.profile.detail(userId ?? ''),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url, role, business_name')
                .eq('id', userId!)
                .maybeSingle();

            if (error) throw error;
            return data as ProfileSummary | null;
        },
        enabled: !!userId,
    });
}
