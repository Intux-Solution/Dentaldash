import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Save,
    Loader,
    AlertCircle,
    History as HistoryIcon,
    Plus,
    ChevronRight,
    Trash2,
    Calendar,
    Hash,
    Edit2,
    X
} from 'lucide-react';
import { message } from 'antd';
import { PatientService } from '../services/PatientService';
import { OdontogramService } from '../services/OdontogramService';
import { EvolutionService } from '../services/EvolutionService';
import Odontogram from './Odontogram';

export default function OdontogramView() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [patient, setPatient] = useState(null);
    const [odontogramData, setOdontogramData] = useState({});
    const [history, setHistory] = useState([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // Formulario para nueva nota
    const [newNote, setNewNote] = useState({
        tooth_number: '',
        procedure_type: '',
        description: ''
    });
    const [addingNote, setAddingNote] = useState(false);

    // Estado para edición inline
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({
        tooth_number: '',
        procedure_type: '',
        description: ''
    });
    const [savingEdit, setSavingEdit] = useState(false);

    useEffect(() => {
        if (id) {
            loadInitialData();
        }
    }, [id]);

    const loadInitialData = async () => {
        try {
            setLoading(true);
            setError(null);

            const [pData, oData, hData] = await Promise.all([
                PatientService.getPatientById(id),
                OdontogramService.getOdontogram(id),
                EvolutionService.getHistory(id)
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
        try {
            setSaving(true);
            await OdontogramService.saveOdontogram(id, odontogramData);
            window.dispatchEvent(new CustomEvent('patients:refresh'));
            message.success('Odontograma guardado correctamente');
        } catch (err) {
            console.error('Error saving:', err);
            message.error('Error al guardar el odontograma');
        } finally {
            setSaving(false);
        }
    };

    const handleAddHistory = async (e) => {
        e.preventDefault();
        if (!newNote.procedure_type || !newNote.description) return;

        try {
            setAddingNote(true);
            const entry = await EvolutionService.addEntry({
                patient_id: id,
                ...newNote,
                tooth_number: newNote.tooth_number ? parseInt(newNote.tooth_number) : null
            });
            window.dispatchEvent(new CustomEvent('patients:refresh'));
            setHistory([entry, ...history]);
            setNewNote({ tooth_number: '', procedure_type: '', description: '' });
            message.success('Registro añadido correctamente');
        } catch (err) {
            console.error('Error adding history:', err);
            message.error('Error al añadir registro');
        } finally {
            setAddingNote(false);
        }
    };

    const handleDeleteHistory = async (historyId) => {
        if (!window.confirm('¿Eliminar este registro del historial?')) return;
        try {
            await EvolutionService.deleteEntry(historyId);
            window.dispatchEvent(new CustomEvent('patients:refresh'));
            setHistory(history.filter(h => h.id !== historyId));
            message.success('Registro eliminado');
        } catch (err) {
            message.error('Error al eliminar');
        }
    };

    const handleStartEdit = (entry) => {
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

    const handleSaveEdit = async (historyId) => {
        if (!editForm.procedure_type || !editForm.description) return;

        try {
            setSavingEdit(true);
            const updatedEntry = await EvolutionService.updateEntry(historyId, {
                tooth_number: editForm.tooth_number ? parseInt(editForm.tooth_number) : null,
                procedure_type: editForm.procedure_type,
                description: editForm.description
            });

            // Actualizar la lista localmente
            setHistory(history.map(item => item.id === historyId ? updatedEntry : item));
            setEditingId(null);
            window.dispatchEvent(new CustomEvent('patients:refresh'));
            message.success('Cambios guardados con éxito');
        } catch (err) {
            console.error('Error updating history:', err);
            message.error('Error al guardar los cambios');
        } finally {
            setSavingEdit(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-4">
                <Loader size={48} className="text-teal-600 animate-spin" />
                <p className="text-gray-500 font-medium">Cargando clínica dental...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center max-w-md mx-auto">
                <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold mb-2">Ups!</h2>
                <p className="text-gray-600 mb-6">{error}</p>
                <button
                    onClick={() => navigate('/pacientes')}
                    className="bg-teal-600 text-white px-6 py-2 rounded-xl"
                >
                    Volver a pacientes
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <header className="bg-white border-b sticky top-0 z-30">
                <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft size={20} className="text-gray-600" />
                        </button>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900 hidden sm:block">
                                Odontograma & Evolución
                            </h1>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-teal-600 font-semibold">{patient.nombre}</span>
                                <span className="text-gray-300">|</span>
                                <span className="text-gray-500">{patient.dni || 'Sin DNI'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSaveOdontogram}
                            disabled={saving}
                            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-sm transition-all disabled:opacity-50"
                        >
                            {saving ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
                            <span className="hidden sm:inline">Guardar Cambios</span>
                            <span className="sm:hidden">Guardar</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Layout Principal */}
            <main className="flex-1 max-w-[1600px] mx-auto w-full p-4 lg:p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">

                {/* Columna Izquierda: Odontograma */}
                <div className="xl:col-span-8 flex flex-col gap-6">
                    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                        <div className="p-4 border-b bg-gray-50/50 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Estado Dental Actual</h3>
                            <span className="text-xs text-gray-400">Sistema FDI</span>
                        </div>
                        <div className="p-4 lg:p-8 overflow-x-auto">
                            <Odontogram data={odontogramData} onChange={setOdontogramData} />
                        </div>
                    </div>
                </div>

                {/* Columna Derecha: Evolución */}
                <div className="xl:col-span-4 flex flex-col gap-6">
                    <div className="bg-white rounded-2xl border shadow-sm flex flex-col h-full max-h-[calc(100vh-140px)]">
                        <div className="p-4 border-b bg-gray-50/50 flex items-center gap-2">
                            <HistoryIcon size={18} className="text-teal-600" />
                            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Evolución Clínica</h3>
                        </div>

                        {/* Formulario Nueva Nota */}
                        <div className="p-4 border-b bg-teal-50/30">
                            <form onSubmit={handleAddHistory} className="space-y-3">
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="col-span-1">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Pieza</label>
                                        <input
                                            type="number"
                                            placeholder="--"
                                            className="w-full mt-1 px-3 py-2 rounded-lg border focus:ring-2 focus:ring-teal-500 outline-none text-sm"
                                            value={newNote.tooth_number}
                                            onChange={e => setNewNote({ ...newNote, tooth_number: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Procedimiento</label>
                                        <input
                                            type="text"
                                            placeholder="Ej: Resina, Limpieza..."
                                            required
                                            className="w-full mt-1 px-3 py-2 rounded-lg border focus:ring-2 focus:ring-teal-500 outline-none text-sm"
                                            value={newNote.procedure_type}
                                            onChange={e => setNewNote({ ...newNote, procedure_type: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Detalle / Notas</label>
                                    <textarea
                                        placeholder="Escribe aquí lo realizado..."
                                        required
                                        rows={2}
                                        className="w-full mt-1 px-3 py-2 rounded-lg border focus:ring-2 focus:ring-teal-500 outline-none text-sm resize-none"
                                        value={newNote.description}
                                        onChange={e => setNewNote({ ...newNote, description: e.target.value })}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={addingNote || !newNote.procedure_type}
                                    className="w-full flex items-center justify-center gap-2 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 transition-colors disabled:opacity-50"
                                >
                                    {addingNote ? <Loader size={16} className="animate-spin" /> : <Plus size={16} />}
                                    Añadir a Evolución
                                </button>
                            </form>
                        </div>

                        {/* Lista de Historial */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {history.length === 0 ? (
                                <div className="text-center py-10">
                                    <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <HistoryIcon size={24} className="text-gray-300" />
                                    </div>
                                    <p className="text-sm text-gray-400">Sin registros de evolución aún.</p>
                                </div>
                            ) : (
                                history.map((entry, idx) => (
                                    <div key={entry.id} className="relative pl-6 pb-2 border-l-2 border-teal-100 last:border-l-0 last:pb-0">
                                        {/* Punto del timeline */}
                                        <div className="absolute left-[-9px] top-1 w-4 h-4 rounded-full bg-teal-500 border-4 border-white shadow-sm" />

                                        <div className="bg-gray-50/50 rounded-xl p-3 border border-transparent hover:border-gray-100 hover:bg-white transition-all group">
                                            {editingId === entry.id ? (
                                                <div className="space-y-3 mt-2">
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div className="col-span-1">
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Pieza</label>
                                                            <input
                                                                type="number"
                                                                placeholder="--"
                                                                className="w-full mt-1 px-2 py-1.5 rounded-lg border focus:ring-2 focus:ring-teal-500 outline-none text-xs"
                                                                value={editForm.tooth_number}
                                                                onChange={e => setEditForm(prev => ({ ...prev, tooth_number: e.target.value }))}
                                                            />
                                                        </div>
                                                        <div className="col-span-2">
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Procedimiento</label>
                                                            <input
                                                                type="text"
                                                                required
                                                                className="w-full mt-1 px-2 py-1.5 rounded-lg border focus:ring-2 focus:ring-teal-500 outline-none text-xs font-semibold text-gray-900"
                                                                value={editForm.procedure_type}
                                                                onChange={e => setEditForm(prev => ({ ...prev, procedure_type: e.target.value }))}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Detalle / Notas</label>
                                                        <textarea
                                                            required
                                                            rows={2}
                                                            className="w-full mt-1 px-2 py-1.5 rounded-lg border focus:ring-2 focus:ring-teal-500 outline-none text-xs resize-none"
                                                            value={editForm.description}
                                                            onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                                                        />
                                                    </div>
                                                    <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
                                                        <button
                                                            onClick={handleCancelEdit}
                                                            disabled={savingEdit}
                                                            className="px-3 py-1.5 flex items-center gap-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                                                        >
                                                            <X size={12} />
                                                            Cancelar
                                                        </button>
                                                        <button
                                                            onClick={() => handleSaveEdit(entry.id)}
                                                            disabled={savingEdit || !editForm.procedure_type}
                                                            className="px-3 py-1.5 flex items-center gap-1 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors disabled:opacity-50"
                                                        >
                                                            {savingEdit ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                                                            Guardar
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <Calendar size={12} className="text-teal-600" />
                                                            <span className="text-[11px] font-bold text-gray-400 uppercase">
                                                                {new Date(entry.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                            <button
                                                                onClick={() => handleStartEdit(entry)}
                                                                className="p-1 text-gray-300 hover:text-teal-600 transition-all rounded hover:bg-teal-50"
                                                                title="Editar registro"
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteHistory(entry.id)}
                                                                className="p-1 text-gray-300 hover:text-red-500 transition-all rounded hover:bg-red-50"
                                                                title="Eliminar registro"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 mb-1">
                                                        {entry.tooth_number && (
                                                            <span className="flex items-center gap-1 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-black">
                                                                <Hash size={10} /> {entry.tooth_number}
                                                            </span>
                                                        )}
                                                        <h4 className="text-sm font-bold text-gray-900">{entry.procedure_type}</h4>
                                                    </div>
                                                    <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{entry.description}</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
