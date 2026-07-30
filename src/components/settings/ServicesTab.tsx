import { useState } from 'react';
import { Briefcase, Trash2, Plus } from 'lucide-react';
import type { ProfileData, Service } from './useSettings';

const DEFAULT_DURATION = 30;

interface ServicesTabProps {
    profile: ProfileData;
    handleProfileChange: (field: string, value: unknown) => void;
    handleAutoSaveProfile: (updates: Partial<ProfileData>) => Promise<void> | void;
}

export default function ServicesTab({ profile, handleProfileChange, handleAutoSaveProfile }: ServicesTabProps) {
    // Inputs controlados: antes se leían y limpiaban con `document.getElementById`,
    // lo que además colisionaba si el tab se montaba dos veces (los ids son globales).
    const [newName, setNewName] = useState('');
    const [newDuration, setNewDuration] = useState(DEFAULT_DURATION);

    const services: Service[] = profile.services || [];

    const handleAdd = async () => {
        const name = newName.trim();
        if (!name) return;

        const service: Service = {
            id: name.toLowerCase().replace(/\s+/g, '_'),
            name,
            duration: newDuration > 0 ? newDuration : DEFAULT_DURATION,
        };
        const newServices = [...services, service];

        handleProfileChange('services', newServices);
        setNewName('');
        setNewDuration(DEFAULT_DURATION);
        await handleAutoSaveProfile({ services: newServices });
    };

    const handleRemove = async (index: number) => {
        const newServices = services.filter((_, idx) => idx !== index);
        handleProfileChange('services', newServices);
        await handleAutoSaveProfile({ services: newServices });
    };

    return (
        <div className="p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                <Briefcase size={20} className="text-teal-600" /> Servicios y Prestaciones
            </h2>
            <p className="text-sm text-gray-500 mb-6">Configura los servicios que ofreces y su duración estimada para el cálculo de turnos.</p>

            <div className="space-y-4 mb-6">
                {services.map((service, i) => (
                    <div key={service.id || i} className="flex items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-100">
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
                            onClick={() => handleRemove(i)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            aria-label={`Eliminar ${service.name}`}
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
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                            placeholder="Ej: Limpieza Completa"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                        />
                    </div>
                    <div className="w-full md:w-32">
                        <label className="block text-[10px] font-bold text-teal-700 uppercase mb-1 ml-1">Duración (min)</label>
                        <input
                            type="number"
                            min={1}
                            value={newDuration}
                            onChange={(e) => setNewDuration(Number(e.target.value))}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                        />
                    </div>
                    <div className="w-full md:w-auto">
                        <button
                            onClick={handleAdd}
                            disabled={!newName.trim()}
                            className="w-full md:w-auto px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all flex items-center justify-center gap-2 h-[46px] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus size={20} />
                            <span className="md:hidden">Agregar</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
