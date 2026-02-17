import React, { useState, useEffect } from 'react';
import { X, Save, Loader, AlertCircle } from 'lucide-react';
import ModalShell from './ModalShell';
import Odontogram from './Odontogram';
import { OdontogramService } from '../services/OdontogramService';

const OdontogramModal = ({ isOpen, onClose, patient }) => {
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && patient?.id) {
            loadOdontogram();
        }
    }, [isOpen, patient]);

    const loadOdontogram = async () => {
        try {
            setLoading(true);
            setError(null);
            const record = await OdontogramService.getOdontogram(patient.id);
            if (record) {
                setData(record.data || {});
            } else {
                setData({});
            }
        } catch (err) {
            setError('No se pudo cargar el odontograma.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);
            await OdontogramService.saveOdontogram(patient.id, data);
            onClose();
        } catch (err) {
            const msg = err.message || 'Error desconocido';
            console.error('Error saving odontogram:', err);

            // Check for the specific unique constraint error to give a better hint
            if (msg.includes('unique or exclusion constraint')) {
                setError('Error en la base de datos: Falta la restricción de unicidad en patient_id.');
            } else {
                setError(`No se pudo guardar: ${msg}`);
            }
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <ModalShell
            title={`Odontograma - ${patient?.nombre || 'Paciente'}`}
            onClose={onClose}
            maxWidth="max-w-5xl"
            footer={
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 disabled:opacity-50 transition-all shadow-sm"
                    >
                        {saving ? <Loader size={20} className="animate-spin" /> : <Save size={20} />}
                        <span>{saving ? 'Guardando...' : 'Guardar Odontograma'}</span>
                    </button>
                </div>
            }
        >
            <div className="space-y-6">
                {error && (
                    <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
                        <AlertCircle size={20} />
                        <span className="text-sm font-medium">{error}</span>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader size={48} className="text-teal-500 animate-spin" />
                        <p className="text-gray-500 font-medium">Cargando datos dentales...</p>
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto">
                        <Odontogram data={data} onChange={setData} />
                    </div>
                )}

                <div className="bg-gray-50 p-4 rounded-xl text-[10px] text-gray-400 font-bold uppercase tracking-wider flex justify-between">
                    <span>Sistema FDI (Federación Dental Internacional)</span>
                    <span>Dental Dash v2.0</span>
                </div>
            </div>
        </ModalShell>
    );
};

export default OdontogramModal;
