import React from 'react';
import { Clock, Loader } from 'lucide-react';

interface TimeSlotGridProps {
    loadingAvailability: boolean;
    availableSlots: string[];
    selectedHora: string;
    setSelectedHora: (hora: string) => void;
}

export default function TimeSlotGrid({
    loadingAvailability,
    availableSlots,
    selectedHora,
    setSelectedHora,
}: TimeSlotGridProps) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="inline w-4 h-4 mr-1" />
                Horario Disponible
            </label>
            {loadingAvailability ? (
                <div className="flex items-center gap-2 p-3 text-gray-600">
                    <Loader className="w-5 h-5 animate-spin" />
                    Cargando horarios disponibles...
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {availableSlots.map((slot) => (
                        <button
                            key={slot}
                            type="button"
                            onClick={() => {
                                setSelectedHora(slot);
                            }}
                            className={`p-3 text-sm rounded-lg border transition-colors focus:outline-none ${selectedHora === slot
                                ? 'bg-teal-600 text-white border-teal-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:border-teal-500'
                                }`}
                        >
                            {slot} hs
                        </button>
                    ))}
                </div>
            )}
            {!loadingAvailability && availableSlots.length === 0 && (
                <p className="text-gray-500 text-sm p-3 bg-gray-50 rounded-lg">
                    No hay horarios disponibles para esta fecha y tipo de turno.
                </p>
            )}
        </div>
    );
}
