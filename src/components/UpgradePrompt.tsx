import React from 'react';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UpgradePromptProps {
  feature: string;
  description?: string;
}

export default function UpgradePrompt({ feature, description }: UpgradePromptProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] p-8 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Lock size={24} className="text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-800 mb-2">
        {feature} requiere un plan superior
      </h3>
      <p className="text-sm text-gray-500 max-w-xs mb-6">
        {description ?? `Esta funcionalidad no está disponible en tu plan actual. Actualiza para desbloquear ${feature}.`}
      </p>
      <button
        onClick={() => navigate('/pricing')}
        className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        Ver planes
      </button>
    </div>
  );
}
