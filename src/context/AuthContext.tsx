import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../config/supabaseClient';
import { GoogleCalendarService } from '../services/GoogleCalendarService';

interface Profile {
    id: string;
    full_name: string | null;
    role: 'dentist' | 'admin';
    business_name: string | null;
}

interface AuthContextType {
    session: Session | null;
    profile: Profile | null;
    isLoading: boolean;
    reloadProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ session: null, profile: null, isLoading: true, reloadProfile: async () => {} });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const handleSession = async (currentSession: Session | null) => {
        setSession(currentSession);

        if (currentSession?.user) {
            // Cargar perfil con rol
            const { data: profileData } = await supabase
                .from('profiles')
                .select('id, full_name, role, business_name')
                .eq('id', currentSession.user.id)
                .single();
            setProfile(profileData ?? null);

            if (currentSession.provider_refresh_token) {
                // Await para evitar una race condition: al volver del redirect de
                // linkIdentity, garantizamos que el token esté persistido antes de
                // renderizar la app (y que useSettings vea googleConnected=true).
                const { error } = await supabase
                    .from('profiles')
                    .update({ google_refresh_token: currentSession.provider_refresh_token })
                    .eq('id', currentSession.user.id);
                if (error) console.error('Error saving google refresh token:', error);

                // El token es nuevo: descartamos cualquier estado de conexión que
                // GoogleCalendarService haya cacheado antes de este redirect.
                GoogleCalendarService.clearTokenCache();
            }
        } else {
            setProfile(null);
            // Cierre de sesión: el access token cacheado es del usuario anterior.
            GoogleCalendarService.clearTokenCache();
        }

        setIsLoading(false);
    };

    useEffect(() => {
        // Obtenemos sesión inicial
        supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
            handleSession(currentSession);
        });

        // Nos suscribimos a cambios
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, currentSession) => {
                // Diferido: handleSession hace awaits reales a Supabase (SELECT/UPDATE
                // a profiles). Ejecutarlos directo acá corre mientras supabase-js retiene
                // el lock interno de auth, lo que puede deadlockear el cliente si alguna
                // de esas queries necesita el mismo lock (pitfall documentado de
                // supabase-js v2 con onAuthStateChange).
                setTimeout(() => {
                    handleSession(currentSession);
                }, 0);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const reloadProfile = async () => {
        if (!session?.user?.id) return;
        const { data: profileData } = await supabase
            .from('profiles')
            .select('id, full_name, role, business_name')
            .eq('id', session.user.id)
            .single();
        setProfile(profileData ?? null);
    };

    return (
        <AuthContext.Provider value={{ session, profile, isLoading, reloadProfile }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
