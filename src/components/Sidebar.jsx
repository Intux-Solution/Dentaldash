// src/components/Sidebar.jsx - CON CAMBIO DE CONTRASEÑA
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { X, Home, Calendar, Users, LogOut, Settings, Lock, User } from 'lucide-react';
import { getUser } from '../utils/auth';
import ChangePasswordModal from './ChangePasswordModal';

export default function Sidebar({ sidebarOpen, setSidebarOpen, onLogout }) {
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const user = getUser();

  const handleLogout = () => {
    if (onLogout) onLogout();
  };

  const handleChangePassword = () => {
    setShowUserMenu(false);
    setShowChangePassword(true);
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <>
      {/* Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" 
          onClick={closeSidebar}
        />
      )}
      
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:inset-0`}>
        <div className="flex-1 flex flex-col">
          {/* Header (match App header height ~72px) */}
          <div className="flex items-center justify-between px-4 border-b border-gray-200 min-h-[90px]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">🦷</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">Consultorio</span>
            </div>
            
            {/* Close button (mobile) */}
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
              onClick={closeSidebar}
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* User Info oculto por pedido: se elimina la sección "Administrador" */}

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4">
            <ul className="space-y-2">
              <li>
                <NavLink
                  to="/"
                  onClick={closeSidebar}
                  className={({ isActive }) =>
                    `w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-teal-50 text-teal-600 font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <Home size={20} />
                  <span>Dashboard</span>
                </NavLink>
              </li>
              
              <li>
                <NavLink
                  to="/turnos"
                  onClick={closeSidebar}
                  className={({ isActive }) =>
                    `w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-teal-50 text-teal-600 font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <Calendar size={20} />
                  <span>Turnos</span>
                </NavLink>
              </li>
              
              <li>
                <NavLink
                  to="/pacientes"
                  onClick={closeSidebar}
                  className={({ isActive }) =>
                    `w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-teal-50 text-teal-600 font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <Users size={20} />
                  <span>Pacientes</span>
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">Dental Dash</p>
            <p className="text-xs text-gray-400">v1.0.0</p>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      <ChangePasswordModal
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
        user={user}
      />

      {/* Click outside handler for user menu */}
      {showUserMenu && (
        <div 
          className="fixed inset-0 z-30" 
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </>
  );
}
