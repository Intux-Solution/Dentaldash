import { supabase } from '../config/supabaseClient';

export const OdontogramService = {
    /**
     * Obtiene el odontograma de un paciente
     * @param {string} patientId - UUID del paciente
     */
    async getOdontogram(patientId) {
        if (!patientId) return null;
        try {
            const { data, error } = await supabase
                .from('odontograms')
                .select('*')
                .eq('patient_id', patientId)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;
            return data;
        } catch (error) {
            console.error('Error fetching odontogram:', error);
            throw error;
        }
    },

    /**
     * Guarda o actualiza el odontograma de un paciente
     * @param {string} patientId - UUID del paciente
     * @param {Object} odontogramData - Datos de los dientes (JSON)
     */
    async saveOdontogram(patientId, odontogramData) {
        if (!patientId) throw new Error('Patient ID is required');
        try {
            const { data, error } = await supabase
                .from('odontograms')
                .upsert({
                    patient_id: patientId,
                    data: odontogramData,
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
