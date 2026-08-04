import { useQuery } from '@tanstack/react-query';
import { supabase } from '../config/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

/**
 * Estado de la puesta en marcha del consultorio, para el checklist del Dashboard.
 *
 * No reutiliza `useSettings` a propósito: ese hook arrastra el polling de la
 * instancia de WhatsApp y varios `setState` dentro de su `queryFn`, efectos que
 * no tienen por qué correr desde el Dashboard. Acá alcanza con un fetch chico.
 */

export interface SetupItem {
    key: string;
    label: string;
    done: boolean;
    to: string;
}

const SETUP_QUERY_KEY = (userId: string) => ['setup-progress', userId] as const;

export function useSetupProgress() {
    const { session } = useAuth();
    const { canUse } = useSubscription();
    const userId = session?.user?.id;

    const { data, isLoading } = useQuery({
        queryKey: SETUP_QUERY_KEY(userId ?? ''),
        enabled: !!userId,
        // Sin caché entre visitas: el usuario va a Configuración, vuelve al
        // Dashboard y espera ver el checklist actualizado.
        staleTime: 0,
        queryFn: async () => {
            const [profileRes, schedulesRes, faqsRes] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('contact_phone, accepted_insurances, services, booking_slug, whatsapp_status')
                    .eq('id', userId)
                    .maybeSingle(),
                supabase.from('schedules').select('is_active').eq('user_id', userId),
                supabase.from('tenant_faqs').select('id').eq('tenant_id', userId).limit(1),
            ]);

            if (profileRes.error) throw profileRes.error;

            return {
                profile: profileRes.data,
                schedules: schedulesRes.data ?? [],
                faqs: faqsRes.data ?? [],
            };
        },
    });

    const profile = data?.profile;

    const allItems: (SetupItem & { featureKey?: string })[] = [
        {
            key: 'profile',
            label: 'Cargar el teléfono de contacto',
            done: !!profile?.contact_phone,
            to: '/configuracion?tab=profile',
        },
        {
            key: 'insurances',
            label: 'Agregar tus obras sociales',
            done: (profile?.accepted_insurances?.length ?? 0) > 0,
            to: '/configuracion?tab=insurances',
            featureKey: 'insurance_management',
        },
        {
            key: 'services',
            label: 'Definir tus tratamientos',
            done: (profile?.services?.length ?? 0) > 0,
            to: '/configuracion?tab=services',
            featureKey: 'services_config',
        },
        {
            key: 'schedule',
            label: 'Establecer tus horarios de atención',
            done: (data?.schedules ?? []).some((s: any) => s.is_active),
            to: '/configuracion?tab=schedule',
        },
        {
            key: 'booking',
            label: 'Activar tu link público de reservas',
            done: !!profile?.booking_slug,
            to: '/configuracion?tab=profile',
        },
        {
            key: 'whatsapp',
            label: 'Conectar WhatsApp',
            done: profile?.whatsapp_status === 'connected',
            to: '/configuracion?tab=whatsapp',
            featureKey: 'whatsapp_bot',
        },
        {
            key: 'faqs',
            label: 'Cargar tus preguntas frecuentes',
            done: (data?.faqs ?? []).length > 0,
            to: '/configuracion?tab=faqs',
            featureKey: 'faqs_config',
        },
    ];

    // El denominador cuenta sólo lo que el usuario puede hacer con su plan: un
    // "3 de 7" que nunca llega a 7 no es un checklist, es un recordatorio de
    // lo que no compró.
    const items = allItems.filter((i) => !i.featureKey || canUse(i.featureKey));
    const completed = items.filter((i) => i.done).length;

    return {
        items,
        completed,
        total: items.length,
        isComplete: items.length > 0 && completed === items.length,
        isLoading,
    };
}
