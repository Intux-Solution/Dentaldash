import React, { useState } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAuth } from '../context/AuthContext';

export default function OnboardingWizard() {
  const { session, reloadProfile } = useAuth();
  const [businessName, setBusinessName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setError('El nombre del consultorio es requerido.');
      return;
    }
    if (!session?.user?.id) return;

    setSaving(true);
    setError('');
    try {
      const { error: dbError } = await supabase
        .from('profiles')
        .update({
          business_name: businessName.trim(),
          contact_phone: contactPhone.trim() || null,
          updated_at: new Date(),
        })
        .eq('id', session.user.id);

      if (dbError) throw dbError;
      await reloadProfile();
    } catch (err: any) {
      setError(err.message || 'Error al guardar. Intente nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
            🦷
          </div>
          <h1 className="text-2xl font-bold text-gray-900">¡Bienvenido a DentalDash!</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Configuremos tu consultorio antes de comenzar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del consultorio <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="Ej: Consultorio Dr. García"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono de contacto <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="tel"
              value={contactPhone}
              onChange={e => setContactPhone(e.target.value)}
              placeholder="Ej: 381-1234567"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full h-12 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {saving ? 'Guardando...' : 'Comenzar →'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          Podés modificar estos datos en Configuración → Perfil
        </p>
      </div>
    </div>
  );
}
