import { supabase } from '../config/supabaseClient';

export const SupportService = {
  /**
   * El odontologo envia un mensaje al administrador del sistema.
   * RLS garantiza que solo pueda insertar filas con su propio user_id.
   */
  async sendMessage(userId: string, subject: string, body: string): Promise<void> {
    const { error } = await supabase
      .from('support_messages')
      .insert({ user_id: userId, subject, body });

    if (error) throw error;
  },
};
