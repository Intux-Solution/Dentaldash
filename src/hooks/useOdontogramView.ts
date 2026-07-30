import { useState, useEffect } from 'react';
import { message } from 'antd';
import { PatientService } from '../services/PatientService';
import { OdontogramService } from '../services/OdontogramService';
import { EvolutionService } from '../services/EvolutionService';

export function useOdontogramView(id: string | undefined) {
    const [patient, setPatient] = useState<any>(null);
    const [odontogramData, setOdontogramData] = useState<any>({});
    const [history, setHistory] = useState<any[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

            const [pData, oData, hData] = await Promise.all([
                PatientService.getPatientById(patientId),
                OdontogramService.getOdontogram(patientId),
                EvolutionService.getHistory(patientId)
            ]);

            if (!pData) {
                setError('Paciente no encontrado');
                return;
            }

            setPatient(pData);
            setOdontogramData(oData?.data || {});
            setHistory(hData || []);
        } catch (err) {
            console.error('Error loading data:', err);
            setError('Error al cargar la información.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveOdontogram = async () => {
        if (!id) return;
        try {
            setSaving(true);
            await OdontogramService.saveOdontogram(id, odontogramData);
            message.success('Odontograma guardado correctamente');
        } catch (err) {
            console.error('Error saving:', err);
            message.error('Error al guardar el odontograma');
        } finally {
            setSaving(false);
        }
    };

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
        saving,
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
