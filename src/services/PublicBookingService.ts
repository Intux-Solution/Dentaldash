const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const EDGE_URL = `${SUPABASE_URL}/functions/v1/public-booking`;

async function call(action: string, params: Record<string, unknown> = {}) {
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Error en public-booking: ${action}`);
  return json;
}

export interface PublicDentistProfile {
  full_name: string | null;
  business_name: string | null;
  avatar_url: string | null;
  services: { id?: string; name: string; duration: number }[];
  accepted_insurances: string[];
  booking_slug: string | null;
}

export const PublicBookingService = {
  resolveSlug: (slug: string): Promise<{ user_id: string }> =>
    call('resolve_slug', { slug }),

  getProfile: (userId: string): Promise<PublicDentistProfile> =>
    call('get_profile', { user_id: userId }),

  getWorkingDays: (userId: string): Promise<number[]> =>
    call('get_working_days', { user_id: userId }),

  getSlots: (userId: string, date: string, duration: number): Promise<string[]> =>
    call('get_slots', { user_id: userId, date, duration }),

  checkSlug: async (slug: string, userId?: string | null): Promise<boolean> => {
    try {
      const data = await call('check_slug', { slug, user_id: userId ?? undefined });
      return data.available === true;
    } catch {
      return false;
    }
  },

  createAppointment: (params: {
    user_id: string;
    nombre: string;
    dni: string;
    telefono: string;
    email?: string;
    obra_social?: string;
    appointment_type: string;
    date: string;
    time: string;
    duration: number;
    notes?: string;
  }): Promise<{ ok: boolean; appointment_id: string }> =>
    call('create_appointment', params),
};
