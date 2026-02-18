// src/components/SettingsView.jsx - UPDATED 2026-02-16 - FINAL VERSION
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabaseClient';
import { Clock, Check, AlertCircle, Save, Plus, Trash2, User, Camera, Loader, X, CreditCard, Briefcase, MessageSquare } from 'lucide-react';
import { QRCode, message, Button } from 'antd';


const DAYS = [
    { id: 0, name: 'Domingo' },
    { id: 1, name: 'Lunes' },
    { id: 2, name: 'Martes' },
    { id: 3, name: 'Miércoles' },
    { id: 4, name: 'Jueves' },
    { id: 5, name: 'Viernes' },
    { id: 6, name: 'Sábado' },
];

export default function SettingsView() {
    const [activeTab, setActiveTab] = useState('profile');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [schedules, setSchedules] = useState([]);
    const [profile, setProfile] = useState({
        full_name: '',
        avatar_url: null,
        user_id: null,
        accepted_insurances: [],
        services: [],
    });
    const [googleAvatar, setGoogleAvatar] = useState(null);
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [tenant, setTenant] = useState(null);
    const [faqs, setFaqs] = useState([]);
    const [qrCodeData, setQrCodeData] = useState(null);
    const [instanceStatus, setInstanceStatus] = useState('disconnected');
    const [pollingActive, setPollingActive] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            if (session.user?.user_metadata?.avatar_url) {
                setGoogleAvatar(session.user.user_metadata.avatar_url);
            }

            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (profileData) {
                setProfile({
                    full_name: profileData.full_name || '',
                    avatar_url: profileData.avatar_url,
                    user_id: session.user.id,
                    accepted_insurances: profileData.accepted_insurances || [],
                    services: profileData.services || [],
                });
                if (profileData.avatar_url) {
                    const { data: { publicUrl } } = supabase
                        .storage
                        .from('avatars')
                        .getPublicUrl(profileData.avatar_url);
                    setAvatarPreview(publicUrl);
                }
            } else {
                setProfile(prev => ({ ...prev, user_id: session.user.id }));
            }

            const { data: scheduleData } = await supabase
                .from('schedules')
                .select('*')
                .order('day_of_week')
                .order('start_time');

            setSchedules(scheduleData || []);

            // Fetch tenant data
            const { data: tenantData } = await supabase
                .from('tenants')
                .select('*')
                .eq('user_id', session.user.id)
                .single();

            if (tenantData) {
                setTenant(tenantData);
                setInstanceStatus(tenantData.whatsapp_status);
                if (tenantData.whatsapp_status === 'connecting') {
                    setPollingActive(true);
                }

                // Fetch FAQs
                const { data: faqData } = await supabase
                    .from('tenant_faqs')
                    .select('*')
                    .eq('tenant_id', tenantData.id)
                    .order('created_at', { ascending: true });
                setFaqs(faqData || []);
            }
        } catch (err) {
            console.error('Error fetching settings:', err);
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
            // Notify other components (Header) to refresh user data
            window.dispatchEvent(new CustomEvent('profile:updated'));
        } catch (err) {
            console.error('AutoSave error:', err);
        }
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

            // Update local state
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

    const handleProfileChange = (field, value) => {
        setProfile(prev => ({ ...prev, [field]: value }));
    };

    const handleUpdateScheduleSlot = async (slotId, updates) => {
        try {
            const { error } = await supabase
                .from('schedules')
                .update(updates)
                .eq('id', slotId);
            if (error) throw error;
            setSchedules(prev => prev.map(sc => sc.id === slotId ? { ...sc, ...updates } : sc));
            message.success('Horario actualizado');
        } catch (err) {
            message.error('Error al actualizar horario: ' + err.message);
        }
    };

    const handleAddScheduleSlot = async (dayId) => {
        try {
            const newSlot = {
                day_of_week: dayId,
                start_time: '09:00:00',
                end_time: '18:00:00',
                is_active: true
            };
            const { data, error } = await supabase
                .from('schedules')
                .insert(newSlot)
                .select()
                .single();
            if (error) throw error;
            setSchedules(prev => [...prev, data]);
            message.success('Horario agregado');
        } catch (err) {
            message.error('Error al agregar horario: ' + err.message);
        }
    };

    const handleDeleteScheduleSlot = async (slotId) => {
        try {
            const { error } = await supabase
                .from('schedules')
                .delete()
                .eq('id', slotId);
            if (error) throw error;
            setSchedules(prev => prev.filter(sc => sc.id !== slotId));
            message.success('Horario eliminado');
        } catch (err) {
            message.error('Error al eliminar horario: ' + err.message);
        }
    };

    const handleAddFAQ = async () => {
        const qEl = document.getElementById('faq-question');
        const aEl = document.getElementById('faq-answer');
        if (!qEl.value.trim() || !aEl.value.trim()) return;

        try {
            const { data, error } = await supabase
                .from('tenant_faqs')
                .insert({
                    question: qEl.value.trim(),
                    answer: aEl.value.trim(),
                    tenant_id: tenant.id
                })
                .select()
                .single();

            if (error) throw error;
            setFaqs([...faqs, data]);
            qEl.value = '';
            aEl.value = '';
            message.success('Pregunta agregada correctamente');
        } catch (err) {
            message.error('Error al agregar FAQ: ' + err.message);
        }
    };

    const handleDeleteFAQ = async (id) => {
        try {
            const { error } = await supabase.from('tenant_faqs').delete().eq('id', id);
            if (error) throw error;
            setFaqs(faqs.filter(f => f.id !== id));
            message.success('FAQ eliminada');
        } catch (err) {
            message.error('Error al eliminar FAQ: ' + err.message);
        }
    };

    const handleAutoSaveChatbot = async (updates) => {
        try {
            const { error } = await supabase
                .from('tenants')
                .update(updates)
                .eq('id', tenant.id);
            if (error) throw error;
            setTenant(prev => ({ ...prev, ...updates }));
            message.success('Ajustes del chatbot actualizados');
        } catch (err) {
            message.error('Error al actualizar chatbot: ' + err.message);
        }
    };

    const handleConnectWhatsApp = async () => {
        try {
            setSaving(true);
            const { data, error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'create', tenant_id: tenant.id }
            });
            if (error) throw error;
            setPollingActive(true);
            message.success('Iniciando conexión con WhatsApp...');
        } catch (err) {
            message.error('Error al conectar WhatsApp: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const checkConnectionStatus = async () => {
        if (!tenant?.whatsapp_instance) return;
        try {
            const { data, error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'get_qr', tenant_id: tenant.id }
            });
            if (error) return;

            if (data.qrcode) {
                setQrCodeData(data.qrcode.base64 || data.qrcode.code);
            }

            if (data.instance?.status === 'open') {
                setInstanceStatus('connected');
                setPollingActive(false);
                setQrCodeData(null);
                await supabase.from('tenants').update({ whatsapp_status: 'connected' }).eq('id', tenant.id);
            }
        } catch (err) {
            console.error('Polling error:', err);
        }
    };

    useEffect(() => {
        let interval;
        if (pollingActive) {
            interval = setInterval(checkConnectionStatus, 5000);
        }
        return () => clearInterval(interval);
    }, [pollingActive, tenant]);

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
                <button onClick={() => setActiveTab('chatbot')} className={`px-6 py-3 font-medium text-sm whitespace-nowrap relative ${activeTab === 'chatbot' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}>{activeTab === 'chatbot' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />}Chatbot AI</button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {activeTab === 'profile' && (
                    <div className="p-8">
                        <div className="flex flex-col md:flex-row gap-8">
                            <div className="flex flex-col items-center gap-4">
                                <div className="relative w-32 h-32 rounded-full bg-gray-50 border-2 border-gray-100 overflow-hidden group">
                                    {(avatarPreview || googleAvatar) ? <img src={avatarPreview || googleAvatar} alt="Avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><User size={48} /></div>}
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer" onClick={() => fileInputRef.current?.click()}><Camera className="text-white" size={24} /></div>
                                </div>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
                                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{googleAvatar && !avatarPreview ? "De Google" : "Personalizada"}</p>
                            </div>
                            <div className="flex-1 max-w-lg space-y-6">
                                <div className="flex justify-between items-center">
                                    <label className="block text-sm font-semibold text-gray-700">Nombre Profesional</label>
                                    <span className="text-[10px] text-gray-400 font-bold bg-gray-50 px-2 py-1 rounded-md">VERSION 2.0</span>
                                </div>
                                <div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={profile.full_name}
                                            onChange={(e) => handleProfileChange('full_name', e.target.value)}
                                            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                        />
                                        <button
                                            onClick={() => handleAutoSaveProfile({ full_name: profile.full_name })}
                                            className="px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-all flex items-center justify-center"
                                            title="Guardar nombre"
                                        >
                                            <Save size={18} />
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-500 font-medium leading-relaxed">
                                        Gestiona tu email y contraseña desde tu cuenta de Google.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'insurances' && (
                    <div className="p-8">
                        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><CreditCard size={20} className="text-teal-600" /> Obras Sociales</h2>
                        <div className="flex flex-wrap gap-2 mb-6">
                            {(profile.accepted_insurances || []).map((ins, i) => (
                                <div key={i} className="flex items-center gap-2 bg-teal-50 text-teal-700 px-4 py-2 rounded-xl text-sm border border-teal-100 font-medium shadow-sm">
                                    {ins}
                                    <X
                                        size={14}
                                        className="cursor-pointer hover:text-teal-900"
                                        onClick={async () => {
                                            const newInsurances = profile.accepted_insurances.filter((_, idx) => idx !== i);
                                            handleProfileChange('accepted_insurances', newInsurances);
                                            await handleAutoSaveProfile({ accepted_insurances: newInsurances });
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input type="text" id="ins-input" placeholder="Agregar nueva obra social..." className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all" />
                            <button
                                onClick={async () => {
                                    const el = document.getElementById('ins-input');
                                    if (el.value.trim()) {
                                        const newInsurances = [...(profile.accepted_insurances || []), el.value.trim()];
                                        handleProfileChange('accepted_insurances', newInsurances);
                                        el.value = '';
                                        await handleAutoSaveProfile({ accepted_insurances: newInsurances });
                                    }
                                }}
                                className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all"
                            >
                                Agregar
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'services' && (
                    <div className="p-8">
                        <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2"><Briefcase size={20} className="text-teal-600" /> Servicios y Prestaciones</h2>
                        <p className="text-sm text-gray-500 mb-6">Configura los servicios que ofreces y su duración estimada para el cálculo de turnos.</p>

                        <div className="space-y-4 mb-6">
                            {(profile.services || []).map((service, i) => (
                                <div key={i} className="flex items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-600">
                                            <Briefcase size={18} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-800">{service.name}</div>
                                            <div className="text-xs text-gray-500">{service.duration} minutos</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            const newServices = profile.services.filter((_, idx) => idx !== i);
                                            handleProfileChange('services', newServices);
                                            await handleAutoSaveProfile({ services: newServices });
                                        }}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="bg-teal-50/30 p-5 rounded-2xl border border-teal-100/50">
                            <div className="flex flex-col md:flex-row gap-4 items-end">
                                <div className="flex-1 w-full">
                                    <label className="block text-[10px] font-bold text-teal-700 uppercase mb-1 ml-1">Nombre del Servicio</label>
                                    <input type="text" id="service-name" placeholder="Ej: Limpieza Completa" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all" />
                                </div>
                                <div className="w-full md:w-32">
                                    <label className="block text-[10px] font-bold text-teal-700 uppercase mb-1 ml-1">Duración (min)</label>
                                    <input type="number" id="service-duration" defaultValue="30" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all" />
                                </div>
                                <div className="w-full md:w-auto">
                                    <button
                                        onClick={async () => {
                                            const nameEl = document.getElementById('service-name');
                                            const durEl = document.getElementById('service-duration');
                                            if (nameEl.value.trim()) {
                                                const id = nameEl.value.toLowerCase().replace(/\s+/g, '_');
                                                const newServices = [...(profile.services || []), { id, name: nameEl.value.trim(), duration: parseInt(durEl.value) || 30 }];
                                                handleProfileChange('services', newServices);
                                                nameEl.value = '';
                                                durEl.value = '30';
                                                await handleAutoSaveProfile({ services: newServices });
                                            }
                                        }}
                                        className="w-full md:w-auto px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all flex items-center justify-center gap-2 h-[46px]"
                                    >
                                        <Plus size={20} />
                                        <span className="md:hidden">Agregar</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'schedule' && (
                    <div className="divide-y divide-gray-50">
                        {DAYS.map(day => {
                            const daySlots = schedules.filter(s => s.day_of_week === day.id);
                            return (
                                <div key={day.id} className="p-6 flex flex-col md:flex-row gap-4 items-start">
                                    <div className="w-32 font-bold text-gray-900 pt-2">{day.name}</div>
                                    <div className="flex-1 space-y-3">
                                        {daySlots.length === 0 ? <div className="text-sm text-gray-400 italic">No laborable</div> : daySlots.map(slot => (
                                            <div key={slot.id} className="flex items-center gap-3 animate-in slide-in-from-left-2">
                                                <input type="time" value={slot.start_time.slice(0, 5)} onChange={(e) => handleUpdateScheduleSlot(slot.id, { start_time: e.target.value })} className="p-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500" />
                                                <span className="text-gray-300">-</span>
                                                <input type="time" value={slot.end_time.slice(0, 5)} onChange={(e) => handleUpdateScheduleSlot(slot.id, { end_time: e.target.value })} className="p-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500" />
                                                <Trash2 size={16} className="text-gray-400 hover:text-red-500 cursor-pointer transition-colors" onClick={() => handleDeleteScheduleSlot(slot.id)} />
                                            </div>
                                        ))}
                                        <button onClick={() => handleAddScheduleSlot(day.id)} className="text-sm text-teal-600 font-bold flex items-center gap-1 hover:text-teal-700 transition-all mt-2"><Plus size={16} /> Agregar horario</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeTab === 'chatbot' && (
                    <div className="p-8 space-y-8">
                        {!tenant ? (
                            <div className="text-center py-12">
                                <p className="text-gray-500 mb-4">Primero completa tu perfil para habilitar el chatbot.</p>
                                <button
                                    onClick={async () => {
                                        const { data: { session } } = await supabase.auth.getSession();
                                        const { data, error } = await supabase.from('tenants').insert({
                                            user_id: session.user.id,
                                            business_name: profile.full_name || 'Mi Clínica',
                                        }).select().single();
                                        if (!error) setTenant(data);
                                    }}
                                    className="px-6 py-2 bg-teal-600 text-white rounded-xl font-bold"
                                >
                                    Habilitar Chatbot
                                </button>
                            </div>
                        ) : (
                            <>
                                <section>
                                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        <MessageSquare size={20} className="text-teal-600" />
                                        Conexión de WhatsApp
                                    </h2>
                                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col md:flex-row items-center gap-8">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className={`w-3 h-3 rounded-full ${instanceStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
                                                <span className="font-bold text-gray-700">
                                                    Estado: {instanceStatus === 'connected' ? 'Conectado' : 'Desconectado'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-500 mb-4">
                                                Conecta tu cuenta de WhatsApp para que el asistente pueda responder a tus pacientes automáticamente.
                                            </p>
                                            {instanceStatus !== 'connected' && (
                                                <button
                                                    onClick={handleConnectWhatsApp}
                                                    disabled={saving || pollingActive}
                                                    className="px-6 py-2 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all disabled:opacity-50"
                                                >
                                                    {pollingActive ? 'Esperando conexión...' : 'Conectar WhatsApp'}
                                                </button>
                                            )}
                                        </div>
                                        {qrCodeData && instanceStatus !== 'connected' && (
                                            <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
                                                <QRCode value={qrCodeData} size={180} />
                                                <p className="text-[10px] text-center mt-2 text-gray-400 font-bold uppercase">Escanea con WhatsApp</p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                <section>
                                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        <Plus size={20} className="text-teal-600" />
                                        Entrenamiento: Preguntas Frecuentes
                                    </h2>
                                    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden mb-6">
                                        <div className="p-6 space-y-4">
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Pregunta del Paciente</label>
                                                <input type="text" id="faq-question" placeholder="Ej: ¿Qué obras sociales aceptan?" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Respuesta del Asistente</label>
                                                <textarea id="faq-answer" rows={2} placeholder="Ej: Aceptamos OSDE, Swiss Medical y Galeno..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all" />
                                            </div>
                                            <button
                                                onClick={handleAddFAQ}
                                                className="w-full py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all flex items-center justify-center gap-2"
                                            >
                                                <Plus size={18} />
                                                <span>Guardar Pregunta</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {faqs.map(faq => (
                                            <div key={faq.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-start gap-4">
                                                <div className="flex-1">
                                                    <div className="font-bold text-gray-800 text-sm mb-1">{faq.question}</div>
                                                    <div className="text-xs text-gray-500">{faq.answer}</div>
                                                </div>
                                                <button onClick={() => handleDeleteFAQ(faq.id)} className="p-2 text-gray-300 hover:text-red-500 transition-all">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                            </>
                        )}
                    </div>
                )}
            </div>
        </div >
    );
}
