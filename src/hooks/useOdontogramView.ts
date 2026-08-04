import { useState, useEffect, useRef, useCallback } from 'react';
import { message } from 'antd';
import { PatientService } from '../services/PatientService';
import { OdontogramService } from '../services/OdontogramService';
import { EvolutionService } from '../services/EvolutionService';

// Marcar una cara dental es un click; agrupamos la ráfaga en un solo guardado.
const AUTOSAVE_DELAY_MS = 800;

export type OdontogramSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useOdontogramView(id: string | undefined) {
    const [patient, setPatient] = useState<any>(null);
    const [odontogramData, setOdontogramData] = useState<any>({});
    const [history, setHistory] = useState<any[]>([]);

    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<OdontogramSaveStatus>('idle');
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);

    // JSON del último estado persistido (o recién cargado). `null` = todavía no
    // hay carga completa, así que nada debe autoguardarse.
    const savedSnapshotRef = useRef<string | null>(null);
    // Espejo del estado actual para poder flushear al desmontar sin re-suscribir efectos.
    const latestRef = useRef<{ id: string | undefined; data: any }>({ id, data: odontogramData });
    latestRef.current = { id, data: odontogramData };

    // Formulario para nueva nota
    const [newNote, setNewNote] = useState({
        tooth_number: '',
        procedure_type: '',
        description: ''
    });
    const [addingNote, setAddingNote] = useState(false);

    // Estado para edición inline
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        tooth_number: '',
        procedure_type: '',
        description: ''
    });
    const [savingEdit, setSavingEdit] = useState(false);

    useEffect(() => {
        if (id) {
            loadInitialData(id);
        }
    }, [id]);

    const loadInitialData = async (patientId: string) => {
        try {
            setLoading(true);
            setError(null);
            // Bloquea el autoguardado mientras se recarga: el `{}` inicial no debe
            // pisar el odontograma real del paciente.
            savedSnapshotRef.current = null;
            setSaveStatus('idle');
            setLastSavedAt(null);

            const [pData, oData, hData] = await Promise.all([
                PatientService.getPatientById(patientId),
                OdontogramService.getOdontogram(patientId),
                EvolutionService.getHistory(patientId)
            ]);

            if (!pData) {
                setError('Paciente no encontrado');
                return;
            }

            const loadedOdontogram = oData?.data || {};
            savedSnapshotRef.current = JSON.stringify(loadedOdontogram);

            setPatient(pData);
            setOdontogramData(loadedOdontogram);
            setHistory(hData || []);
        } catch (err) {
            console.error('Error loading data:', err);
            setError('Error al cargar la información.');
        } finally {
            setLoading(false);
        }
    };

    const persist = useCallback(async (patientId: string, data: any) => {
        const snapshot = JSON.stringify(data);
        try {
            setSaveStatus('saving');
            await OdontogramService.saveOdontogram(patientId, data);
            savedSnapshotRef.current = snapshot;
            setSaveStatus('saved');
            setLastSavedAt(new Date());
        } catch (err) {
            console.error('Error saving odontogram:', err);
            setSaveStatus('error');
            message.error('Error al guardar el odontograma');
        }
    }, []);

    // Autoguardado: cada cambio del odontograma reprograma el timer; si el usuario
    // marca varias caras seguidas se persiste una sola vez al final de la ráfaga.
    useEffect(() => {
        if (!id || savedSnapshotRef.current === null) return;
        if (JSON.stringify(odontogramData) === savedSnapshotRef.current) return;

        const timer = setTimeout(() => persist(id, odontogramData), AUTOSAVE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [odontogramData, id, persist]);

    // Al desmontar (típicamente el botón "volver") puede quedar un cambio dentro
    // de la ventana del debounce: se persiste fire-and-forget para no perderlo.
    useEffect(() => {
        return () => {
            const { id: patientId, data } = latestRef.current;
            if (!patientId || savedSnapshotRef.current === null) return;
            if (JSON.stringify(data) === savedSnapshotRef.current) return;
            OdontogramService.saveOdontogram(patientId, data).catch((err) =>
                console.error('Error saving odontogram on unmount:', err)
            );
        };
    }, []);

    // Reintento manual desde el indicador de estado cuando el autoguardado falla.
    const handleSaveOdontogram = useCallback(() => {
        if (!id) return;
        persist(id, latestRef.current.data);
    }, [id, persist]);

    const handleAddHistory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newNote.procedure_type || !newNote.description || !id) return;

        try {
            setAddingNote(true);
            const entry = await EvolutionService.addEntry({
                patient_id: id,
                ...newNote,
                tooth_number: newNote.tooth_number ? parseInt(newNote.tooth_number) : null
            });
            setHistory([entry, ...history] as any);
            setNewNote({ tooth_number: '', procedure_type: '', description: '' });
            message.success('Registro añadido correctamente');
        } catch (err) {
            console.error('Error adding history:', err);
            message.error('Error al añadir registro');
        } finally {
            setAddingNote(false);
        }
    };

    const handleDeleteHistory = async (historyId: string) => {
        if (!window.confirm('¿Eliminar este registro del historial?')) return;
        try {
            await EvolutionService.deleteEntry(historyId);
            setHistory((prev: any[]) => prev.filter(h => h.id !== historyId) as any);
            message.success('Registro eliminado');
        } catch (errUnknown: unknown) {
            message.error('Error al eliminar');
        }
    };

    const handleStartEdit = (entry: any) => {
        setEditingId(entry.id);
        setEditForm({
            tooth_number: entry.tooth_number ? entry.tooth_number.toString() : '',
            procedure_type: entry.procedure_type || '',
            description: entry.description || ''
        });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditForm({ tooth_number: '', procedure_type: '', description: '' });
    };

    const handleSaveEdit = async (historyId: string) => {
        if (!editForm.procedure_type || !editForm.description) return;

        try {
            setSavingEdit(true);
            const updatedEntry = await EvolutionService.updateEntry(historyId, {
                tooth_number: editForm.tooth_number ? parseInt(editForm.tooth_number) : null,
                procedure_type: editForm.procedure_type,
                description: editForm.description
            });

            // Actualizar la lista localmente
            setHistory((prev: any[]) => prev.map(item => item.id === historyId ? updatedEntry : item) as any);
            setEditingId(null);
            message.success('Cambios guardados con éxito');
        } catch (err) {
            console.error('Error updating history:', err);
            message.error('Error al guardar los cambios');
        } finally {
            setSavingEdit(false);
        }
    };

    return {
        patient,
        odontogramData,
        setOdontogramData,
        history,
        loading,
        saveStatus,
        lastSavedAt,
        error,
        newNote,
        setNewNote,
        addingNote,
        editingId,
        editForm,
        setEditForm,
        savingEdit,
        handleSaveOdontogram,
        handleAddHistory,
        handleDeleteHistory,
        handleStartEdit,
        handleCancelEdit,
        handleSaveEdit
    };
}
