import React, { useRef } from 'react';
import { Camera, User, Save } from 'lucide-react';

export default function ProfileTab({ profile, handleProfileChange, handleAutoSaveProfile, avatarPreview, googleAvatar, handleAvatarChange }) {
    const fileInputRef = useRef(null);

    return (
        <div className="p-8">
            <div className="flex flex-col md:flex-row gap-8">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative w-32 h-32 rounded-full bg-gray-50 border-2 border-gray-100 overflow-hidden group">
                        {(avatarPreview || googleAvatar) ? (
                            <img src={avatarPreview || googleAvatar} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                                <User size={48} />
                            </div>
                        )}
                        <div
                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Camera className="text-white" size={24} />
                        </div>
                    </div>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                        {googleAvatar && !avatarPreview ? "De Google" : "Personalizada"}
                    </p>
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
                        <div className="flex justify-between items-center">
                            <label className="block text-sm font-semibold text-gray-700">Teléfono de Contacto</label>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="tel"
                                value={profile.contact_phone || ''}
                                onChange={(e) => handleProfileChange('contact_phone', e.target.value)}
                                placeholder="Ej: +54 9 11 1234-5678"
                                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                            />
                            <button
                                onClick={() => handleAutoSaveProfile({ contact_phone: profile.contact_phone })}
                                className="px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-all flex items-center justify-center"
                                title="Guardar teléfono"
                            >
                                <Save size={18} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500">Este número será entregado por el asistente virtual cuando el paciente requiera contactar a un humano.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
