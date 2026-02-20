import React from 'react';
import Tooth from './Tooth';

const ADULT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const ADULT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const CHILD_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const CHILD_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

const TOOLS = [
    { id: 'caries', label: 'Caries', color: 'bg-red-500' },
    { id: 'tratado', label: 'Tratado', color: 'bg-blue-500' },
    { id: 'pendiente', label: 'Pendiente', color: 'bg-amber-500' },
    { id: 'ausente', label: 'Ausente', color: 'bg-gray-200' },
];

const Odontogram = ({ data = {}, onChange, readOnly = false }) => {
    const [selectedTool, setSelectedTool] = React.useState('caries');

    const handleZoneClick = (toothNumber, zone) => {
        if (readOnly) return;

        const currentTooth = data[toothNumber] || {};
        let newToothData;

        if (selectedTool === 'ausente') {
            // Toggle de ausencia: si ya estaba ausente, lo limpiamos
            newToothData = currentTooth.all === 'ausente' ? {} : { all: 'ausente' };
        } else {
            // Si el diente está marcado como ausente, cualquier click lo limpia primero para poder marcarlo
            if (currentTooth.all === 'ausente') {
                newToothData = { [zone === 'all' ? 'oclusal' : zone]: selectedTool };
            } else {
                // Toque Inteligente: Si la zona ya tiene la herramienta actual, se limpia.
                if (currentTooth[zone] === selectedTool) {
                    const { [zone]: _, ...rest } = currentTooth;
                    newToothData = rest;
                } else {
                    newToothData = { ...currentTooth, [zone]: selectedTool };
                }
            }
        }

        onChange({
            ...data,
            [toothNumber]: newToothData
        });
    };

    const ToothRow = ({ numbers }) => (
        <div className="flex flex-wrap justify-center gap-2 p-2">
            {numbers.map(n => (
                <Tooth
                    key={n}
                    number={n}
                    data={data[n] || {}}
                    onZoneClick={handleZoneClick}
                    disabled={readOnly}
                />
            ))}
        </div>
    );

    return (
        <div className="flex flex-col gap-8 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            {/* Barra de Herramientas */}
            {!readOnly && (
                <div className="flex flex-wrap items-center justify-center gap-3 p-4 bg-gray-50 rounded-xl mb-4">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-2">Herramientas:</span>
                    {TOOLS.map(tool => (
                        <button
                            key={tool.id}
                            onClick={() => setSelectedTool(tool.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedTool === tool.id
                                ? 'bg-white shadow-md ring-2 ring-teal-500 text-teal-700'
                                : 'text-gray-600 hover:bg-white/50'
                                }`}
                        >
                            <div className={`w-3 h-3 rounded-full ${tool.color}`} />
                            {tool.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Dientes Adultos */}
            <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest text-center">Dentadura Adulta</h3>
                <div className="space-y-2">
                    <ToothRow numbers={ADULT_UPPER} />
                    <div className="h-px bg-gray-100 my-2 mx-12" />
                    <ToothRow numbers={ADULT_LOWER} />
                </div>
            </div>

            {/* Dientes Niños */}
            <div className="space-y-4 pt-4 border-t border-gray-50">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest text-center">Dentadura Temporal</h3>
                <div className="space-y-2">
                    <ToothRow numbers={CHILD_UPPER} />
                    <div className="h-px bg-gray-100 my-2 mx-24" />
                    <ToothRow numbers={CHILD_LOWER} />
                </div>
            </div>

            <div className="mt-6 flex justify-center gap-8 text-[10px] text-gray-400 font-medium">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /> Caries</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500" /> Tratado</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" /> Pendiente</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-300" /> Ausente</div>
            </div>
        </div>
    );
};

export default Odontogram;
