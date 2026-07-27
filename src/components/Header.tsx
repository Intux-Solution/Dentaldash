// src/components/Header.tsx - UPDATED 2026-02-16 - FINAL VERSION
import React, { useState, useEffect } from 'react';
import { Settings, LogOut, ChevronDown, LifeBuoy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { resolveAvatarUrl } from '../utils/avatar';
import Avatar from './Avatar';
import SupportMessageModal from './SupportMessageModal';

interface HeaderProps {
  title: string;
  setSidebarOpen: (open: boolean) => void;
  onLogout: () => void;
}

export default function Header({ title, setSidebarOpen, onLogout }: HeaderProps) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [userData, setUserData] = useState<{ name: string; avatar: string | null; email: string; role: string }>({
    name: 'Usuario',
    avatar: null,
    email: '',
    role: 'Odontólogo'
  });

  if (!session?.user) return null;

  useEffect(() => {
    if (!session?.user) return;

    window.addEventListener('profile:updated', fetchUserData);
    fetchUserData();

    const userId = session.user.id;
    const profileSubscription = supabase
      .channel(`header_profile_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`
        },
        () => {
          fetchUserData();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('profile:updated', fetchUserData);
      // Small delay prevents "WebSocket is closed before the connection is established"
      // if React unmounts immediately during StrictMode or rapid auth changes.
      setTimeout(() => {
        supabase.removeChannel(profileSubscription);
      }, 500);
    };
  }, [session?.user?.id]);

  const fetchUserData = async () => {
    try {
      if (!session) {
        return;
      }

      const user = session.user;

      // Query the flat profiles table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle(); // Use maybeSingle to handle cases where no profile exists

      if (profileError) {
        console.error('Header: Error fetching profile:', profileError);
        // Continue with default or metadata values if profile fetch fails
      }

      let name = user.user_metadata?.full_name || user.user_metadata?.name || user.email;
      let avatar = resolveAvatarUrl(user.user_metadata?.avatar_url || user.user_metadata?.picture);

      if (profileData) {
        if (profileData.full_name) name = profileData.full_name;

        const profileAvatar = resolveAvatarUrl(profileData.avatar_url);
        if (profileAvatar) avatar = profileAvatar;
      }

      setUserData({
        name: name || 'Usuario',
        avatar: avatar ?? null,
        email: user.email ?? '',
        role: 'Odontólogo'
      });
    } catch (errUnknown: unknown) {
            const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");
      console.error('Error fetching header user data:', err);
    }
  };

  const handleLogout = () => {
    setShowUserMenu(false);
    if (onLogout) onLogout();
  };

  return (
    <>
      <div className="bg-white border-b px-4 lg:px-8 flex justify-between items-center min-h-[90px] relative z-20">
        <div className="flex items-center space-x-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-gray-600 hover:text-gray-900">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <h1 className="text-xl lg:text-2xl font-semibold text-gray-800">{title}</h1>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => setSupportOpen(true)}
            title="Contactar al administrador"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-teal-50 hover:text-teal-700 border border-transparent hover:border-teal-100"
          >
            <LifeBuoy size={18} />
            <span className="hidden sm:block">Soporte</span>
          </button>

          <div className="relative">
            <button
              id="user-menu-button"
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 rounded-xl p-1.5 transition-all hover:bg-gray-50 border border-transparent hover:border-gray-100"
            >
              <div className="relative">
                <Avatar
                  src={userData.avatar}
                  name={userData.name}
                  size={40}
                  className="ring-2 ring-teal-50"
                />
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
              </div>

              <div className="hidden sm:block text-left px-1">
                <p className="text-sm font-bold text-gray-900 leading-tight truncate max-w-[120px]">
                  {userData.name}
                </p>
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  {userData.role}
                </p>
              </div>
              <ChevronDown size={14} className={`text-gray-400 mx-1 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-3 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="px-5 py-4 border-b border-gray-50 bg-gray-50/50 rounded-t-2xl -mt-2 mb-2">
                  <div className="flex items-center gap-4">
                    <Avatar
                      src={userData.avatar}
                      name={userData.name}
                      size={48}
                      className="shadow-sm ring-2 ring-white"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {userData.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {userData.email}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-2 py-1">
                  <button
                    onClick={() => {
                      navigate('/configuracion');
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-teal-50 hover:text-teal-700 rounded-xl transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-teal-100 transition-colors">
                      <Settings size={18} />
                    </div>
                    <span>Mi Configuración</span>
                  </button>

                  <div className="h-px bg-gray-50 my-2 mx-4" />

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                      <LogOut size={18} />
                    </div>
                    <span>Cerrar Sesión</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showUserMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowUserMenu(false)}
        />
      )}

      <SupportMessageModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}