import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resolveAvatarUrl } from '../../utils/avatar';
import { GOOGLE_OAUTH_SCOPES } from '../../config/google';
import { GoogleCalendarService } from '../../services/GoogleCalendarService';
import { queryKeys } from '../../lib/queryKeys';

// Interface definitions (Partial based on usage)
/** Servicio/tratamiento ofrecido. Vive en `profiles.services` (jsonb). */
export interface Service {
    id: string;
    name: string;
    /** Duración estimada en minutos; determina el largo del slot. */
    duration: number;
    price?: number;
}

export interface ProfileData {
    full_name: string;
    avatar_url: string | null;
    user_id: string | null;
    accepted_insurances: string[];
    /** jsonb: array de objetos, no de strings. */
    services: Service[];
    contact_phone: string;
    business_name: string;
    whatsapp_instance: string | null;
    whatsapp_status: string;
    system_prompt: string;
    apikey_evolution: string;
    notification_phone: string;
    booking_slug: string | null;
    /** Kill-switch del chatbot: apaga las respuestas automáticas sin desconectar. */
    bot_enabled: boolean;
    [key: string]: any;
}

export interface ScheduleData {
    id: number;
    user_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_active: boolean;
}

export interface FaqData {
    id: number;
    tenant_id: string;
    question: string;
    answer: string;
    created_at: string;
}

export function useSettings(session: any = null) {
    const queryClient = useQueryClient();

    // UI/Connection States (kept local as they are highly interactive/ephemeral)
    const [googleAvatar, setGoogleAvatar] = useState<string | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [qrCodeData, setQrCodeData] = useState<string | null>(null);
    const [instanceStatus, setInstanceStatus] = useState<string>('disconnected');
    const [pollingActive, setPollingActive] = useState(false);
    // Contadores del polling en refs: si vivieran en el state, `checkConnectionStatus`
    // se recrearía en cada tick y el `setInterval` se reiniciaría a mitad de ciclo.
    const pollErrorCountRef = useRef(0);
    const pollTicksRef = useRef(0);

    const userId = session?.user?.id;

    /**
     * `supabase.functions.invoke` envuelve cualquier respuesta no-2xx en un
     * FunctionsHttpError cuyo `message` es el genérico "Edge Function returned a
     * non-2xx status code"; el cuerpo real está en `err.context`.
     */
    const edgeErrorMessage = async (err: any, fallback: string): Promise<string> => {
        try {
            const body = await err?.context?.json?.();
            return body?.error || body?.message || err?.message || fallback;
        } catch {
            return err?.message || fallback;
        }
    };

    // --- QUERY: FETCH SETTINGS ---
    const {
        data: settingsData,
        isLoading: loading,
        error: queryError,
    } = useQuery({
        queryKey: queryKeys.settings.detail(userId ?? ''),
        queryFn: async () => {
            if (!userId) throw new Error("No user ID");

            const user = session?.user;
            const sessionName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email;
            const sessionAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

            if (sessionAvatar) {
                setGoogleAvatar(sessionAvatar);
            }

            // Fetch Profile
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (profileError) throw profileError;

            let mergedProfile: ProfileData;
            if (profileData) {
                mergedProfile = {
                    full_name: profileData.full_name || sessionName,
                    avatar_url: profileData.avatar_url,
                    user_id: userId,
                    accepted_insurances: profileData.accepted_insurances || [],
                    services: profileData.services || [],
                    contact_phone: profileData.contact_phone || '',
                    business_name: profileData.business_name || 'Mi Consultorio',
                    whatsapp_instance: profileData.whatsapp_instance,
                    whatsapp_status: profileData.whatsapp_status || 'disconnected',
                    system_prompt: profileData.system_prompt || '',
                    apikey_evolution: profileData.apikey_evolution || '',
                    notification_phone: profileData.notification_phone || '',
                    booking_slug: profileData.booking_slug || null,
                    // `!== false`, no `?? true`: si el frontend se despliega antes de
                    // la migración la columna llega undefined y el toggle queda en ON,
                    // que es como lo interpreta el backend (`bot_enabled === false`).
                    bot_enabled: profileData.bot_enabled !== false,
                };
                setInstanceStatus(mergedProfile.whatsapp_status);

                // Sólo reanudar el polling si además quedó una instancia: un
                // `connecting` sin instancia es basura de un intento fallido.
                if (mergedProfile.whatsapp_status === 'connecting' && mergedProfile.whatsapp_instance) {
                    pollErrorCountRef.current = 0;
                    pollTicksRef.current = 0;
                    setPollingActive(true);
                }

                setAvatarPreview(resolveAvatarUrl(profileData.avatar_url));
            } else {
                mergedProfile = {
                    full_name: sessionName,
                    avatar_url: null,
                    user_id: userId,
                    accepted_insurances: [],
                    services: [],
                    contact_phone: '',
                    business_name: 'Mi Consultorio',
                    whatsapp_instance: null,
                    whatsapp_status: 'disconnected',
                    system_prompt: '',
                    apikey_evolution: '',
                    notification_phone: '',
                    booking_slug: null,
                    bot_enabled: true,
                };
            }

            // Fetch Schedules
            const { data: scheduleData, error: scheduleError } = await supabase
                .from('schedules')
                .select('*')
                .eq('user_id', userId)
                .order('day_of_week')
                .order('start_time');

            if (scheduleError) throw scheduleError;

            // Fetch FAQs
            const { data: faqData, error: faqError } = await supabase
                .from('tenant_faqs')
                .select('*')
                .eq('tenant_id', userId)
                .order('created_at');

            if (faqError) throw faqError;

            return {
                profile: mergedProfile,
                schedules: (scheduleData as ScheduleData[]) || [],
                faqs: (faqData as FaqData[]) || [],
                // Solo exponemos el booleano, nunca el token al cliente
                googleConnected: !!profileData?.google_refresh_token,
            };
        },
        enabled: !!userId,
    });

    const profile = settingsData?.profile || ({} as ProfileData);
    const schedules = settingsData?.schedules || [];
    const faqs = settingsData?.faqs || [];
    const googleConnected = settingsData?.googleConnected ?? false;

    // --- MUTATIONS ---

    // 1. Update Profile Mutation
    const updateProfileMutation = useMutation({
        mutationFn: async (updates: Partial<ProfileData>) => {
            if (!userId) throw new Error("No user ID");
            const { error } = await supabase
                .from('profiles')
                .update({ ...updates, updated_at: new Date() })
                .eq('id', userId);
            if (error) throw error;
            return updates;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail(userId ?? '') });
            // El Header lee el perfil por su propia key: invalidar ambas reemplaza al
            // `CustomEvent('profile:updated')` que había acá.
            queryClient.invalidateQueries({ queryKey: queryKeys.profile.detail(userId ?? '') });
            message.success('Perfil actualizado correctamente');
        },
        onError: (err: any) => {
            console.error('Profile update error:', err);
            message.error('Error al actualizar el perfil');
        }
    });

    // 2. Avatar Update Mutation
    const updateAvatarMutation = useMutation({
        mutationFn: async (file: File) => {
            if (!userId) throw new Error("No user ID");
            const fileName = `${userId}-${Math.random()}.${file.name.split('.').pop()}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, file);
            if (uploadError) throw uploadError;

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: fileName, updated_at: new Date() })
                .eq('id', userId);
            if (updateError) throw updateError;

            return fileName;
        },
        onSuccess: (fileName) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail(userId ?? '') });
            queryClient.invalidateQueries({ queryKey: queryKeys.profile.detail(userId ?? '') });
            setAvatarPreview(resolveAvatarUrl(fileName));
            message.success('Avatar actualizado');
        },
        onError: (err: any) => {
            console.error('Avatar update error:', err);
            message.error('Error al subir avatar: ' + err.message);
        }
    });

    /** Escribe `whatsapp_instance` en la caché para que el polling no quede sin nombre. */
    const patchCachedInstance = useCallback((instanceName: string | null) => {
        queryClient.setQueryData(queryKeys.settings.detail(userId ?? ''), (oldData: any) => {
            if (!oldData) return oldData;
            return {
                ...oldData,
                profile: { ...oldData.profile, whatsapp_instance: instanceName }
            };
        });
    }, [queryClient, userId]);

    // 3. Connect WhatsApp Mutation
    // La Edge Function devuelve siempre { status, instanceName, qr, message? }:
    // `status: 'error'` viaja con HTTP 200 para que el motivo real llegue al usuario.
    const connectWhatsAppMutation = useMutation({
        mutationFn: async () => {
            if (!userId) throw new Error("No user ID");
            const { data, error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'create', tenant_id: userId }
            });
            if (error) throw error;
            if (data?.status === 'error') throw new Error(data.message || 'Evolution API rechazó la conexión.');
            return data;
        },
        onSuccess: (data) => {
            pollErrorCountRef.current = 0;
            pollTicksRef.current = 0;
            setQrCodeData(data?.qr ?? null);
            if (data?.instanceName) patchCachedInstance(data.instanceName);

            if (data?.status === 'connected') {
                setInstanceStatus('connected');
                setPollingActive(false);
                setQrCodeData(null);
                message.success('WhatsApp ya estaba conectado.');
            } else {
                setInstanceStatus('connecting');
                setPollingActive(true);
                message.success('Escaneá el código QR con WhatsApp.');
            }
            queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail(userId ?? '') });
        },
        onError: async (err: any) => {
            console.error('Connect WhatsApp error:', err);
            // Revertir: sin esto el botón queda deshabilitado en "Esperando conexión...".
            setPollingActive(false);
            setInstanceStatus('disconnected');
            setQrCodeData(null);
            message.error('Error al conectar WhatsApp: ' + await edgeErrorMessage(err, 'error desconocido'));
        }
    });

    // 4. Disconnect WhatsApp Mutation (también es el "Cancelar" del QR)
    const disconnectWhatsAppMutation = useMutation({
        mutationFn: async () => {
            if (!userId) throw new Error("No user ID");
            const { error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'logout', tenant_id: userId }
            });
            if (error) throw error;
            return true;
        },
        // La limpieza va en onSettled: aunque el logout falle, el usuario tiene que
        // poder salir del estado "conectando" y volver a intentar.
        onSettled: () => {
            setInstanceStatus('disconnected');
            setPollingActive(false);
            setQrCodeData(null);
            pollErrorCountRef.current = 0;
            pollTicksRef.current = 0;
            patchCachedInstance(null);
            queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail(userId ?? '') });
        },
        onSuccess: () => {
            message.success('WhatsApp desconectado correctamente.');
        },
        onError: async (err: any) => {
            console.error('Disconnect WhatsApp error:', err);
            message.error('Error al desconectar: ' + await edgeErrorMessage(err, 'error desconocido'));
        }
    });

    // 4.b Disconnect Google Calendar Mutation
    const disconnectGoogleMutation = useMutation({
        mutationFn: async () => {
            if (!userId) throw new Error("No user ID");
            // Limpiar el refresh token para que la app deje de sincronizar
            const { error } = await supabase
                .from('profiles')
                .update({ google_refresh_token: null })
                .eq('id', userId);
            if (error) throw error;

            // Desvincular la identidad de Google (best-effort, no bloqueante)
            try {
                const { data } = await supabase.auth.getUserIdentities();
                const googleIdentity = data?.identities?.find((i: any) => i.provider === 'google');
                if (googleIdentity) {
                    await supabase.auth.unlinkIdentity(googleIdentity);
                }
            } catch (unlinkErr) {
                console.warn('No se pudo desvincular la identidad de Google:', unlinkErr);
            }
            return true;
        },
        onSuccess: () => {
            // Sin esto la app seguiría usando el access token cacheado en memoria
            // hasta el próximo F5, aunque el usuario ya haya desconectado.
            GoogleCalendarService.clearTokenCache();
            queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail(userId ?? '') });
            message.success('Google Calendar desconectado correctamente.');
        },
        onError: (err: any) => {
            console.error('Disconnect Google error:', err);
            message.error('Error al desconectar Google: ' + err.message);
        }
    });


    // 5. Update Schedule Mutation
    const updateScheduleMutation = useMutation({
        mutationFn: async ({ slotId, updates }: { slotId: number; updates: Partial<ScheduleData> }) => {
            if (!userId) throw new Error("No user ID");
            const { error } = await supabase.from('schedules').update(updates).eq('id', slotId);
            if (error) throw error;
            return { slotId, updates };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail(userId ?? '') });
            message.success('Horario actualizado');
        },
        onError: (err: any) => {
            console.error('Update schedule error:', err);
            message.error('Error al actualizar horario: ' + err.message);
        }
    });

    // 6. Add Schedule Mutation
    const addScheduleMutation = useMutation({
        mutationFn: async (dayId: number) => {
            if (!userId) throw new Error("No user ID");
            const existingSlots = schedules.filter((s: ScheduleData) => s.day_of_week === dayId);
            let defaultStart = '09:00:00';
            let defaultEnd = '18:00:00';

            if (existingSlots.length > 0) {
                defaultStart = '16:00:00';
                defaultEnd = '20:00:00';
            }

            const newSlot = {
                user_id: userId,
                day_of_week: dayId,
                start_time: defaultStart,
                end_time: defaultEnd,
                is_active: true
            };
            const { data, error } = await supabase.from('schedules').insert(newSlot).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail(userId ?? '') });
            message.success('Horario agregado');
        },
        onError: (err: any) => {
            console.error('Add schedule error:', err);
            message.error('Error al agregar horario: ' + err.message);
        }
    });

    // 7. Delete Schedule Mutation
    const deleteScheduleMutation = useMutation({
        mutationFn: async (slotId: number) => {
            if (!userId) throw new Error("No user ID");
            const { error } = await supabase.from('schedules').delete().eq('id', slotId);
            if (error) throw error;
            return slotId;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail(userId ?? '') });
            message.success('Horario eliminado');
        },
        onError: (err: any) => {
            console.error('Delete schedule error:', err);
            message.error('Error al eliminar horario: ' + err.message);
        }
    });

    // --- WHATSAPP CONNECTION POLLING ---
    /** ~3 min a 5 s por tick: si nadie escanea el QR, el polling se apaga solo. */
    const MAX_POLL_TICKS = 36;

    /** Deja el perfil en `disconnected` para que un reload no reviva el `connecting`. */
    const markProfileDisconnected = useCallback(async () => {
        if (!userId) return;
        await supabase.from('profiles').update({ whatsapp_status: 'disconnected' }).eq('id', userId);
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail(userId) });
    }, [userId, queryClient]);

    const stopPolling = useCallback((status: string) => {
        setPollingActive(false);
        setInstanceStatus(status);
        setQrCodeData(null);
        pollErrorCountRef.current = 0;
        pollTicksRef.current = 0;
    }, []);

    const checkConnectionStatus = useCallback(async () => {
        if (!userId) return;
        // Sin instancia en caché no hay nada que esperar: apagar el polling en vez de
        // dejarlo girando en vacío con el botón "Conectar" bloqueado para siempre.
        if (!profile.whatsapp_instance) {
            setPollingActive(false);
            return;
        }

        pollTicksRef.current += 1;
        if (pollTicksRef.current > MAX_POLL_TICKS) {
            stopPolling('disconnected');
            await markProfileDisconnected();
            message.info('Se agotó el tiempo para escanear el QR. Volvé a intentar.');
            return;
        }

        try {
            const { data, error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'get_qr', tenant_id: userId }
            });

            if (error) {
                pollErrorCountRef.current += 1;
                if (pollErrorCountRef.current >= 3) {
                    stopPolling('disconnected');
                    await markProfileDisconnected();
                }
                return;
            }
            pollErrorCountRef.current = 0;

            // La instancia ya no existe en Evolution: la Edge Function ya limpió el perfil.
            if (data?.status === 'disconnected') {
                stopPolling('disconnected');
                queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail(userId) });
                return;
            }

            // `data.qr` es la forma normalizada; el resto son las variantes crudas de
            // Evolution, por si el front se despliega antes que la Edge Function.
            const qr = data?.qr || data?.qrcode?.base64 || data?.qrcode?.code || data?.base64 || data?.code;
            if (qr) setQrCodeData(qr);

            if (data?.status === 'connected' || data?.instance?.status === 'open' || data?.instance?.state === 'open' || data?.instance?.connectionStatus === 'open') {
                stopPolling('connected');

                // Update profile in DB to reflect connected status
                await supabase.from('profiles').update({ whatsapp_status: 'connected' }).eq('id', userId);
                queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail(userId) });
            }
        } catch (errUnknown: unknown) {
            const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
            console.error('Connection check error:', err);
        }
    }, [profile.whatsapp_instance, userId, queryClient, stopPolling, markProfileDisconnected]);

    useEffect(() => {
        let interval: any;
        if (pollingActive) {
            interval = setInterval(checkConnectionStatus, 5000);
        }
        return () => clearInterval(interval);
    }, [pollingActive, checkConnectionStatus]);


    // --- LEGACY COMPATIBILITY HANDLERS (Wrappers around mutations) ---
    const handleAutoSaveProfile = useCallback((updates: Partial<ProfileData>) => {
        updateProfileMutation.mutate(updates);
    }, [updateProfileMutation]);

    const handleProfileChange = useCallback((field: string, value: any) => {
        // Optimistic local state update for form responsiveness
        queryClient.setQueryData(queryKeys.settings.detail(userId ?? ''), (oldData: any) => {
            if (!oldData) return oldData;
            return {
                ...oldData,
                profile: {
                    ...oldData.profile,
                    [field]: value
                }
            };
        });
    }, [queryClient, userId]);

    const handleAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            updateAvatarMutation.mutate(e.target.files[0]);
        }
    }, [updateAvatarMutation]);

    const handleConnectWhatsApp = useCallback(() => {
        connectWhatsAppMutation.mutate();
    }, [connectWhatsAppMutation]);

    const handleDisconnectWhatsApp = useCallback(() => {
        disconnectWhatsAppMutation.mutate();
    }, [disconnectWhatsAppMutation]);

    // --- GOOGLE CALENDAR CONNECTION ---
    // Ambos flujos hacen un full-page redirect, por eso no usamos useMutation aquí.
    const handleConnectGoogle = useCallback(async () => {
        const options = {
            redirectTo: `${window.location.origin}/configuracion?tab=googlecalendar`,
            scopes: GOOGLE_OAUTH_SCOPES,
            // access_type=offline + prompt=consent son imprescindibles: sin ellos
            // Google no reemite el refresh_token que necesitamos para sincronizar.
            queryParams: { access_type: 'offline', prompt: 'consent' },
        };

        // Si el usuario ya inició sesión con Google, su identidad YA está vinculada
        // y linkIdentity falla con 422 identity_already_exists. En ese caso pedimos
        // el consentimiento vía signInWithOAuth: reautentica al mismo usuario y
        // devuelve un provider_refresh_token fresco.
        const { data: identityData, error: identityError } = await supabase.auth.getUserIdentities();
        if (identityError) {
            console.error('No se pudieron leer las identidades del usuario:', identityError);
        }
        const googleYaVinculada = identityData?.identities?.some((i: any) => i.provider === 'google') ?? false;

        const { error } = googleYaVinculada
            ? await supabase.auth.signInWithOAuth({ provider: 'google', options })
            : await supabase.auth.linkIdentity({ provider: 'google', options });

        if (error) {
            console.error('Connect Google error:', error);
            message.error('Error al conectar Google: ' + error.message);
        }
    }, []);

    const handleDisconnectGoogle = useCallback(() => {
        disconnectGoogleMutation.mutate();
    }, [disconnectGoogleMutation]);

    // Combined saving state for UI loading indicators
    const saving = updateProfileMutation.isPending || updateAvatarMutation.isPending || connectWhatsAppMutation.isPending || disconnectWhatsAppMutation.isPending;

    return {
        // State
        profile,
        tenant: profile, // Alias for backward compatibility
        schedules,
        faqs,
        loading,
        saving,
        error: queryError ? queryError.message : '',
        googleAvatar,
        avatarPreview,
        qrCodeData,
        instanceStatus,
        pollingActive,
        googleConnected,
        googleDisconnecting: disconnectGoogleMutation.isPending,

        // Actions
        handleProfileChange,
        handleAutoSaveProfile,
        handleAvatarChange,
        handleConnectWhatsApp,
        handleDisconnectWhatsApp,
        handleConnectGoogle,
        handleDisconnectGoogle,
        setInstanceStatus,
        setPollingActive,
        setQrCodeData,

        // Mutators and Setters expected by SettingsView
        updateSchedule: (args: any) => updateScheduleMutation.mutate(args),
        addSchedule: (dayId: number) => addScheduleMutation.mutate(dayId),
        deleteSchedule: (slotId: number) => deleteScheduleMutation.mutate(slotId),
        setFaqs: (updater: any) => {
            queryClient.setQueryData(queryKeys.settings.detail(userId ?? ''), (oldData: any) => {
                if (!oldData) return oldData;
                return {
                    ...oldData,
                    faqs: typeof updater === 'function' ? updater(oldData.faqs || []) : updater
                };
            });
        },
        setProfile: (updater: any) => {
            queryClient.setQueryData(queryKeys.settings.detail(userId ?? ''), (oldData: any) => {
                if (!oldData) return oldData;
                return {
                    ...oldData,
                    profile: typeof updater === 'function' ? updater(oldData.profile) : updater
                };
            });
        },
        setTenant: (updater: any) => {
            queryClient.setQueryData(queryKeys.settings.detail(userId ?? ''), (oldData: any) => {
                if (!oldData) return oldData;
                return {
                    ...oldData,
                    profile: typeof updater === 'function' ? updater(oldData.profile) : updater
                };
            });
        }
    };
}
