// src/components/SettingsView.jsx - UPDATED 2026-02-21 (Refactored)
import React, { useState } from 'react';
import { useSettings } from './settings/useSettings';
import ProfileTab from './settings/ProfileTab';
import InsurancesTab from './settings/InsurancesTab';
import ServicesTab from './settings/ServicesTab';
import ScheduleTab from './settings/ScheduleTab';
import WhatsAppTab from './settings/WhatsAppTab';
import FaqsTab from './settings/FaqsTab';

export default function SettingsView({ session }) {
    const [activeTab, setActiveTab] = useState('profile');

    const {
        profile, tenant, schedules, faqs, loading, saving,
        googleAvatar, avatarPreview, qrCodeData, instanceStatus, pollingActive,
        setProfile, setTenant, setSchedules, setFaqs,
        handleProfileChange, handleAutoSaveProfile, handleAvatarChange,
        handleConnectWhatsApp, handleDisconnectWhatsApp
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
                <button onClick={() => setActiveTab('profile')} className={`px-6 py-3 font-medium text-sm whitespace-nowrap relative ${activeTab === 'profile' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}>{activeTab === 'profile' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />}Perfil</button>
                <button onClick={() => setActiveTab('insurances')} className={`px-6 py-3 font-medium text-sm whitespace-nowrap relative ${activeTab === 'insurances' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}>{activeTab === 'insurances' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />}Obras Sociales</button>
                <button onClick={() => setActiveTab('services')} className={`px-6 py-3 font-medium text-sm whitespace-nowrap relative ${activeTab === 'services' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}>{activeTab === 'services' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />}Servicios</button>
                <button onClick={() => setActiveTab('schedule')} className={`px-6 py-3 font-medium text-sm whitespace-nowrap relative ${activeTab === 'schedule' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}>{activeTab === 'schedule' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />}Horarios</button>
                <button onClick={() => setActiveTab('whatsapp')} className={`px-6 py-3 font-medium text-sm whitespace-nowrap relative ${activeTab === 'whatsapp' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}>{activeTab === 'whatsapp' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />}WhatsApp</button>
                <button onClick={() => setActiveTab('faqs')} className={`px-6 py-3 font-medium text-sm whitespace-nowrap relative ${activeTab === 'faqs' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}>{activeTab === 'faqs' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />}Preguntas Frecuentes</button>
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

                {activeTab === 'insurances' && (
                    <InsurancesTab
                        profile={profile}
                        handleProfileChange={handleProfileChange}
                        handleAutoSaveProfile={handleAutoSaveProfile}
                    />
                )}

                {activeTab === 'services' && (
                    <ServicesTab
                        profile={profile}
                        handleProfileChange={handleProfileChange}
                        handleAutoSaveProfile={handleAutoSaveProfile}
                    />
                )}

                {activeTab === 'schedule' && (
                    <ScheduleTab
                        schedules={schedules}
                        setSchedules={setSchedules}
                    />
                )}

                {activeTab === 'whatsapp' && (
                    <WhatsAppTab
                        tenant={tenant}
                        setTenant={setTenant}
                        profile={profile}
                        instanceStatus={instanceStatus}
                        pollingActive={pollingActive}
                        qrCodeData={qrCodeData}
                        saving={saving}
                        handleConnectWhatsApp={handleConnectWhatsApp}
                        handleDisconnectWhatsApp={handleDisconnectWhatsApp}
                        session={session}
                    />
                )}

                {activeTab === 'faqs' && (
                    <FaqsTab
                        tenant={tenant}
                        faqs={faqs}
                        setFaqs={setFaqs}
                    />
                )}
            </div>
        </div>
    );
}
