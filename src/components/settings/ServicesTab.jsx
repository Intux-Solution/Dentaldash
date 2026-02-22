import React from 'react';
import { Briefcase, Trash2, Plus } from 'lucide-react';

export default function ServicesTab({ profile, handleProfileChange, handleAutoSaveProfile }) {
    const handleAdd = async () => {
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
    };

    const handleRemove = async (index) => {
        const newServices = profile.services.filter((_, idx) => idx !== index);
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
                            onClick={() => handleRemove(i)}
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
                            onClick={handleAdd}
                            className="w-full md:w-auto px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all flex items-center justify-center gap-2 h-[46px]"
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
