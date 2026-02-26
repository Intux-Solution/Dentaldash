// src/components/Sidebar.jsx - UPDATED 2026-02-16 - FINAL VERSION
import React from 'react';
import { NavLink } from 'react-router-dom';
import { X, Home, Calendar, Users, Settings, LogOut } from 'lucide-react';

export default function Sidebar({ sidebarOpen, setSidebarOpen, onLogout }) {
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
          {/* Header */}
          <div className="flex items-center justify-between px-4 border-b border-gray-200 min-h-[90px]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center text-white text-lg">
                🦷
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

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4">
            <ul className="space-y-2">
              <li>
                <NavLink
                  to="/"
                  onClick={closeSidebar}
                  className={({ isActive }) =>
                    `w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-left transition-all ${isActive
                      ? 'bg-teal-50 text-teal-600 font-semibold shadow-sm'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
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
                    `w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-left transition-all ${isActive
                      ? 'bg-teal-50 text-teal-600 font-semibold shadow-sm'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
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
                    `w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-left transition-all ${isActive
                      ? 'bg-teal-50 text-teal-600 font-semibold shadow-sm'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <Users size={20} />
                  <span>Pacientes</span>
                </NavLink>
              </li>

              <li>
                <NavLink
                  to="/configuracion"
                  onClick={closeSidebar}
                  className={({ isActive }) =>
                    `w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-left transition-all ${isActive
                      ? 'bg-teal-50 text-teal-600 font-semibold shadow-sm'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <Settings size={20} />
                  <span>Configuración</span>
                </NavLink>
              </li>

              <li className="pt-4 border-t border-gray-50">
                <button
                  onClick={onLogout}
                  className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-left text-red-500 hover:bg-red-50 transition-all font-medium"
                >
                  <LogOut size={20} />
                  <span>Cerrar Sesión</span>
                </button>
              </li>
            </ul>
          </nav>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100">
          <div className="text-center">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">Dental Dash v1.0.0</p>
          </div>
        </div>
      </div>
    </>
  );
}
