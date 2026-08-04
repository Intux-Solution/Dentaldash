import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../config/supabaseClient';
import { GoogleCalendarService } from '../services/GoogleCalendarService';

interface Profile {
    id: string;
    full_name: string | null;
    role: 'dentist' | 'admin';
    business_name: string | null;
    /** Momento en que cerró el tour de bienvenida. NULL = todavía no lo vio. */
    onboarding_completed_at: string | null;
}

// Un solo lugar para las columnas del perfil de sesión: `handleSession` y
// `reloadProfile` tienen que traer exactamente lo mismo o el perfil cambia de
// forma según por dónde se cargó.
const PROFILE_COLUMNS = 'id, full_name, role, business_name, onboarding_completed_at';

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

        // Todo el cuerpo va en try/finally: si cualquiera de estas queries rechaza
        // (típicamente un fallo de red al rehidratar la pestaña después de volver
        // de un redirect externo), `setIsLoading(false)` nunca corría y la app
        // quedaba colgada en el spinner para siempre, sin más salida que recargar.
        try {
            if (currentSession?.user) {
                // Cargar perfil con rol
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select(PROFILE_COLUMNS)
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
        } catch (err) {
            console.error('AuthContext handleSession error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // Obtenemos sesión inicial
        supabase.auth.getSession().then(
            ({ data: { session: currentSession } }) => {
                handleSession(currentSession);
            },
            (err) => {
                // Sin este rechazo manejado, un getSession() fallido dejaba
                // isLoading en true de forma permanente.
                console.error('AuthContext getSession error:', err);
                handleSession(null);
            }
        );

        // Nos suscribimos a cambios
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, currentSession) => {
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
            .select(PROFILE_COLUMNS)
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
