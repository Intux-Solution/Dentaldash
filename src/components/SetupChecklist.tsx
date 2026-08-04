import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ArrowRight, HelpCircle } from 'lucide-react';
import { useSetupProgress } from '../hooks/useSetupProgress';

/**
 * Checklist de puesta en marcha en el Dashboard.
 *
 * Desaparece sola cuando está todo configurado (igual que `SubscriptionBanner`
 * retorna null cuando no hay nada que avisar): no necesita botón de descartar.
 */
export default function SetupChecklist() {
    const { items, completed, total, isComplete, isLoading } = useSetupProgress();

    if (isLoading || isComplete || total === 0) return null;

    const progress = (completed / total) * 100;

    return (
        <div className="bg-white rounded-lg shadow-sm border p-4 lg:p-6 mb-6 lg:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-gray-800">Terminá de configurar tu consultorio</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Estos datos son los que después vas a usar al cargar pacientes y turnos.
                    </p>
                </div>
                <span className="text-sm font-semibold text-teal-600 whitespace-nowrap">
                    {completed} de {total} listos
                </span>
            </div>

            <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden mb-5">
                <div
                    className="h-full rounded-full bg-teal-600 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                />
            </div>

            <ul className="space-y-1">
                {items.map((item) => (
                    <li key={item.key}>
                        {item.done ? (
                            <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
                                <CheckCircle2 size={18} className="text-teal-600 flex-shrink-0" />
                                <span className="text-sm text-gray-400 line-through">{item.label}</span>
                            </div>
                        ) : (
                            <Link
                                to={item.to}
                                className="group flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors"
                            >
                                <Circle size={18} className="text-gray-300 flex-shrink-0" />
                                <span className="text-sm text-gray-700 flex-1">{item.label}</span>
                                <ArrowRight
                                    size={16}
                                    className="text-gray-300 group-hover:text-teal-600 transition-colors flex-shrink-0"
                                />
                            </Link>
                        )}
                    </li>
                ))}
            </ul>

            <div className="mt-4 pt-4 border-t border-gray-50">
                <Link
                    to="/ayuda?guia=configuracion"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700 transition-colors"
                >
                    <HelpCircle size={16} />
                    Ver la guía paso a paso
                </Link>
            </div>
        </div>
    );
}
