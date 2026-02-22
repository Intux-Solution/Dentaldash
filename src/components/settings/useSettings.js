import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../config/supabaseClient';
import { message } from 'antd';

export function useSettings(session = null) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Core Data
    const [profile, setProfile] = useState({
        full_name: '',
        avatar_url: null,
        user_id: null,
        accepted_insurances: [],
        services: [],
        contact_phone: '',
        business_name: '',
        whatsapp_instance: null,
        whatsapp_status: 'disconnected',
        system_prompt: '',
        apikey_evolution: '',
        notification_phone: '',
    });
    const [schedules, setSchedules] = useState([]);
    const [faqs, setFaqs] = useState([]);

    // UI/Connection States
    const [googleAvatar, setGoogleAvatar] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [qrCodeData, setQrCodeData] = useState(null);
    const [instanceStatus, setInstanceStatus] = useState('disconnected');
    const [pollingActive, setPollingActive] = useState(false);

    const checkConnectionStatus = useCallback(async () => {
        if (!profile.whatsapp_instance || !profile.user_id) return;

        try {
            const { data, error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'get_qr', tenant_id: profile.user_id }
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
                await supabase.from('profiles').update({ whatsapp_status: 'connected' }).eq('id', profile.user_id);
            }
        } catch (err) {
            console.error('Connection check error:', err);
        }
    }, [profile.whatsapp_instance, profile.user_id]);

    const fetchSettings = useCallback(async () => {
        try {
            setLoading(true);

            // Usar la sesión pasada por props si existe
            const user = session?.user;

            if (!user) {
                console.warn("useSettings: No active user found in session");
                setLoading(false);
                return;
            }

            const userId = user.id;

            // Extract Google Session fallbacks
            const sessionName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email;
            const sessionAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

            if (sessionAvatar) {
                setGoogleAvatar(sessionAvatar);
            }

            // Fetch Profile (All data is here now)
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (profileError) console.error('Error fetching profile:', profileError);

            if (profileData) {
                const mergedProfile = {
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
                setProfile(mergedProfile);
                setInstanceStatus(mergedProfile.whatsapp_status);

                if (mergedProfile.whatsapp_status === 'connecting') {
                    setPollingActive(true);
                }

                if (profileData.avatar_url) {
                    const { data } = supabase.storage.from('avatars').getPublicUrl(profileData.avatar_url);
                    if (data?.publicUrl) setAvatarPreview(data.publicUrl);
                }
            } else {
                setProfile(prev => ({ ...prev, user_id: userId, full_name: sessionName, business_name: 'Mi Consultorio' }));
            }

            // Fetch Schedules
            const { data: scheduleData, error: scheduleError } = await supabase
                .from('schedules')
                .select('*')
                .eq('user_id', userId)
                .order('day_of_week')
                .order('start_time');

            if (scheduleError) console.error('Error fetching schedules:', scheduleError);
            setSchedules(scheduleData || []);

            // Fetch FAQs
            const { data: faqData, error: faqError } = await supabase
                .from('tenant_faqs')
                .select('*')
                .eq('tenant_id', userId)
                .order('created_at');

            if (faqError) console.error('Error fetching FAQs:', faqError);
            setFaqs(faqData || []);

        } catch (err) {
            console.error('Error fetching settings:', err);
            message.error('Error al cargar la configuración');
        } finally {
            setLoading(false);
        }
    }, [session]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        let interval;
        if (pollingActive) {
            interval = setInterval(checkConnectionStatus, 5000);
        }
        return () => clearInterval(interval);
    }, [pollingActive, checkConnectionStatus]);

    const handleAutoSaveProfile = useCallback(async (updates) => {
        try {
            if (!session?.user?.id) return;
            const { error } = await supabase
                .from('profiles')
                .update({ ...updates, updated_at: new Date() })
                .eq('id', session.user.id);

            if (error) throw error;
            message.success('Actualizado correctamente');
            window.dispatchEvent(new CustomEvent('profile:updated'));
        } catch (err) {
            console.error('AutoSave error:', err);
        }
    }, [session?.user?.id]);

    const handleProfileChange = useCallback((field, value) => {
        setProfile(prev => ({ ...prev, [field]: value }));
    }, []);

    const handleAvatarChange = useCallback(async (e) => {
        const file = e.target.files[0];
        if (!file || !session?.user?.id) return;

        try {
            setSaving(true);
            const fileName = `${session.user.id}-${Math.random()}.${file.name.split('.').pop()}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: fileName, updated_at: new Date() })
                .eq('id', session.user.id);

            if (updateError) throw updateError;

            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
            setAvatarPreview(publicUrl);
            setProfile(prev => ({ ...prev, avatar_url: fileName }));

            message.success('Avatar actualizado');
            window.dispatchEvent(new CustomEvent('profile:updated'));
        } catch (err) {
            message.error('Error al subir avatar: ' + err.message);
        } finally {
            setSaving(false);
        }
    }, [session?.user?.id]);

    const handleConnectWhatsApp = useCallback(async () => {
        try {
            setSaving(true);
            const { data, error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'create', tenant_id: profile.user_id }
            });
            if (error) throw error;

            if (data?.instance?.instanceName) {
                setProfile(prev => ({ ...prev, whatsapp_instance: data.instance.instanceName }));
            }

            setPollingActive(true);
            setInstanceStatus('connecting');
            message.success('Iniciando conexión con WhatsApp...');
        } catch (err) {
            message.error('Error al conectar WhatsApp: ' + err.message);
        } finally {
            setSaving(false);
        }
    }, [profile.user_id]);

    const handleDisconnectWhatsApp = useCallback(async () => {
        try {
            setSaving(true);
            await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'logout', tenant_id: profile.user_id }
            });

            setInstanceStatus('disconnected');
            setPollingActive(false);
            setQrCodeData(null);
            setProfile(prev => ({ ...prev, whatsapp_instance: null }));
            message.success('WhatsApp desconectado correctamente.');
        } catch (err) {
            message.error('Error al desconectar: ' + err.message);
        } finally {
            setSaving(false);
        }
    }, [profile.user_id]);

    return {
        // State
        profile, tenant: profile, schedules, faqs, loading, saving, error,
        googleAvatar, avatarPreview, qrCodeData, instanceStatus, pollingActive,

        // Actions
        setProfile, setSchedules, setFaqs,
        handleProfileChange, handleAutoSaveProfile, handleAvatarChange,
        handleConnectWhatsApp, handleDisconnectWhatsApp,
        setInstanceStatus, setPollingActive, setQrCodeData
    };
}
