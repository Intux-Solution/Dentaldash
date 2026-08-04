import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Copy, Check, Save, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { ProfileData } from './useSettings';
import { PublicBookingService } from '../../services/PublicBookingService';

interface BookingLinkTabProps {
    profile: ProfileData;
    handleAutoSaveProfile: (updates: Partial<ProfileData>) => void;
}

export default function BookingLinkTab({ profile, handleAutoSaveProfile }: BookingLinkTabProps) {
    const [slug, setSlug] = useState(profile?.booking_slug ?? '');
    const [checking, setChecking] = useState(false);
    const [available, setAvailable] = useState<boolean | null>(null);
    const [slugError, setSlugError] = useState('');
    const [copied, setCopied] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const savedSlug = profile?.booking_slug;
    const bookingUrl = savedSlug
        ? `${window.location.origin}/agendar/${savedSlug}`
        : null;

    // Sync cuando cambia el slug guardado (después de un save)
    useEffect(() => {
        setSlug(profile?.booking_slug ?? '');
        setAvailable(null);
    }, [profile?.booking_slug]);

    const checkAvailability = useCallback(async (value: string) => {
        if (!value) {
            setAvailable(null);
            return;
        }
        if (!/^[a-z0-9-]+$/.test(value)) {
            setAvailable(null);
            setSlugError('Solo letras minúsculas, números y guiones (-)');
            return;
        }
        setChecking(true);
        try {
            const isAvailable = await PublicBookingService.checkSlug(value, profile?.user_id);
            setAvailable(isAvailable);
        } catch {
            setAvailable(null);
        } finally {
            setChecking(false);
        }
    }, [profile?.user_id]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        setSlug(value);
        setAvailable(null);
        setSlugError('');

        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (value && value !== savedSlug) {
            debounceRef.current = setTimeout(() => checkAvailability(value), 700);
        }
    };

    const handleSave = () => {
        if (slug && !/^[a-z0-9-]+$/.test(slug)) {
            setSlugError('Solo letras minúsculas, números y guiones (-)');
            return;
        }
        if (slug && available === false) {
            setSlugError('Este link ya está en uso, elegí otro.');
            return;
        }
        handleAutoSaveProfile({ booking_slug: slug || null });
    };

    const handleCopy = () => {
        if (!bookingUrl) return;
        navigator.clipboard.writeText(bookingUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const slugChanged = slug !== (savedSlug ?? '');
    const canSave = slugChanged && (!slug || available !== false) && !checking;

    return (
        <div className="p-8 space-y-6">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <Link size={16} className="text-teal-600" />
                    <h2 className="text-base font-semibold text-gray-800">Link de reservas para pacientes</h2>
                </div>
                <p className="text-sm text-gray-500">
                    Compartí este link con tus pacientes para que puedan agendar un turno sin necesidad de crear una cuenta.
                </p>
            </div>

            {/* URL actual guardada */}
            {bookingUrl ? (
                <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-teal-500 font-medium mb-0.5">Tu link actual</p>
                        <p className="text-sm text-teal-800 font-medium truncate">{bookingUrl}</p>
                    </div>
                    <button
                        onClick={handleCopy}
                        className="shrink-0 flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-800 font-medium transition-colors px-2 py-1 rounded-lg hover:bg-teal-100"
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? 'Copiado' : 'Copiar'}
                    </button>
                </div>
            ) : (
                <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl px-4 py-4 text-sm text-gray-400 text-center">
                    Todavía no configuraste tu link de reservas.
                </div>
            )}

            {/* Editor del slug */}
            <div className="space-y-3">
                <label className="block text-sm font-semibold text-gray-700">
                    {savedSlug ? 'Cambiar link' : 'Crear tu link'}
                </label>
                <div className="flex gap-2">
                    <div className="flex-1 flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-teal-400">
                        <span className="px-3 py-2.5 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 whitespace-nowrap shrink-0">
                            {window.location.origin}/agendar/
                        </span>
                        <input
                            type="text"
                            value={slug}
                            onChange={handleChange}
                            placeholder="mi-consultorio"
                            className="flex-1 px-3 py-2.5 text-sm focus:outline-none bg-white min-w-0"
                        />
                        <div className="pr-3 shrink-0">
                            {checking && <Loader2 size={14} className="animate-spin text-gray-400" />}
                            {!checking && slug && slug !== savedSlug && available === true && (
                                <CheckCircle size={14} className="text-green-500" />
                            )}
                            {!checking && slug && slug !== savedSlug && available === false && (
                                <XCircle size={14} className="text-red-500" />
                            )}
                        </div>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={!canSave}
                        className="px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-all flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Guardar link"
                    >
                        <Save size={18} />
                    </button>
                </div>

                {/* Feedback de disponibilidad */}
                {!slugError && slug && slug !== savedSlug && !checking && available === true && (
                    <p className="text-xs text-green-600 font-medium">Disponible</p>
                )}
                {!slugError && slug && slug !== savedSlug && !checking && available === false && (
                    <p className="text-xs text-red-500 font-medium">Este link ya está en uso, elegí otro.</p>
                )}
                {slugError && <p className="text-xs text-red-500">{slugError}</p>}

                <p className="text-xs text-gray-400">
                    Solo letras minúsculas, números y guiones. Ej: <span className="font-mono">dr-garcia</span>, <span className="font-mono">consultorio-sur</span>
                </p>
            </div>

            {/* Instrucciones */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">¿Cómo funciona?</p>
                <ul className="space-y-1.5 text-sm text-gray-500">
                    <li>• El paciente abre tu link y ve tus servicios, horarios y días disponibles.</li>
                    <li>• Selecciona servicio, fecha y horario, completa sus datos y confirma.</li>
                    <li>• El turno aparece en tu agenda con estado <span className="font-medium text-gray-700">Pendiente</span>.</li>
                    <li>• No necesita crear una cuenta ni instalar nada.</li>
                </ul>
            </div>
        </div>
    );
}
