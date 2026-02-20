import { supabase } from '../config/supabaseClient';

export const EvolutionService = {
    async getHistory(patientId) {
        const { data, error } = await supabase
            .from('treatment_history')
            .select('*')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching treatment history:', error);
            throw error;
        }
        return data;
    },

    async addEntry({ patient_id, tooth_number, procedure_type, description }) {
        const { data, error } = await supabase
            .from('treatment_history')
            .insert([{
                patient_id,
                tooth_number,
                procedure_type,
                description
            }])
            .select()
            .single();

        if (error) {
            console.error('Error adding treatment history entry:', error);
            throw error;
        }
        return data;
    },

    async deleteEntry(id) {
        const { error } = await supabase
            .from('treatment_history')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting treatment history entry:', error);
            throw error;
        }
    },

    async updateEntry(id, { tooth_number, procedure_type, description }) {
        const { data, error } = await supabase
            .from('treatment_history')
            .update({
                tooth_number,
                procedure_type,
                description,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating treatment history entry:', error);
            throw error;
        }
        return data;
    }
};
