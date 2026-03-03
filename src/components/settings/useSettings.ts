import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../config/supabaseClient';
import { message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Interface definitions (Partial based on usage)
export interface ProfileData {
    full_name: string;
    avatar_url: string | null;
    user_id: string | null;
    accepted_insurances: string[];
    services: string[];
    contact_phone: string;
    business_name: string;
    whatsapp_instance: string | null;
    whatsapp_status: string;
    system_prompt: string;
    apikey_evolution: string;
    notification_phone: string;
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

    const userId = session?.user?.id;

    // --- QUERY: FETCH SETTINGS ---
    const {
        data: settingsData,
        isLoading: loading,
        error: queryError,
    } = useQuery({
        queryKey: ['settings', userId],
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
                };
                setInstanceStatus(mergedProfile.whatsapp_status);

                if (mergedProfile.whatsapp_status === 'connecting') {
                    setPollingActive(true);
                }

                if (profileData.avatar_url) {
                    const { data } = supabase.storage.from('avatars').getPublicUrl(profileData.avatar_url);
                    if (data?.publicUrl) setAvatarPreview(data.publicUrl);
                }
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
            };
        },
        enabled: !!userId,
    });

    const profile = settingsData?.profile || ({} as ProfileData);
    const schedules = settingsData?.schedules || [];
    const faqs = settingsData?.faqs || [];

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
            queryClient.invalidateQueries({ queryKey: ['settings', userId] });
            message.success('Perfil actualizado correctamente');
            window.dispatchEvent(new CustomEvent('profile:updated'));
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
            queryClient.invalidateQueries({ queryKey: ['settings', userId] });
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
            setAvatarPreview(publicUrl);
            message.success('Avatar actualizado');
            window.dispatchEvent(new CustomEvent('profile:updated'));
        },
        onError: (err: any) => {
            console.error('Avatar update error:', err);
            message.error('Error al subir avatar: ' + err.message);
        }
    });

    // 3. Connect WhatsApp Mutation
    const connectWhatsAppMutation = useMutation({
        mutationFn: async () => {
            if (!userId) throw new Error("No user ID");
            const { data, error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'create', tenant_id: userId }
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            setPollingActive(true);
            setInstanceStatus('connecting');
            if (data?.instance?.instanceName) {
                queryClient.setQueryData(['settings', userId], (oldData: any) => {
                    if (!oldData) return oldData;
                    return {
                        ...oldData,
                        profile: {
                            ...oldData.profile,
                            whatsapp_instance: data.instance.instanceName
                        }
                    };
                });
            }
            message.success('Iniciando conexión con WhatsApp...');
        },
        onError: (err: any) => {
            console.error('Connect WhatsApp error:', err);
            message.error('Error al conectar WhatsApp: ' + err.message);
        }
    });

    // 4. Disconnect WhatsApp Mutation
    const disconnectWhatsAppMutation = useMutation({
        mutationFn: async () => {
            if (!userId) throw new Error("No user ID");
            const { error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'logout', tenant_id: userId }
            });
            if (error) throw error;
            return true;
        },
        onSuccess: () => {
            setInstanceStatus('disconnected');
            setPollingActive(false);
            setQrCodeData(null);
            queryClient.setQueryData(['settings', userId], (oldData: any) => {
                if (!oldData) return oldData;
                return {
                    ...oldData,
                    profile: {
                        ...oldData.profile,
                        whatsapp_instance: null
                    }
                };
            });
            message.success('WhatsApp desconectado correctamente.');
        },
        onError: (err: any) => {
            console.error('Disconnect WhatsApp error:', err);
            message.error('Error al desconectar: ' + err.message);
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
            queryClient.invalidateQueries({ queryKey: ['settings', userId] });
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
            queryClient.invalidateQueries({ queryKey: ['settings', userId] });
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
            queryClient.invalidateQueries({ queryKey: ['settings', userId] });
            message.success('Horario eliminado');
        },
        onError: (err: any) => {
            console.error('Delete schedule error:', err);
            message.error('Error al eliminar horario: ' + err.message);
        }
    });

    // --- WHATSAPP CONNECTION POLLING ---
    const checkConnectionStatus = useCallback(async () => {
        if (!profile.whatsapp_instance || !userId) return;

        try {
            const { data, error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'get_qr', tenant_id: userId }
            });

            if (error) {
                if (error.status === 404) {
                    setPollingActive(false);
                    setInstanceStatus('disconnected');
                }
                return;
            }

            if (data.qrcode || data.base64 || data.code) {
                setQrCodeData(data.qrcode?.base64 || data.qrcode?.code || data.base64 || data.code);
            }

            if (data.instance?.status === 'open' || data.instance?.state === 'open' || data.instance?.connectionStatus === 'open' || data.status === 'connected') {
                setInstanceStatus('connected');
                setPollingActive(false);
                setQrCodeData(null);

                // Update profile in DB to reflect connected status
                await supabase.from('profiles').update({ whatsapp_status: 'connected' }).eq('id', userId);
                queryClient.invalidateQueries({ queryKey: ['settings', userId] });
            }
        } catch (errUnknown: unknown) {
            const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
            console.error('Connection check error:', err);
        }
    }, [profile.whatsapp_instance, userId, queryClient]);

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
        queryClient.setQueryData(['settings', userId], (oldData: any) => {
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

        // Actions
        handleProfileChange,
        handleAutoSaveProfile,
        handleAvatarChange,
        handleConnectWhatsApp,
        handleDisconnectWhatsApp,
        setInstanceStatus,
        setPollingActive,
        setQrCodeData,

        // Mutators and Setters expected by SettingsView
        updateSchedule: (args: any) => updateScheduleMutation.mutate(args),
        addSchedule: (dayId: number) => addScheduleMutation.mutate(dayId),
        deleteSchedule: (slotId: number) => deleteScheduleMutation.mutate(slotId),
        setFaqs: (updater: any) => {
            queryClient.setQueryData(['settings', userId], (oldData: any) => {
                if (!oldData) return oldData;
                return {
                    ...oldData,
                    faqs: typeof updater === 'function' ? updater(oldData.faqs || []) : updater
                };
            });
        },
        setProfile: (updater: any) => {
            queryClient.setQueryData(['settings', userId], (oldData: any) => {
                if (!oldData) return oldData;
                return {
                    ...oldData,
                    profile: typeof updater === 'function' ? updater(oldData.profile) : updater
                };
            });
        },
        setTenant: (updater: any) => {
            queryClient.setQueryData(['settings', userId], (oldData: any) => {
                if (!oldData) return oldData;
                return {
                    ...oldData,
                    profile: typeof updater === 'function' ? updater(oldData.profile) : updater
                };
            });
        }
    };
}
