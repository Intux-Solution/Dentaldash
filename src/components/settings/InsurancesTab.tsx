import { useState } from 'react';
import { CreditCard, X } from 'lucide-react';

export default function InsurancesTab({ profile, handleProfileChange, handleAutoSaveProfile }: { [key: string]: any }) {
    // Input controlado en vez de `document.getElementById`: el id es global y
    // colisiona si el tab llega a montarse dos veces (mismo criterio que ServicesTab).
    const [newInsurance, setNewInsurance] = useState('');

    const handleAdd = async () => {
        const value = newInsurance.trim();
        if (!value) return;
        const newInsurances = [...(profile.accepted_insurances || []), value];
        handleProfileChange('accepted_insurances', newInsurances);
        setNewInsurance('');
        await handleAutoSaveProfile({ accepted_insurances: newInsurances });
    };

    const handleRemove = async (index: number) => {
        const newInsurances = profile.accepted_insurances.filter((_: any, idx: number) => idx !== index);
        handleProfileChange('accepted_insurances', newInsurances);
        await handleAutoSaveProfile({ accepted_insurances: newInsurances });
    };

    return (
        <div className="p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCard size={20} className="text-teal-600" /> Obras Sociales
            </h2>
            <div className="flex flex-wrap gap-2 mb-6">
                {(profile.accepted_insurances || []).map((ins: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 bg-teal-50 text-teal-700 px-4 py-2 rounded-xl text-sm border border-teal-100 font-medium shadow-sm">
                        {ins}
                        <X
                            size={14}
                            className="cursor-pointer hover:text-teal-900"
                            onClick={() => handleRemove(i)}
                        />
                    </div>
                ))}
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={newInsurance}
                    onChange={(e) => setNewInsurance(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                    placeholder="Agregar nueva obra social..."
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                />
                <button
                    onClick={handleAdd}
                    disabled={!newInsurance.trim()}
                    className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Agregar
                </button>
            </div>
        </div>
    );
}
