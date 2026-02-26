// src/components/Header.jsx - UPDATED 2026-02-16 - FINAL VERSION
import React, { useState, useEffect } from 'react';
import { Settings, LogOut, User, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabaseClient';

export default function Header({ title, setSidebarOpen, onLogout, session }) {
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userData, setUserData] = useState({
    name: 'Usuario',
    avatar: null,
    email: '',
    role: 'Odontólogo'
  });

  useEffect(() => {
    window.addEventListener('profile:updated', fetchUserData);
    fetchUserData();

    const profileSubscription = supabase
      .channel('header_profile_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${session.user.id}`
        },
        () => {
          console.log("Header: Profile changed, refreshing...");
          fetchUserData();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('profile:updated', fetchUserData);
      supabase.removeChannel(profileSubscription);
    };
  }, []);

  const fetchUserData = async () => {
    try {
      console.log("Header: fetching user data...");
      if (!session) {
        console.warn("Header: No session handed down from props");
        return;
      }

      const user = session.user;
      console.log("Header: Full User Metadata:", user.user_metadata);

      // Query the flat profiles table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, business_name')
        .eq('id', user.id)
        .maybeSingle(); // Use maybeSingle to handle cases where no profile exists

      if (profileError) {
        console.error('Header: Error fetching profile:', profileError);
        // Continue with default or metadata values if profile fetch fails
      }

      let name = user.user_metadata?.full_name || user.user_metadata?.name || user.email;
      let avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
      let businessName = 'Mi Consultorio'; // Default business name

      if (profileData) {
        console.log("Header: Found profile in DB:", profileData);
        if (profileData.full_name) name = profileData.full_name;
        if (profileData.business_name) businessName = profileData.business_name;

        if (profileData.avatar_url) {
          console.log("Header: Using profile avatar_url from storage:", profileData.avatar_url);
          const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(profileData.avatar_url);
          if (publicUrlData?.publicUrl) avatar = publicUrlData.publicUrl;
        }
      }

      console.log("Header: Final name:", name, "Final avatar:", avatar, "Final businessName:", businessName);

      setUserData({
        name: name || 'Usuario',
        avatar: avatar,
        email: user.email,
        role: 'Odontólogo'
      });
    } catch (err) {
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
          <div className="relative">
            <button
              id="user-menu-button"
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 rounded-xl p-1.5 transition-all hover:bg-gray-50 border border-transparent hover:border-gray-100"
            >
              <div className="relative">
                {userData.avatar ? (
                  <img
                    src={userData.avatar}
                    alt="Perfil"
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-teal-50"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center ring-2 ring-teal-50">
                    <User size={20} className="text-teal-600" />
                  </div>
                )}
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
                    {userData.avatar ? (
                      <img src={userData.avatar} alt="" className="w-12 h-12 rounded-full object-cover shadow-sm ring-2 ring-white" />
                    ) : (
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                        <User size={24} className="text-teal-600" />
                      </div>
                    )}
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
    </>
  );
}