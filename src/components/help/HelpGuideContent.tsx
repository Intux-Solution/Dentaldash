import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Info } from 'lucide-react';
import type { HelpGuide } from '../../content/helpGuides';
import ImageLightbox from './ImageLightbox';

interface HelpGuideContentProps {
    guide: HelpGuide;
    /**
     * Feature keys que el usuario no tiene: sus pasos se muestran igual (la
     * ayuda es documentación, no una funcionalidad), pero sin el link de acción
     * que lo llevaría a una pantalla bloqueada.
     */
    canUse: (featureKey: string) => boolean;
}

export default function HelpGuideContent({ guide, canUse }: HelpGuideContentProps) {
    const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);
    const Icon = guide.icon;

    return (
        <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-start gap-4 px-6 py-5 border-b border-gray-100">
                    <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                        <Icon size={22} className="text-teal-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">{guide.title}</h2>
                        <p className="text-sm text-gray-500 mt-0.5">{guide.summary}</p>
                    </div>
                </div>

                <ol className="divide-y divide-gray-100">
                    {guide.steps.map((step, i) => {
                        const showLink = step.link && (!step.featureKey || canUse(step.featureKey));

                        return (
                            <li key={step.title} className="px-6 py-6">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="w-7 h-7 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                        {i + 1}
                                    </span>
                                    <h3 className="text-base font-semibold text-gray-900">{step.title}</h3>
                                </div>

                                <div className="sm:pl-10 space-y-3">
                                    {step.body.map((p, j) => (
                                        <p key={j} className="text-sm text-gray-600 leading-relaxed">
                                            {p}
                                        </p>
                                    ))}

                                    {step.note && (
                                        <div className="flex gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                                            <Info size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                                            <p className="text-xs text-amber-900 leading-relaxed">{step.note}</p>
                                        </div>
                                    )}

                                    {step.images && step.images.length > 0 && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                            {step.images.map((src) => (
                                                <button
                                                    key={src}
                                                    type="button"
                                                    onClick={() => setZoomed({ src, alt: step.title })}
                                                    className="block rounded-xl border border-gray-200 overflow-hidden hover:border-teal-500 hover:shadow-md transition-all"
                                                    aria-label={`Ampliar captura: ${step.title}`}
                                                >
                                                    <img
                                                        src={src}
                                                        alt={step.title}
                                                        loading="lazy"
                                                        className="w-full h-auto"
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {showLink && (
                                        <Link
                                            to={step.link!.to}
                                            className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700 transition-colors"
                                        >
                                            {step.link!.label}
                                            <ArrowRight size={16} />
                                        </Link>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </div>

            {zoomed && (
                <ImageLightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} />
            )}
        </>
    );
}
