import { supabase } from '../config/supabaseClient';

/**
 * InsuranceService
 * Responsable exclusivamente de la gestión de obras sociales (seguros médicos).
 * Extraído de PatientService para respetar el SRP (Single Responsibility Principle).
 */
export class InsuranceService {
    /**
     * Obtener lista única y combinada de todas las obras sociales:
     *  - Las configuradas en el perfil del dentista (accepted_insurances)
     *  - Las registradas en los pacientes (via RPC get_unique_insurances)
     */
    static async getAllUniqueInsurances(userId: string | null = null): Promise<string[]> {
        try {
            let profileInsurances: string[] = [];
            let uid = userId;

            if (!uid) {
                const { data: { session } } = await supabase.auth.getSession();
                uid = session?.user?.id ?? null;
            }

            if (uid) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('accepted_insurances')
                    .eq('id', uid)
                    .single();
                if (profile?.accepted_insurances) {
                    profileInsurances = profile.accepted_insurances;
                }
            }

            // Optimizado vía RPC. Hace SELECT DISTINCT en la BDD
            // previniendo cuellos de botella de memoria al enviar miles de filas al cliente.
            const { data: patientData, error } = await supabase
                .rpc('get_unique_insurances');

            if (error) throw error;

            const patientInsurances = (patientData ?? [])
                .map((p: any) => p.obra_social)
                .filter((val: unknown): val is string => !!val && String(val).trim() !== '');

            const combined = [...new Set([...profileInsurances, ...patientInsurances])];
            return combined.sort((a, b) => a.localeCompare(b));

        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            console.error('Error fetching unique insurances:', error);
            return [];
        }
    }
}
