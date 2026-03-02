import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../config/supabaseClient';

interface AuthContextType {
    session: Session | null;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({ session: null, isLoading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const handleSession = async (currentSession: Session | null) => {
        setSession(currentSession);
        setIsLoading(false);

        if (currentSession?.provider_refresh_token && currentSession.user) {
            try {
                // Background update, no need to await or block UI
                supabase
                    .from('profiles')
                    .update({ google_refresh_token: currentSession.provider_refresh_token })
                    .eq('id', currentSession.user.id)
                    .then(({ error }) => {
                        if (error) console.error('Error saving google refresh token:', error);
                    });
            } catch (e) {
                // Ignore silent errors
            }
        }
    };

    useEffect(() => {
        // Obtenemos sesión inicial
        supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
            handleSession(currentSession);
        });

        // Nos suscribimos a cambios
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, currentSession) => {
                handleSession(currentSession);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ session, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
