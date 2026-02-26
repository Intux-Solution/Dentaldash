import { useState } from 'react';
import { OdontogramData, ToothData, SurfaceStatus } from '../schemas/odontogram.schema';

export function useOdontogram(initialData: OdontogramData = {}, readOnly: boolean = false) {
    const [data, setData] = useState<OdontogramData>(initialData);
    const [selectedTool, setSelectedTool] = useState<SurfaceStatus>('caries');

    const handleZoneClick = (toothNumber: string | number, zone: string) => {
        if (readOnly) return;

        const strNumber = String(toothNumber);
        const currentTooth: ToothData = data[strNumber] || {};
        let newToothData: ToothData;

        if (selectedTool === 'ausente') {
            // Toggle de ausencia: si ya estaba ausente, lo limpiamos
            newToothData = currentTooth.all === 'ausente' ? {} : { all: 'ausente' };
        } else {
            // Si el diente está marcado como ausente, cualquier click lo limpia primero para poder marcarlo
            if (currentTooth.all === 'ausente') {
                newToothData = { [zone === 'all' ? 'oclusal' : zone]: selectedTool };
            } else {
                // Toque Inteligente: Si la zona ya tiene la herramienta actual, se limpia.
                if (currentTooth[zone as keyof ToothData] === selectedTool) {
                    const { [zone as keyof ToothData]: _, ...rest } = currentTooth;
                    newToothData = rest as ToothData;
                } else {
                    newToothData = { ...currentTooth, [zone]: selectedTool } as ToothData;
                }
            }
        }

        setData(prev => ({
            ...prev,
            [strNumber]: newToothData
        }));
    };

    return {
        data,
        setData,
        selectedTool,
        setSelectedTool,
        handleZoneClick
    };
}
