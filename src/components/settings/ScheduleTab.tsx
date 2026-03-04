import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import { ScheduleData } from './useSettings'; // Import type from useSettings

interface ScheduleTabProps {
    schedules: ScheduleData[];
    updateSchedule: (params: { slotId: number; updates: Partial<ScheduleData> }) => void;
    addSchedule: (dayId: number) => void;
    deleteSchedule: (slotId: number) => void;
}

const DAYS = [
    { id: 0, name: 'Domingo' },
    { id: 1, name: 'Lunes' },
    { id: 2, name: 'Martes' },
    { id: 3, name: 'Miércoles' },
    { id: 4, name: 'Jueves' },
    { id: 5, name: 'Viernes' },
    { id: 6, name: 'Sábado' },
];

export default function ScheduleTab({ schedules, updateSchedule, addSchedule, deleteSchedule }: ScheduleTabProps) {
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
                                                    defaultValue={slot.start_time.slice(0, 5)}
                                                    onBlur={(e) => { if (e.target.value !== slot.start_time.slice(0, 5)) updateSchedule({ slotId: slot.id, updates: { start_time: e.target.value } }); }}
                                                    className="p-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500"
                                                />
                                                <span className="text-gray-300">-</span>
                                                <input
                                                    type="time"
                                                    defaultValue={slot.end_time.slice(0, 5)}
                                                    onBlur={(e) => { if (e.target.value !== slot.end_time.slice(0, 5)) updateSchedule({ slotId: slot.id, updates: { end_time: e.target.value } }); }}
                                                    className="p-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500"
                                                />
                                                <Trash2
                                                    size={16}
                                                    className="text-gray-400 hover:text-red-500 cursor-pointer transition-colors"
                                                    onClick={() => deleteSchedule(slot.id)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            <button
                                onClick={() => addSchedule(day.id)}
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
