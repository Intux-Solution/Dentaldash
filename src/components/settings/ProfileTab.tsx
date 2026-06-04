import React, { useRef, useState } from 'react';
import { Camera, User, Save, Link, Copy, Check } from 'lucide-react';
import { ProfileData } from './useSettings';

interface ProfileTabProps {
    profile: ProfileData;
    handleProfileChange: (field: string, value: any) => void;
    handleAutoSaveProfile: (updates: Partial<ProfileData>) => void;
    avatarPreview: string | null;
    googleAvatar: string | null;
    handleAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function ProfileTab({ profile, handleProfileChange, handleAutoSaveProfile, avatarPreview, googleAvatar, handleAvatarChange }: ProfileTabProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [copied, setCopied] = useState(false);
    const [slugError, setSlugError] = useState('');

    const bookingUrl = profile?.booking_slug
        ? `${window.location.origin}/agendar/${profile.booking_slug}`
        : null;

    const handleCopyLink = () => {
        if (!bookingUrl) return;
        navigator.clipboard.writeText(bookingUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleSaveSlug = () => {
        const slug = (profile?.booking_slug ?? '').trim().toLowerCase();
        if (slug && !/^[a-z0-9-]+$/.test(slug)) {
            setSlugError('Solo letras minúsculas, números y guiones (-)');
            return;
        }
        setSlugError('');
        handleAutoSaveProfile({ booking_slug: slug || null });
    };

    return (
        <div className="p-8">
            <div className="flex flex-col md:flex-row gap-8">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative w-32 h-32 rounded-full bg-gray-50 border-2 border-gray-100 overflow-hidden group">
                        {(avatarPreview || googleAvatar) ? (
                            <img src={(avatarPreview || googleAvatar) ?? undefined} alt="Avatar" className="w-full h-full object-cover" />
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
                                value={profile?.full_name || ''}
                                onChange={(e) => {
                                    handleProfileChange('full_name', e.target.value);
                                    handleProfileChange('business_name', e.target.value);
                                }}
                                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                            />
                            <button
                                onClick={() => handleAutoSaveProfile({ full_name: profile.full_name, business_name: profile.full_name })}
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
                                value={profile?.contact_phone || ''}
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

                    {/* Link de reservas */}
                    <div className="space-y-3 pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                            <Link size={15} className="text-teal-600" />
                            <label className="block text-sm font-semibold text-gray-700">Link de reservas para pacientes</label>
                        </div>
                        <p className="text-xs text-gray-500">
                            Compartí este link con tus pacientes para que puedan agendar un turno sin necesidad de llamar.
                        </p>
                        <div className="flex gap-2">
                            <div className="flex-1 flex items-center border border-gray-200 rounded-xl overflow-hidden">
                                <span className="px-3 py-2.5 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 whitespace-nowrap">
                                    {window.location.origin}/agendar/
                                </span>
                                <input
                                    type="text"
                                    value={profile?.booking_slug ?? ''}
                                    onChange={(e) => {
                                        setSlugError('');
                                        handleProfileChange('booking_slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                                    }}
                                    placeholder="mi-consultorio"
                                    className="flex-1 px-3 py-2.5 text-sm focus:outline-none bg-white"
                                />
                            </div>
                            <button
                                onClick={handleSaveSlug}
                                className="px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-all flex items-center justify-center"
                                title="Guardar slug"
                            >
                                <Save size={18} />
                            </button>
                        </div>
                        {slugError && <p className="text-xs text-red-500">{slugError}</p>}
                        {bookingUrl && (
                            <div className="flex items-center gap-2 bg-teal-50 rounded-xl px-4 py-2.5">
                                <span className="flex-1 text-sm text-teal-700 font-medium truncate">{bookingUrl}</span>
                                <button
                                    onClick={handleCopyLink}
                                    className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-800 font-medium transition-colors shrink-0"
                                >
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                    {copied ? 'Copiado' : 'Copiar'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
