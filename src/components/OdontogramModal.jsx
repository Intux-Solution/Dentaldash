import React, { useState, useEffect } from 'react';
import { X, Save, Loader, AlertCircle } from 'lucide-react';
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
            setError('No se pudo guardar el odontograma.');
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative bg-[#F8FAFC] w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 bg-white border-b border-gray-100">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Odontograma</h2>
                        <p className="text-sm text-gray-500 font-medium">{patient?.nombre || 'Paciente'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 disabled:opacity-50 transition-all shadow-sm"
                        >
                            {saving ? <Loader size={20} className="animate-spin" /> : <Save size={20} />}
                            <span>Guardar Odontograma</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition-all"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    {error && (
                        <div className="mb-6 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
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
                </div>

                {/* Footer info */}
                <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 font-bold uppercase tracking-wider flex justify-between">
                    <span>Sistema FDI (Federación Dental Internacional)</span>
                    <span>Dental Dash v2.0</span>
                </div>
            </div>
        </div>
    );
};

export default OdontogramModal;
