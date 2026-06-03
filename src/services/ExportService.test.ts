import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportService } from './ExportService';

// Mock DOM APIs not available in jsdom
const createObjectURLMock = vi.fn(() => 'blob:mock-url');
const revokeObjectURLMock = vi.fn();

Object.defineProperty(globalThis, 'URL', {
    value: { createObjectURL: createObjectURLMock, revokeObjectURL: revokeObjectURLMock },
    writable: true,
});

let clickMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    clickMock = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
            return { href: '', download: '', click: clickMock } as any;
        }
        return document.createElement.call(document, tag) as any;
    });
    createObjectURLMock.mockClear();
    clickMock.mockClear();
});

describe('ExportService.exportPatientsCSV', () => {
    it('debe descargar un CSV con los headers correctos cuando la lista está vacía', () => {
        ExportService.exportPatientsCSV([]);
        expect(createObjectURLMock).toHaveBeenCalledOnce();
        expect(clickMock).toHaveBeenCalledOnce();
        const blob: Blob = createObjectURLMock.mock.calls[0][0];
        expect(blob.type).toBe('text/csv;charset=utf-8;');
    });

    it('debe incluir datos de pacientes en el CSV', async () => {
        const patients = [
            { nombre: 'Juan García', dni: '12345678', telefono: '381-111', email: 'juan@test.com', obraSocial: 'OSDE', estado: 'Activo' },
            { nombre: 'María López', dni: '87654321', telefono: '381-222', email: '', obraSocial: 'Particular', estado: 'Activo' },
        ];

        ExportService.exportPatientsCSV(patients);

        const blob: Blob = createObjectURLMock.mock.calls[0][0];
        const text = await blob.text();

        expect(text).toContain('Juan García');
        expect(text).toContain('12345678');
        expect(text).toContain('María López');
        expect(text).toContain('OSDE');
    });

    it('debe escapar comillas dobles dentro de los campos', async () => {
        const patients = [{ nombre: 'Apellido, "Nombre"', dni: '111' }];
        ExportService.exportPatientsCSV(patients);

        const blob: Blob = createObjectURLMock.mock.calls[0][0];
        const text = await blob.text();
        // Las comillas dobles deben estar duplicadas (escape CSV)
        expect(text).toContain('""Nombre""');
    });
});

describe('ExportService.exportAppointmentsCSV', () => {
    it('debe descargar un CSV de turnos', () => {
        const events = [
            {
                start: '2026-06-03T10:00:00',
                end: '2026-06-03T10:30:00',
                title: 'Limpieza - Juan',
                patientName: 'Juan García',
                status: 'confirmed',
                notes: 'Primera visita',
            },
        ];

        ExportService.exportAppointmentsCSV(events);

        expect(createObjectURLMock).toHaveBeenCalledOnce();
        expect(clickMock).toHaveBeenCalledOnce();
    });

    it('debe manejar eventos sin fecha válida sin lanzar error', () => {
        const events = [{ start: 'invalid-date', title: 'Turno sin fecha' }];
        expect(() => ExportService.exportAppointmentsCSV(events)).not.toThrow();
    });
});
