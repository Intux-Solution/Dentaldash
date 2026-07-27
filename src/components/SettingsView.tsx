// src/components/SettingsView.jsx - UPDATED 2026-02-21 (Refactored)
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { useSettings } from './settings/useSettings';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import ProfileTab from './settings/ProfileTab';
import BookingLinkTab from './settings/BookingLinkTab';
import InsurancesTab from './settings/InsurancesTab';
import ServicesTab from './settings/ServicesTab';
import ScheduleTab from './settings/ScheduleTab';
import WhatsAppTab from './settings/WhatsAppTab';
import GoogleCalendarTab from './settings/GoogleCalendarTab';
import FaqsTab from './settings/FaqsTab';
import UpgradePrompt from './UpgradePrompt';
import SettingsTabs from './settings/SettingsTabs';

const TAB_FEATURE_MAP: Record<string, string | null> = {
    profile: null,
    insurances: 'insurance_management',
    services: 'services_config',
    schedule: null,
    googlecalendar: null,
    faqs: 'faqs_config',
    whatsapp: 'whatsapp_bot',
};

/**
 * Supabase devuelve los errores de OAuth en el query string y/o en el fragmento
 * (`#error_description=...`) al volver del redirect. Sin esto el fallo es mudo:
 * la URL cambia, la UI no dice nada y el usuario cree que se conectó.
 */
function readOAuthError(search: URLSearchParams): string | null {
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const description = search.get('error_description') ?? fromHash.get('error_description');
    const code = search.get('error_code') ?? fromHash.get('error_code');

    if (!description && !code) return null;

    if (code === 'identity_already_exists') {
        // handleConnectGoogle ya evita este error para la propia identidad del
        // usuario, así que llegar acá significa que esa cuenta de Google está
        // vinculada a OTRA cuenta de DentalDash.
        return 'Esa cuenta de Google ya está vinculada a otro usuario de DentalDash. Usá otra cuenta de Google.';
    }
    return description ? description.replace(/\+/g, ' ') : `Error de Google (${code}).`;
}

const TABS: { key: string; label: string }[] = [
    { key: 'profile', label: 'Perfil' },
    { key: 'insurances', label: 'Obras Sociales' },
    { key: 'services', label: 'Servicios' },
    { key: 'schedule', label: 'Horarios' },
    { key: 'googlecalendar', label: 'Google Calendar' },
    { key: 'faqs', label: 'Preguntas Frecuentes' },
    { key: 'whatsapp', label: 'WhatsApp' },
];

export default function SettingsView() {
    const [searchParams] = useSearchParams();
    // 'booking' se fusionó dentro del tab de perfil: viejos links con ?tab=booking siguen funcionando
    const initialTab = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState(
        !initialTab || initialTab === 'booking' ? 'profile' : initialTab
    );
    const { canUse } = useSubscription();
    const { session } = useAuth();
    const navigate = useNavigate();

    // Muestra el error del redirect de OAuth y limpia la URL para que no
    // reaparezca al recargar.
    useEffect(() => {
        const oauthError = readOAuthError(searchParams);
        if (!oauthError) return;

        message.error(oauthError, 8);
        navigate(`/configuracion?tab=${initialTab || 'profile'}`, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const {
        profile, tenant, schedules, faqs, loading, saving,
        googleAvatar, avatarPreview, qrCodeData, instanceStatus, pollingActive,
        googleConnected, googleDisconnecting,
        setProfile, setTenant, setFaqs,
        handleProfileChange, handleAutoSaveProfile, handleAvatarChange,
        handleConnectWhatsApp, handleDisconnectWhatsApp,
        handleConnectGoogle, handleDisconnectGoogle,
        updateSchedule, addSchedule, deleteSchedule
    } = useSettings(session);

    if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
                </div>
            </div>

            <SettingsTabs
                tabs={TABS.map(({ key, label }) => {
                    const featureKey = TAB_FEATURE_MAP[key];
                    return { key, label, locked: featureKey !== null && !canUse(featureKey) };
                })}
                activeTab={activeTab}
                onSelect={setActiveTab}
            />

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {activeTab === 'profile' && (
                    <>
                        <ProfileTab
                            profile={profile}
                            handleProfileChange={handleProfileChange}
                            handleAutoSaveProfile={handleAutoSaveProfile}
                            avatarPreview={avatarPreview}
                            googleAvatar={googleAvatar}
                            handleAvatarChange={handleAvatarChange}
                        />
                        <div className="border-t border-gray-100" />
                        <BookingLinkTab
                            profile={profile}
                            handleAutoSaveProfile={handleAutoSaveProfile}
                        />
                    </>
                )}

                {activeTab === 'insurances' && (
                    canUse('insurance_management')
                        ? <InsurancesTab profile={profile} handleProfileChange={handleProfileChange} handleAutoSaveProfile={handleAutoSaveProfile} />
                        : <UpgradePrompt feature="Gestión de Obras Sociales" />
                )}

                {activeTab === 'services' && (
                    canUse('services_config')
                        ? <ServicesTab profile={profile} handleProfileChange={handleProfileChange} handleAutoSaveProfile={handleAutoSaveProfile} />
                        : <UpgradePrompt feature="Configuración de Servicios" />
                )}

                {activeTab === 'schedule' && (
                    <ScheduleTab
                        schedules={schedules}
                        updateSchedule={updateSchedule}
                        addSchedule={addSchedule}
                        deleteSchedule={deleteSchedule}
                    />
                )}

                {activeTab === 'googlecalendar' && (
                    <GoogleCalendarTab
                        googleConnected={googleConnected}
                        googleDisconnecting={googleDisconnecting}
                        handleConnectGoogle={handleConnectGoogle}
                        handleDisconnectGoogle={handleDisconnectGoogle}
                    />
                )}

                {activeTab === 'faqs' && (
                    canUse('faqs_config')
                        ? <FaqsTab tenant={tenant} faqs={faqs} setFaqs={setFaqs} />
                        : <UpgradePrompt feature="Preguntas Frecuentes" />
                )}

                {activeTab === 'whatsapp' && (
                    canUse('whatsapp_bot')
                        ? <WhatsAppTab profile={profile} instanceStatus={instanceStatus} pollingActive={pollingActive} qrCodeData={qrCodeData} saving={saving} handleConnectWhatsApp={handleConnectWhatsApp} handleDisconnectWhatsApp={handleDisconnectWhatsApp} />
                        : <UpgradePrompt feature="Bot de WhatsApp" />
                )}
            </div>
        </div>
    );
}
