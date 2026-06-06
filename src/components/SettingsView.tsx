// src/components/SettingsView.jsx - UPDATED 2026-02-21 (Refactored)
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
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

const TAB_FEATURE_MAP: Record<string, string | null> = {
    profile: null,
    insurances: 'insurance_management',
    services: 'services_config',
    schedule: null,
    whatsapp: 'whatsapp_bot',
    googlecalendar: null,
    faqs: 'faqs_config',
};

export default function SettingsView() {
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'profile');
    const { canUse } = useSubscription();
    const { session } = useAuth();

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

            <div className="flex border-b mb-6 border-gray-100 overflow-x-auto">
                {([
                    { key: 'profile', label: 'Perfil' },
                    { key: 'booking', label: 'Link de Reservas' },
                    { key: 'insurances', label: 'Obras Sociales' },
                    { key: 'services', label: 'Servicios' },
                    { key: 'schedule', label: 'Horarios' },
                    { key: 'whatsapp', label: 'WhatsApp' },
                    { key: 'googlecalendar', label: 'Google Calendar' },
                    { key: 'faqs', label: 'Preguntas Frecuentes' },
                ] as { key: string; label: string }[]).map(({ key, label }) => {
                    const featureKey = TAB_FEATURE_MAP[key];
                    const locked = featureKey !== null && !canUse(featureKey);
                    return (
                        <button
                            key={key}
                            onClick={() => setActiveTab(key)}
                            className={`px-6 py-3 font-medium text-sm whitespace-nowrap relative flex items-center gap-1.5 ${activeTab === key ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {activeTab === key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />}
                            {label}
                            {locked && <Lock size={12} className="text-gray-400" />}
                        </button>
                    );
                })}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {activeTab === 'profile' && (
                    <ProfileTab
                        profile={profile}
                        handleProfileChange={handleProfileChange}
                        handleAutoSaveProfile={handleAutoSaveProfile}
                        avatarPreview={avatarPreview}
                        googleAvatar={googleAvatar}
                        handleAvatarChange={handleAvatarChange}
                    />
                )}

                {activeTab === 'booking' && (
                    <BookingLinkTab
                        profile={profile}
                        handleAutoSaveProfile={handleAutoSaveProfile}
                    />
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

                {activeTab === 'whatsapp' && (
                    canUse('whatsapp_bot')
                        ? <WhatsAppTab profile={profile} instanceStatus={instanceStatus} pollingActive={pollingActive} qrCodeData={qrCodeData} saving={saving} handleConnectWhatsApp={handleConnectWhatsApp} handleDisconnectWhatsApp={handleDisconnectWhatsApp} />
                        : <UpgradePrompt feature="Bot de WhatsApp" />
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
            </div>
        </div>
    );
}
