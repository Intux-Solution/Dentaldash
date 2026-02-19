import React from 'react';

/**
 * SVG de un diente con 5 zonas clicables (Vestibular, Lingual, Mesial, Distal, Oclusal)
 * Basado en una representación anatómica simplificada.
 */
const Tooth = ({ number, data = {}, onZoneClick, disabled = false }) => {
    // data: { 'vestibular': 'caries', 'mesial': 'pendiente', ... }

    const getZoneColor = (zone) => {
        const status = data[zone];
        if (status === 'caries') return '#EF4444'; // Red-500
        if (status === 'tratado') return '#3B82F6'; // Blue-500
        if (status === 'pendiente') return '#F59E0B'; // Amber-500
        return 'white';
    };

    const isMissing = data.all === 'ausente';

    return (
        <div className={`flex flex-col items-center select-none ${disabled ? 'opacity-50 grayscale' : ''}`}>
            <span className="text-[10px] font-bold text-gray-400 mb-1">{number}</span>

            <div className="relative w-12 h-12">
                {isMissing ? (
                    <div
                        className="absolute inset-0 flex items-center justify-center cursor-pointer z-10"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!disabled) onZoneClick(number, 'all');
                        }}
                    >
                        <div className="w-full h-0.5 bg-gray-400 rotate-45 absolute pointer-events-none" />
                        <div className="w-full h-0.5 bg-gray-400 -rotate-45 absolute pointer-events-none" />
                    </div>
                ) : (
                    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
                        {/* Vestibular (Arriba) */}
                        <path
                            d="M 10,10 L 90,10 L 75,25 L 25,25 Z"
                            fill={getZoneColor('vestibular')}
                            stroke="#334155"
                            strokeWidth="2"
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => !disabled && onZoneClick(number, 'vestibular')}
                        />
                        {/* Distal (Lado dependiendo de la numeración, simplificamos a Izquierda) */}
                        <path
                            d="M 10,10 L 25,25 L 25,75 L 10,90 Z"
                            fill={getZoneColor('distal')}
                            stroke="#334155"
                            strokeWidth="2"
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => !disabled && onZoneClick(number, 'distal')}
                        />
                        {/* Lingual / Palatino (Abajo) */}
                        <path
                            d="M 10,90 L 90,90 L 75,75 L 25,75 Z"
                            fill={getZoneColor('lingual')}
                            stroke="#334155"
                            strokeWidth="2"
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => !disabled && onZoneClick(number, 'lingual')}
                        />
                        {/* Mesial (Derecha) */}
                        <path
                            d="M 90,10 L 75,25 L 75,75 L 90,90 Z"
                            fill={getZoneColor('mesial')}
                            stroke="#334155"
                            strokeWidth="2"
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => !disabled && onZoneClick(number, 'mesial')}
                        />
                        {/* Oclusal (Centro) */}
                        <rect
                            x="25"
                            y="25"
                            width="50"
                            height="50"
                            fill={getZoneColor('oclusal')}
                            stroke="#334155"
                            strokeWidth="2"
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => !disabled && onZoneClick(number, 'oclusal')}
                        />
                    </svg>
                )}
            </div>
        </div>
    );
};

export default Tooth;
