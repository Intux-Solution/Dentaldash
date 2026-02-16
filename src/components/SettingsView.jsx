import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabaseClient';
import { Clock, Check, AlertCircle, Save, Plus, Trash2, User, Camera, Loader, X, CreditCard } from 'lucide-react';

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
    const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'insurances' | 'schedule'
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // State for Schedules
    const [schedules, setSchedules] = useState([]);

    // State for Profile
    const [profile, setProfile] = useState({
        full_name: '',
        avatar_url: null,
        user_id: null,
        accepted_insurances: []
    });
    const [googleAvatar, setGoogleAvatar] = useState(null);
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const fileInputRef = useRef(null);

    // Fetch initial data
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            // Set Google Avatar from session metadata
            if (session.user?.user_metadata?.avatar_url) {
                setGoogleAvatar(session.user.user_metadata.avatar_url);
            }

            // 1. Fetch Profile
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (profileData) {
                setProfile({
                    full_name: profileData.full_name || '',
                    avatar_url: profileData.avatar_url,
                    user_id: session.user.id,
                    accepted_insurances: profileData.accepted_insurances || []
                });
                if (profileData.avatar_url) {
                    // Get public URL
                    const { data: { publicUrl } } = supabase
                        .storage
                        .from('avatars')
                        .getPublicUrl(profileData.avatar_url);
                    setAvatarPreview(publicUrl);
                }
            } else {
                // Initialize empty profile if not exists
                setProfile(prev => ({ ...prev, user_id: session.user.id, accepted_insurances: [] }));
            }

            // 2. Fetch Schedules
            const { data: scheduleData, error: scheduleError } = await supabase
                .from('schedules')
                .select('*')
                .order('day_of_week')
                .order('start_time');

            if (scheduleError) throw scheduleError;
            setSchedules(scheduleData || []);

        } catch (err) {
            console.error('Error fetching settings:', err);
            // setError('Error al cargar la configuración.');
        } finally {
            setLoading(false);
        }
    };

    // --- Profile Handlers ---

    const handleAvatarChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setAvatarFile(file);
        const objectUrl = URL.createObjectURL(file);
        setAvatarPreview(objectUrl);
    };

    const handleProfileChange = (field, value) => {
        setProfile(prev => ({ ...prev, [field]: value }));
    };

    const saveProfile = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No hay sesión activa");

            let avatarPath = profile.avatar_url;

            // 1. Upload Avatar if changed
            if (avatarFile) {
                const fileExt = avatarFile.name.split('.').pop();
                const fileName = `${session.user.id}-${Math.random()}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(filePath, avatarFile);

                if (uploadError) throw uploadError;
                avatarPath = filePath;
            }

            // 2. Upsert Profile
            const updates = {
                id: session.user.id,
                full_name: profile.full_name,
                avatar_url: avatarPath,
                accepted_insurances: profile.accepted_insurances || [],
                updated_at: new Date(),
            };

            const { error } = await supabase
                .from('profiles')
                .upsert(updates);

            if (error) throw error;

            // Refresh local state
            setProfile(prev => ({ ...prev, avatar_url: avatarPath }));
            setSuccess('Perfil actualizado correctamente.');

        } catch (err) {
            console.error(err);
            throw new Error('Error al guardar perfil.');
        }
    };

    // --- Schedule Handlers ---

    const handleAddSlot = (dayId) => {
        const newSlot = {
            id: `new-${Date.now()}`,
            day_of_week: dayId,
            start_time: '09:00',
            end_time: '18:00',
            is_active: true,
            isNew: true
        };
        setSchedules(prev => [...prev, newSlot]);
    };

    const handleRemoveSlot = (id) => {
        setSchedules(prev => prev.filter(s => s.id !== id));
    };

    const handleChangeSchedule = (id, field, value) => {
        setSchedules(prev => prev.map(s =>
            s.id === id ? { ...s, [field]: value } : s
        ));
    };

    const saveSchedules = async () => {
        // Logic reused from previous implementation
        try {
            const { data: currentDbSchedules } = await supabase.from('schedules').select('id');
            const currentIds = currentDbSchedules.map(s => s.id);
            const stateIds = schedules.filter(s => !s.isNew).map(s => s.id);

            const toDelete = currentIds.filter(id => !stateIds.includes(id));

            if (toDelete.length > 0) {
                const { error: delError } = await supabase
                    .from('schedules')
                    .delete()
                    .in('id', toDelete);
                if (delError) throw delError;
            }

            const toUpsert = schedules.map(s => {
                const { id, isNew, created_at, updated_at, ...rest } = s;
                if (isNew) return rest;
                return { id, ...rest };
            });

            if (toUpsert.length > 0) {
                const { error: upsertError } = await supabase
                    .from('schedules')
                    .upsert(toUpsert);
                if (upsertError) throw upsertError;
            }

            await fetchData(); // Reload
            setSuccess('Horarios guardados exitosamente.');

        } catch (err) {
            throw new Error('Error al guardar horarios.');
        }
    };

    // --- Main Save ---
    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            if (activeTab === 'profile' || activeTab === 'insurances') {
                await saveProfile();
            } else if (activeTab === 'schedule') {
                await saveSchedules();
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Cargando configuración...</div>;
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
                    <p className="text-gray-500">Gestiona tu perfil, obras sociales y horarios.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                    {saving ? (
                        <> <Loader size={18} className="animate-spin" /> Guardando... </>
                    ) : (
                        <> <Save size={18} /> Guardar Cambios </>
                    )}
                </button>
            </div>

            {error && (
                <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                    <AlertCircle size={20} />
                    {error}
                </div>
            )}

            {success && (
                <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
                    <Check size={20} />
                    {success}
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b mb-6 overflow-x-auto no-scrollbar">
                <button
                    onClick={() => setActiveTab('profile')}
                    className={`px-6 py-3 font-medium text-sm transition-colors relative whitespace-nowrap ${activeTab === 'profile' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    Perfil
                    {activeTab === 'profile' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('insurances')}
                    className={`px-6 py-3 font-medium text-sm transition-colors relative whitespace-nowrap ${activeTab === 'insurances' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    Obras Sociales
                    {activeTab === 'insurances' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('schedule')}
                    className={`px-6 py-3 font-medium text-sm transition-colors relative whitespace-nowrap ${activeTab === 'schedule' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    Horarios de Atención
                    {activeTab === 'schedule' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />
                    )}
                </button>
            </div>

            {/* Content */}
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden min-h-[400px]">

                {/* PROFILE TAB */}
                {activeTab === 'profile' && (
                    <div className="p-8">
                        <div className="flex flex-col md:flex-row gap-8">
                            {/* Avatar */}
                            <div className="flex flex-col items-center gap-4">
                                <div className="relative w-32 h-32 rounded-full bg-gray-100 border-2 border-gray-200 overflow-hidden group">
                                    {(avatarPreview || googleAvatar) ? (
                                        <img src={avatarPreview || googleAvatar} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                                            <User size={48} />
                                        </div>
                                    )}
                                    <div
                                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <Camera className="text-white" size={24} />
                                    </div>
                                </div>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleAvatarChange}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-sm text-teal-600 font-medium hover:text-teal-700"
                                >
                                    Cambiar Foto
                                </button>
                                <p className="text-[10px] text-gray-400 text-center max-w-[120px]">
                                    {googleAvatar && !avatarPreview ? "Usando foto de Google" : "Foto personalizada"}
                                </p>
                            </div>

                            {/* Inputs */}
                            <div className="flex-1 space-y-6 max-w-lg">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Nombre Completo
                                    </label>
                                    <input
                                        type="text"
                                        value={profile.full_name}
                                        onChange={(e) => handleProfileChange('full_name', e.target.value)}
                                        placeholder="Ej. Dr. Juan Pérez"
                                        className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Este nombre será visible para tus pacientes.
                                    </p>
                                </div>

                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800">
                                    <p>Tu cuenta está vinculada a Google. La gestión de tu email y contraseña se realiza desde tu cuenta de Google.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* INSURANCES TAB */}
                {activeTab === 'insurances' && (
                    <div className="p-8">
                        <div className="max-w-xl">
                            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                <CreditCard size={20} /> Obras Sociales Atendidas
                            </h2>
                            <p className="text-sm text-gray-500 mb-6">
                                Agregá las obras sociales y prepagas con las que trabajás. Estas opciones aparecerán en el formulario de reserva para tus pacientes.
                            </p>

                            <div className="flex flex-wrap gap-2 mb-6">
                                {(profile.accepted_insurances || []).length === 0 ? (
                                    <div className="w-full p-4 bg-gray-50 border border-dashed rounded-xl text-center text-gray-400 text-sm">
                                        No has agregado ninguna obra social todavía.
                                    </div>
                                ) : (
                                    (profile.accepted_insurances || []).map((ins, index) => (
                                        <div key={index} className="flex items-center gap-2 bg-teal-50 text-teal-700 px-4 py-2 rounded-xl text-sm border border-teal-100 shadow-sm animate-fade-in">
                                            <span className="font-medium">{ins}</span>
                                            <button
                                                onClick={() => {
                                                    const newInsurances = profile.accepted_insurances.filter((_, i) => i !== index);
                                                    handleProfileChange('accepted_insurances', newInsurances);
                                                }}
                                                className="hover:bg-teal-200/50 rounded-full p-1 transition-colors"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Ej. OSDE, Swiss Medical, Galeno..."
                                    className="flex-1 px-4 py-3 border rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const val = e.target.value.trim();
                                            if (val) {
                                                const current = profile.accepted_insurances || [];
                                                if (!current.includes(val)) {
                                                    handleProfileChange('accepted_insurances', [...current, val]);
                                                }
                                                e.target.value = '';
                                            }
                                        }
                                    }}
                                    id="insurance-input"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        const input = document.getElementById('insurance-input');
                                        const val = input.value.trim();
                                        if (val) {
                                            const current = profile.accepted_insurances || [];
                                            if (!current.includes(val)) {
                                                handleProfileChange('accepted_insurances', [...current, val]);
                                            }
                                            input.value = '';
                                        }
                                    }}
                                    className="px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 font-medium text-sm transition-colors shadow-sm"
                                >
                                    Agregar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* SCHEDULE TAB */}
                {activeTab === 'schedule' && (
                    <div>
                        <div className="p-6 border-b bg-gray-50">
                            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <Clock size={20} /> Configurar Días y Horarios
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">Define los rangos horarios en los que aceptas turnos online.</p>
                        </div>
                        <div className="divide-y">
                            {DAYS.map(day => {
                                const daySchedules = schedules.filter(s => s.day_of_week === day.id);
                                const isActive = daySchedules.some(s => s.is_active);

                                return (
                                    <div key={day.id} className="p-6 hover:bg-gray-50/50 transition-colors">
                                        <div className="flex flex-col md:flex-row md:items-start gap-4">
                                            {/* Day Label */}
                                            <div className="w-32 pt-2">
                                                <span className={`font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                                                    {day.name}
                                                </span>
                                            </div>

                                            {/* Slots */}
                                            <div className="flex-1 space-y-3">
                                                {daySchedules.length === 0 ? (
                                                    <div className="text-sm text-gray-400 italic py-2">No laborable</div>
                                                ) : (
                                                    daySchedules.map((slot) => (
                                                        <div key={slot.id} className="flex items-center gap-3">
                                                            <input
                                                                type="time"
                                                                value={slot.start_time?.slice(0, 5)}
                                                                onChange={(e) => handleChangeSchedule(slot.id, 'start_time', e.target.value)}
                                                                className="p-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                                                            />
                                                            <span className="text-gray-400">-</span>
                                                            <input
                                                                type="time"
                                                                value={slot.end_time?.slice(0, 5)}
                                                                onChange={(e) => handleChangeSchedule(slot.id, 'end_time', e.target.value)}
                                                                className="p-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                                                            />
                                                            <button
                                                                onClick={() => handleRemoveSlot(slot.id)}
                                                                className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                                                title="Eliminar horario"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    ))
                                                )}

                                                <button
                                                    onClick={() => handleAddSlot(day.id)}
                                                    className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 mt-2"
                                                >
                                                    <Plus size={16} /> Agregar horario
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
