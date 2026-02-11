// src/components/ChangePasswordModal.jsx
import React, { useState } from 'react';
import { X, Eye, EyeOff, Lock, Check, AlertCircle } from 'lucide-react';
import { secureApiCall } from '../utils/auth';

export default function ChangePasswordModal({ open, onClose, user }) {
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const n8nBaseUrl = process.env.REACT_APP_N8N_BASE || 'https://n8n-automation.chilldigital.tech';

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setPasswords(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
    if (success) setSuccess('');
  };

  const toggleShowPassword = (field) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const validatePassword = (password) => {
    const requirements = {
      length: password.length >= 8,
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    const score = Object.values(requirements).filter(Boolean).length;
    return { requirements, score, isValid: score >= 3 && requirements.length };
  };

  const passwordValidation = validatePassword(passwords.newPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validaciones básicas
    if (!passwords.currentPassword || !passwords.newPassword || !passwords.confirmPassword) {
      setError('Por favor completa todos los campos');
      return;
    }

    if (passwords.newPassword !== passwords.confirmPassword) {
      setError('Las contraseñas nuevas no coinciden');
      return;
    }

    if (!passwordValidation.isValid) {
      setError('La nueva contraseña debe tener al menos 8 caracteres y cumplir 3 de los requisitos de seguridad');
      return;
    }

    if (passwords.currentPassword === passwords.newPassword) {
      setError('La nueva contraseña debe ser diferente a la actual');
      return;
    }

    const userEmail = (user?.email || '').trim();

    if (!userEmail) {
      setError('No se encontro el email del usuario. Por favor vuelve a iniciar sesion.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await secureApiCall(`${n8nBaseUrl}/webhook/change-password`, {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail,
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
          timestamp: new Date().toISOString()
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('¡Contraseña actualizada exitosamente!');
        
        // Limpiar formulario después de 2 segundos y cerrar
        setTimeout(() => {
          setPasswords({
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
          });
          setSuccess('');
          onClose();
        }, 2000);
      } else {
        setError(data.message || 'Error al actualizar la contraseña');
      }
    } catch (err) {
      setError('Error de conexión. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    
    setPasswords({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    setError('');
    setSuccess('');
    setShowPasswords({ current: false, new: false, confirm: false });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Lock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Cambiar Contraseña</h2>
              <p className="text-sm text-gray-500">Actualiza tu contraseña de acceso</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Mensajes */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          
          {success && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <Check size={16} />
              <span>{success}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Contraseña actual */}
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña Actual
              </label>
              <div className="relative">
                <input
                  type={showPasswords.current ? "text" : "password"}
                  id="currentPassword"
                  name="currentPassword"
                  value={passwords.currentPassword}
                  onChange={handleInputChange}
                  placeholder="Ingresa tu contraseña actual"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors pr-12"
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => toggleShowPassword('current')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  disabled={loading}
                >
                  {showPasswords.current ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Contraseña nueva */}
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Nueva Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPasswords.new ? "text" : "password"}
                  id="newPassword"
                  name="newPassword"
                  value={passwords.newPassword}
                  onChange={handleInputChange}
                  placeholder="Ingresa tu nueva contraseña"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors pr-12"
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => toggleShowPassword('new')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  disabled={loading}
                >
                  {showPasswords.new ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>

              {/* Indicador de seguridad */}
              {passwords.newPassword && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-600">Seguridad de contraseña:</span>
                    <span className={`text-xs font-medium ${
                      passwordValidation.score >= 4 ? 'text-green-600' :
                      passwordValidation.score >= 3 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {passwordValidation.score >= 4 ? 'Excelente' :
                       passwordValidation.score >= 3 ? 'Buena' : 'Débil'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className={`flex items-center gap-1 ${passwordValidation.requirements.length ? 'text-green-600' : 'text-gray-400'}`}>
                      {passwordValidation.requirements.length ? '✓' : '○'} 8+ caracteres
                    </div>
                    <div className={`flex items-center gap-1 ${passwordValidation.requirements.hasUpper ? 'text-green-600' : 'text-gray-400'}`}>
                      {passwordValidation.requirements.hasUpper ? '✓' : '○'} Mayúsculas
                    </div>
                    <div className={`flex items-center gap-1 ${passwordValidation.requirements.hasLower ? 'text-green-600' : 'text-gray-400'}`}>
                      {passwordValidation.requirements.hasLower ? '✓' : '○'} Minúsculas
                    </div>
                    <div className={`flex items-center gap-1 ${passwordValidation.requirements.hasNumber ? 'text-green-600' : 'text-gray-400'}`}>
                      {passwordValidation.requirements.hasNumber ? '✓' : '○'} Números
                    </div>
                    <div className={`flex items-center gap-1 col-span-2 ${passwordValidation.requirements.hasSpecial ? 'text-green-600' : 'text-gray-400'}`}>
                      {passwordValidation.requirements.hasSpecial ? '✓' : '○'} Símbolos (!@#$%^&*)
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Confirmar contraseña */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirmar Nueva Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPasswords.confirm ? "text" : "password"}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={passwords.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="Confirma tu nueva contraseña"
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors pr-12 ${
                    passwords.confirmPassword && passwords.newPassword !== passwords.confirmPassword 
                      ? 'border-red-300' : 'border-gray-300'
                  }`}
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => toggleShowPassword('confirm')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  disabled={loading}
                >
                  {showPasswords.confirm ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {passwords.confirmPassword && passwords.newPassword !== passwords.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">Las contraseñas no coinciden</p>
              )}
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !passwordValidation.isValid || passwords.newPassword !== passwords.confirmPassword}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Actualizando...
                </>
              ) : (
                <>
                  <Lock size={16} />
                  Actualizar Contraseña
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
