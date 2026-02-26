import { supabase } from '../config/supabaseClient';
import { OdontogramSchema, OdontogramData } from '../schemas/odontogram.schema';

export const OdontogramService = {
    /**
     * Obtiene el odontograma de un paciente
     * @param patientId UUID del paciente
     */
    async getOdontogram(patientId: string) {
        if (!patientId) return null;
        try {
            const { data, error } = await supabase
                .from('odontograms')
                .select('*')
                .eq('patient_id', patientId)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;

            if (data && data.data) {
                // Parseamos usando Zod para garantizar que la UI no reciba basura
                const result = OdontogramSchema.safeParse(data.data);
                if (result.success) {
                    return { ...data, data: result.data };
                } else {
                    console.error("Zod Validation Error en getOdontogram:", result.error);
                    // Retornar objeto vació si se corrompió
                    return { ...data, data: {} };
                }
            }

            return data;
        } catch (error) {
            console.error('Error fetching odontogram:', error);
            throw error;
        }
    },

    /**
     * Guarda o actualiza el odontograma de un paciente
     * @param patientId UUID del paciente
     * @param odontogramData Datos de los dientes validados por Zod
     */
    async saveOdontogram(patientId: string, odontogramData: OdontogramData) {
        if (!patientId) throw new Error('Patient ID is required');

        // Validamos la info de salida para evitar gurdar data corrupta
        const validatedData = OdontogramSchema.parse(odontogramData);

        try {
            const { data, error } = await supabase
                .from('odontograms')
                .upsert({
                    patient_id: patientId,
                    data: validatedData,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'patient_id' })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error saving odontogram:', error);
            throw error;
        }
    }
};
