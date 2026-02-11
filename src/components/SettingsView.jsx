import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';
import { Clock, Check, AlertCircle, Save, Plus, Trash2 } from 'lucide-react';

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
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Fetch schedules
    useEffect(() => {
        fetchSchedules();
    }, []);

    const fetchSchedules = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('schedules')
                .select('*')
                .order('day_of_week')
                .order('start_time');

            if (error) throw error;
            setSchedules(data || []);
        } catch (err) {
            console.error('Error fetching schedules:', err);
            setError('Error al cargar horarios. Asegúrate de haber ejecutado la migración en Supabase.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddSlot = (dayId) => {
        // Add temporary slot to state (not saved yet)
        // We use a negative ID to indicate new item
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

    const handleChange = (id, field, value) => {
        setSchedules(prev => prev.map(s =>
            s.id === id ? { ...s, [field]: value } : s
        ));
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            // 1. Prepare data
            // We need to handle deletions, updates, and insertions.
            // Easiest strategy for this simple UI: Delete all for these days and re-insert?
            // Or just upsert?
            // "schedules" table has ID. "isNew" items don't have real IDs.

            // Let's identifying deleted items is hard with just local state filtering.
            // Better strategy: We can't easily track deletions unless we keep a list of original IDs.
            // Simplification: We will upsert all current items. 
            // User has to explicitly delete items in UI which removes them from state.
            // BUT we need to delete them from DB too.
            // So, let's fetch current DB state, compare, and delete missing.

            const { data: currentDbSchedules } = await supabase.from('schedules').select('id');
            const currentIds = currentDbSchedules.map(s => s.id);
            const stateIds = schedules.filter(s => !s.isNew).map(s => s.id);

            const toDelete = currentIds.filter(id => !stateIds.includes(id));

            // 2. Delete removed
            if (toDelete.length > 0) {
                const { error: delError } = await supabase
                    .from('schedules')
                    .delete()
                    .in('id', toDelete);
                if (delError) throw delError;
            }

            // 3. Upsert (Update existing + Insert new)
            const toUpsert = schedules.map(s => {
                const { id, isNew, created_at, updated_at, ...rest } = s;
                // If it's new, don't send ID (let DB generate)
                // If it's existing, send ID
                if (isNew) return rest;
                return { id, ...rest };
            });

            if (toUpsert.length > 0) {
                const { error: upsertError } = await supabase
                    .from('schedules')
                    .upsert(toUpsert);
                if (upsertError) throw upsertError;
            }

            await fetchSchedules(); // Reload to get real IDs and sorted order
            setSuccess('Horarios guardados exitosamente.');

        } catch (err) {
            console.error('Error saving schedules:', err);
            setError(err.message || 'Error al guardar cambios.');
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
                    <p className="text-gray-500">Gestiona tus horarios de atención y preferencias.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                    {saving ? 'Guardando...' : <> <Save size={18} /> Guardar Cambios </>}
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

            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                <div className="p-6 border-b bg-gray-50">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Clock size={20} /> Horarios de Atención
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Define los días y rangos horarios en los que aceptas turnos.</p>
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
                                            daySchedules.map((slot, index) => (
                                                <div key={slot.id} className="flex items-center gap-3">
                                                    <input
                                                        type="time"
                                                        value={slot.start_time?.slice(0, 5)}
                                                        onChange={(e) => handleChange(slot.id, 'start_time', e.target.value)}
                                                        className="p-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                                                    />
                                                    <span className="text-gray-400">-</span>
                                                    <input
                                                        type="time"
                                                        value={slot.end_time?.slice(0, 5)}
                                                        onChange={(e) => handleChange(slot.id, 'end_time', e.target.value)}
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
        </div>
    );
}
