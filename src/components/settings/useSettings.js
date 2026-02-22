import { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { message } from 'antd';

export function useSettings() {
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
    });
    const [tenant, setTenant] = useState(null);
    const [schedules, setSchedules] = useState([]);
    const [faqs, setFaqs] = useState([]);

    // UI/Connection States
    const [googleAvatar, setGoogleAvatar] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [qrCodeData, setQrCodeData] = useState(null);
    const [instanceStatus, setInstanceStatus] = useState('disconnected');
    const [pollingActive, setPollingActive] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        let interval;
        if (pollingActive) {
            interval = setInterval(checkConnectionStatus, 5000);
        }
        return () => clearInterval(interval);
    }, [pollingActive, tenant]);

    const checkConnectionStatus = async (tenantData = null) => {
        const targetTenant = tenantData || tenant;
        if (!targetTenant?.whatsapp_instance) return;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const { data, error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'get_qr', tenant_id: targetTenant.id }
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
                await supabase.from('tenants').update({ whatsapp_status: 'connected' }).eq('id', targetTenant.id);
            }
        } catch (err) {
            console.error('Connection check error:', err);
        }
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (!session) {
                console.warn('No active session found in useSettings');
                setLoading(false);
                return;
            }

            const userId = session.user.id;

            if (session.user?.user_metadata?.avatar_url) {
                setGoogleAvatar(session.user.user_metadata.avatar_url);
            }

            // Fetch Profile
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (profileError) console.error('Error fetching profile:', profileError);

            if (profileData) {
                setProfile({
                    full_name: profileData.full_name || '',
                    avatar_url: profileData.avatar_url,
                    user_id: userId,
                    accepted_insurances: profileData.accepted_insurances || [],
                    services: profileData.services || [],
                    contact_phone: profileData.contact_phone || '',
                });
                if (profileData.avatar_url) {
                    const { data } = supabase.storage.from('avatars').getPublicUrl(profileData.avatar_url);
                    if (data?.publicUrl) setAvatarPreview(data.publicUrl);
                }
            } else {
                setProfile(prev => ({ ...prev, user_id: userId }));
            }

            // Fetch Schedules
            const { data: scheduleData, error: scheduleError } = await supabase
                .from('schedules')
                .select('*')
                .order('day_of_week')
                .order('start_time');

            if (scheduleError) console.error('Error fetching schedules:', scheduleError);
            setSchedules(scheduleData || []);

            // Fetch Tenant
            const { data: tenantData, error: tenantError } = await supabase
                .from('tenants')
                .select('*')
                .limit(1)
                .maybeSingle();

            if (tenantError) console.error('Error fetching tenant:', tenantError);

            if (tenantData) {
                setTenant(tenantData);
                setInstanceStatus(tenantData.whatsapp_status || 'disconnected');
                if (tenantData.whatsapp_status === 'connecting') {
                    setPollingActive(true);
                } else if (tenantData.whatsapp_status === 'connected') {
                    checkConnectionStatus(tenantData);
                }

                const { data: faqData, error: faqError } = await supabase
                    .from('tenant_faqs')
                    .select('*')
                    .eq('tenant_id', tenantData.id)
                    .order('created_at', { ascending: true });

                if (faqError) console.error('Error fetching FAQs:', faqError);
                setFaqs(faqData || []);
            }
        } catch (err) {
            console.error('Error fetching settings:', err);
            message.error('Error al cargar la configuración');
        } finally {
            setLoading(false);
        }
    };

    const handleAutoSaveProfile = async (updates) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
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
    };

    const handleProfileChange = (field, value) => {
        setProfile(prev => ({ ...prev, [field]: value }));
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setSaving(true);
            const { data: { session } } = await supabase.auth.getSession();
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
    };

    const handleConnectWhatsApp = async () => {
        try {
            setSaving(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                message.error('No se pudo verificar la sesión. Recarga la página.');
                setSaving(false);
                return;
            }

            const { data, error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'create', tenant_id: tenant.id }
            });
            if (error) throw error;

            if (data?.instance?.instanceName) {
                setTenant(prev => ({ ...prev, whatsapp_instance: data.instance.instanceName }));
            }

            setPollingActive(true);
            setInstanceStatus('connecting');
            message.success('Iniciando conexión con WhatsApp...');
        } catch (err) {
            message.error('Error al conectar WhatsApp: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDisconnectWhatsApp = async () => {
        try {
            setSaving(true);
            const { data: { session } } = await supabase.auth.getSession();
            await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'logout', tenant_id: tenant.id }
            });

            setInstanceStatus('disconnected');
            setPollingActive(false);
            setQrCodeData(null);
            setTenant(prev => ({ ...prev, whatsapp_instance: null }));
            message.success('WhatsApp desconectado correctamente.');
        } catch (err) {
            message.error('Error al desconectar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    return {
        // State
        profile, tenant, schedules, faqs, loading, saving, error,
        googleAvatar, avatarPreview, qrCodeData, instanceStatus, pollingActive,

        // Actions
        setProfile, setTenant, setSchedules, setFaqs,
        handleProfileChange, handleAutoSaveProfile, handleAvatarChange,
        handleConnectWhatsApp, handleDisconnectWhatsApp,
        setInstanceStatus, setPollingActive, setQrCodeData
    };
}
