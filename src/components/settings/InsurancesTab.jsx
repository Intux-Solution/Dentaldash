import React from 'react';
import { CreditCard, X } from 'lucide-react';

export default function InsurancesTab({ profile, handleProfileChange, handleAutoSaveProfile }) {
    const handleAdd = async () => {
        const el = document.getElementById('ins-input');
        if (el.value.trim()) {
            const newInsurances = [...(profile.accepted_insurances || []), el.value.trim()];
            handleProfileChange('accepted_insurances', newInsurances);
            el.value = '';
            await handleAutoSaveProfile({ accepted_insurances: newInsurances });
        }
    };

    const handleRemove = async (index) => {
        const newInsurances = profile.accepted_insurances.filter((_, idx) => idx !== index);
        handleProfileChange('accepted_insurances', newInsurances);
        await handleAutoSaveProfile({ accepted_insurances: newInsurances });
    };

    return (
        <div className="p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCard size={20} className="text-teal-600" /> Obras Sociales
            </h2>
            <div className="flex flex-wrap gap-2 mb-6">
                {(profile.accepted_insurances || []).map((ins, i) => (
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
                    id="ins-input"
                    placeholder="Agregar nueva obra social..."
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                />
                <button
                    onClick={handleAdd}
                    className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all"
                >
                    Agregar
                </button>
            </div>
        </div>
    );
}
