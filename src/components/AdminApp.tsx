import React from 'react';
import { ShieldCheck, LogOut } from 'lucide-react';
import AdminView from './AdminView';

interface AdminAppProps {
  onLogout: () => void;
}

export default function AdminApp({ onLogout }: AdminAppProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-gray-900 text-lg">DentalDash</span>
            <span className="ml-2 text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
              Admin
            </span>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </header>

      {/* Contenido */}
      <AdminView />
    </div>
  );
}
