import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Info } from 'lucide-react';
import ModalShell from './ModalShell';
import { TOUR_STEPS } from '../content/helpGuides';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { supabase } from '../config/supabaseClient';

interface WelcomeTourProps {
    /** Se dispara al cerrarse, después de persistir (si corresponde). */
    onClose?: () => void;
    /**
     * `true` (primer ingreso) marca `profiles.onboarding_completed_at` al cerrar
     * para que no vuelva a aparecer solo. `false` cuando se reabre a mano desde
     * la sección de Ayuda: ahí es una consulta, no un onboarding.
     */
    persist?: boolean;
}

export default function WelcomeTour({ onClose, persist = true }: WelcomeTourProps) {
    const navigate = useNavigate();
    const { session, reloadProfile } = useAuth();
    const { canUse } = useSubscription();

    const [open, setOpen] = useState(true);
    const [index, setIndex] = useState(0);

    // Los pasos con dos capturas son más altos que el modal. Sin esto, al pasar
    // al siguiente el usuario aterriza a mitad de la pantalla anterior: el body
    // scrollable es de ModalShell y conserva su posición entre renders.
    const topRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        topRef.current?.scrollIntoView({ block: 'start' });
    }, [index]);

    // Un paso sobre una funcionalidad que el plan no incluye solo genera
    // frustración: se omite, igual que hace SettingsView con sus tabs.
    const steps = useMemo(
        () => TOUR_STEPS.filter((s) => !s.featureKey || canUse(s.featureKey)),
        [canUse]
    );

    const step = steps[index];
    const isLast = index === steps.length - 1;

    const close = () => {
        // El cierre es inmediato y la escritura va detrás: si la red falla, el
        // usuario ya salió del modal (a lo sumo el tour reaparece la próxima vez).
        setOpen(false);
        onClose?.();

        if (persist && session?.user?.id) {
            supabase
                .from('profiles')
                .update({ onboarding_completed_at: new Date().toISOString() })
                .eq('id', session.user.id)
                .then(({ error }) => {
                    if (error) {
                        console.error('No se pudo marcar el onboarding como visto:', error);
                        return;
                    }
                    reloadProfile();
                });
        }
    };

    const goToSetting = (to: string) => {
        close();
        navigate(to);
    };

    if (!open || !step) return null;

    const progress = ((index + 1) / steps.length) * 100;

    const footer = (
        <div className="flex items-center justify-between gap-3">
            <div className="hidden sm:flex items-center gap-1.5">
                {steps.map((s, i) => (
                    <span
                        key={s.title}
                        className={`h-1.5 rounded-full transition-all ${
                            i === index ? 'w-5 bg-teal-600' : 'w-1.5 bg-gray-300'
                        }`}
                    />
                ))}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
                {index > 0 && (
                    <button
                        type="button"
                        onClick={() => setIndex((i) => i - 1)}
                        className="inline-flex items-center justify-center gap-1 flex-1 sm:flex-none px-4 py-2 rounded-xl border text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        <ArrowLeft size={16} />
                        Atrás
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => (isLast ? close() : setIndex((i) => i + 1))}
                    className="inline-flex items-center justify-center gap-1 flex-1 sm:flex-none px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors"
                >
                    {isLast ? 'Empezar' : 'Siguiente'}
                    {!isLast && <ArrowRight size={16} />}
                </button>
            </div>
        </div>
    );

    return (
        <ModalShell title="Primeros pasos en DentalDash" onClose={close} maxWidth="max-w-2xl" footer={footer}>
            <div className="space-y-5">
                <div ref={topRef} />

                {/* Progreso */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-teal-600">
                            Paso {index + 1} de {steps.length}
                        </span>
                        <button
                            type="button"
                            onClick={close}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            Ver después
                        </button>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-teal-600 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                <div>
                    <h4 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h4>
                    {step.body.map((p, i) => (
                        <p key={i} className="text-sm text-gray-600 leading-relaxed mb-2 last:mb-0">
                            {p}
                        </p>
                    ))}
                </div>

                {step.images?.map((src) => (
                    <img
                        key={src}
                        src={src}
                        alt={step.title}
                        loading="lazy"
                        className="w-full rounded-xl border border-gray-200 shadow-sm"
                    />
                ))}

                {step.note && (
                    <div className="flex gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                        <Info size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-900 leading-relaxed">{step.note}</p>
                    </div>
                )}

                {step.link && (
                    <button
                        type="button"
                        onClick={() => goToSetting(step.link!.to)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700 transition-colors"
                    >
                        {step.link.label}
                        <ArrowRight size={16} />
                    </button>
                )}
            </div>
        </ModalShell>
    );
}
