import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabaseClient';
import { Clock, Check, AlertCircle, Save, Plus, Trash2, User, Camera, Loader } from 'lucide-react';

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
    const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'schedule'
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
        user_id: null
    });
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
                    user_id: session.user.id
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
                setProfile(prev => ({ ...prev, user_id: session.user.id }));
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
            if (activeTab === 'profile') {
                await saveProfile();
            } else {
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
                    <p className="text-gray-500">Gestiona tu perfil y horarios de atención.</p>
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
            <div className="flex border-b mb-6">
                <button
                    onClick={() => setActiveTab('profile')}
                    className={`px-6 py-3 font-medium text-sm transition-colors relative ${activeTab === 'profile' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    Perfil
                    {activeTab === 'profile' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('schedule')}
                    className={`px-6 py-3 font-medium text-sm transition-colors relative ${activeTab === 'schedule' ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'
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
                                    {avatarPreview ? (
                                        <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
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
                                    <p>Tu email de inicio de sesión no se puede cambiar aquí.</p>
                                </div>
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
