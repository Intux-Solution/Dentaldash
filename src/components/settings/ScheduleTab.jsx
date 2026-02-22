import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import { supabase } from '../../config/supabaseClient';
import { message } from 'antd';

const DAYS = [
    { id: 0, name: 'Domingo' },
    { id: 1, name: 'Lunes' },
    { id: 2, name: 'Martes' },
    { id: 3, name: 'Miércoles' },
    { id: 4, name: 'Jueves' },
    { id: 5, name: 'Viernes' },
    { id: 6, name: 'Sábado' },
];

export default function ScheduleTab({ schedules, setSchedules }) {
    const handleUpdateScheduleSlot = async (slotId, updates) => {
        try {
            const { error } = await supabase.from('schedules').update(updates).eq('id', slotId);
            if (error) throw error;
            setSchedules(prev => prev.map(sc => sc.id === slotId ? { ...sc, ...updates } : sc));
            message.success('Horario actualizado');
        } catch (err) {
            message.error('Error al actualizar horario: ' + err.message);
        }
    };

    const handleAddScheduleSlot = async (dayId) => {
        try {
            const existingSlots = schedules.filter(s => s.day_of_week === dayId);
            let defaultStart = '09:00:00';
            let defaultEnd = '18:00:00';

            if (existingSlots.length > 0) {
                defaultStart = '16:00:00';
                defaultEnd = '20:00:00';
            }

            const newSlot = {
                day_of_week: dayId,
                start_time: defaultStart,
                end_time: defaultEnd,
                is_active: true
            };
            const { data, error } = await supabase.from('schedules').insert(newSlot).select().single();
            if (error) throw error;
            setSchedules(prev => [...prev, data]);
            message.success('Horario agregado');
        } catch (err) {
            message.error('Error al agregar horario: ' + err.message);
        }
    };

    const handleDeleteScheduleSlot = async (slotId) => {
        try {
            const { error } = await supabase.from('schedules').delete().eq('id', slotId);
            if (error) throw error;
            setSchedules(prev => prev.filter(sc => sc.id !== slotId));
            message.success('Horario eliminado');
        } catch (err) {
            message.error('Error al eliminar horario: ' + err.message);
        }
    };

    return (
        <div className="divide-y divide-gray-50">
            {DAYS.map(day => {
                const daySlots = schedules.filter(s => s.day_of_week === day.id);
                return (
                    <div key={day.id} className="p-6 flex flex-col md:flex-row gap-4 items-start">
                        <div className="w-32 font-bold text-gray-900 pt-2">{day.name}</div>
                        <div className="flex-1 space-y-3">
                            {daySlots.length === 0 ? (
                                <div className="text-sm text-gray-400 italic">No laborable</div>
                            ) : (
                                daySlots.map((slot, index) => (
                                    <div key={slot.id} className="flex items-center gap-3 animate-in slide-in-from-left-2">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] uppercase text-gray-400 font-bold mb-1">Bloque {index + 1}</span>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="time"
                                                    value={slot.start_time.slice(0, 5)}
                                                    onChange={(e) => handleUpdateScheduleSlot(slot.id, { start_time: e.target.value })}
                                                    className="p-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500"
                                                />
                                                <span className="text-gray-300">-</span>
                                                <input
                                                    type="time"
                                                    value={slot.end_time.slice(0, 5)}
                                                    onChange={(e) => handleUpdateScheduleSlot(slot.id, { end_time: e.target.value })}
                                                    className="p-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500"
                                                />
                                                <Trash2
                                                    size={16}
                                                    className="text-gray-400 hover:text-red-500 cursor-pointer transition-colors"
                                                    onClick={() => handleDeleteScheduleSlot(slot.id)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            <button
                                onClick={() => handleAddScheduleSlot(day.id)}
                                className="text-sm text-teal-600 font-bold flex items-center gap-1 hover:text-teal-700 transition-all mt-2 pl-1"
                            >
                                <Plus size={16} /> Agregar bloque horario
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
