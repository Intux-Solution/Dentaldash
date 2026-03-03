import { useState } from 'react';
import { OdontogramData, ToothData, SurfaceStatus } from '../schemas/odontogram.schema';

export function toggleToothZone(
    currentData: OdontogramData,
    toothNumber: string | number,
    zone: string,
    tool: SurfaceStatus
): OdontogramData {
    const strNumber = String(toothNumber);
    const currentTooth: ToothData = currentData[strNumber] || {};
    let newToothData: ToothData;

    if (tool === 'ausente') {
        // Toggle de ausencia: si ya estaba ausente, lo limpiamos
        newToothData = currentTooth.all === 'ausente' ? {} : { all: 'ausente' };
    } else {
        // Si el diente está marcado como ausente, cualquier click lo limpia primero para poder marcarlo
        if (currentTooth.all === 'ausente') {
            newToothData = { [zone === 'all' ? 'oclusal' : zone]: tool };
        } else {
            // Toque Inteligente: Si la zona ya tiene la herramienta actual, se limpia.
            if (currentTooth[zone as keyof ToothData] === tool) {
                const { [zone as keyof ToothData]: _, ...rest } = currentTooth;
                newToothData = rest as ToothData;
            } else {
                newToothData = { ...currentTooth, [zone]: tool } as ToothData;
            }
        }
    }

    return {
        ...currentData,
        [strNumber]: newToothData
    };
}

export function useOdontogram() {
    const [selectedTool, setSelectedTool] = useState<SurfaceStatus>('caries');

    return {
        selectedTool,
        setSelectedTool
    };
}
