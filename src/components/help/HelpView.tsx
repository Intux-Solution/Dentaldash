import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, PlayCircle, LifeBuoy } from 'lucide-react';
import { HELP_GUIDES, getGuide } from '../../content/helpGuides';
import { useSubscription } from '../../context/SubscriptionContext';
import HelpGuideContent from './HelpGuideContent';
import SupportMessageModal from '../SupportMessageModal';
import WelcomeTour from '../WelcomeTour';

export default function HelpView() {
    // La guía activa vive en la URL (?guia=configuracion), igual que el ?tab= de
    // SettingsView: así el checklist y el tour pueden linkear a una guía puntual.
    const [searchParams, setSearchParams] = useSearchParams();
    const { canUse } = useSubscription();

    const [supportOpen, setSupportOpen] = useState(false);
    const [tourOpen, setTourOpen] = useState(false);

    const activeGuide = getGuide(searchParams.get('guia'));

    const selectGuide = (id: string | null) => {
        if (id) setSearchParams({ guia: id });
        else setSearchParams({});
    };

    return (
        <div className="max-w-5xl mx-auto p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Ayuda</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Guías paso a paso para sacarle el jugo a DentalDash.
                </p>
            </div>

            {/* Accesos rápidos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                <button
                    type="button"
                    onClick={() => setTourOpen(true)}
                    className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 text-left hover:border-teal-500 hover:shadow-md transition-all"
                >
                    <PlayCircle size={22} className="text-teal-600 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-gray-900">Ver el tour de bienvenida</p>
                        <p className="text-xs text-gray-500">Los primeros pasos, en un minuto</p>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => setSupportOpen(true)}
                    className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 text-left hover:border-teal-500 hover:shadow-md transition-all"
                >
                    <LifeBuoy size={22} className="text-teal-600 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-gray-900">Contactar soporte</p>
                        <p className="text-xs text-gray-500">¿No encontrás lo que buscás? Escribinos</p>
                    </div>
                </button>
            </div>

            {activeGuide ? (
                <>
                    <button
                        type="button"
                        onClick={() => selectGuide(null)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors mb-4"
                    >
                        <ArrowLeft size={16} />
                        Todas las guías
                    </button>
                    <HelpGuideContent guide={activeGuide} canUse={canUse} />
                </>
            ) : (
                <div className="space-y-3">
                    {HELP_GUIDES.map((guide) => {
                        const Icon = guide.icon;
                        return (
                            <button
                                key={guide.id}
                                type="button"
                                onClick={() => selectGuide(guide.id)}
                                className="group w-full flex items-center gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 text-left hover:border-teal-500 hover:shadow-md transition-all"
                            >
                                <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                                    <Icon size={22} className="text-teal-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-base font-semibold text-gray-900">{guide.title}</p>
                                    <p className="text-sm text-gray-500">{guide.summary}</p>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <span className="hidden sm:inline text-xs text-gray-400">
                                        {guide.steps.length} pasos
                                    </span>
                                    <ChevronRight
                                        size={20}
                                        className="text-gray-300 group-hover:text-teal-600 transition-colors"
                                    />
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            <SupportMessageModal open={supportOpen} onClose={() => setSupportOpen(false)} />

            {/* persist=false: acá el tour es una consulta, no el onboarding inicial. */}
            {tourOpen && <WelcomeTour persist={false} onClose={() => setTourOpen(false)} />}
        </div>
    );
}
