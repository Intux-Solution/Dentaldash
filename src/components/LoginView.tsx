// src/components/LoginView.jsx - UPDATED 2026-02-16 - FINAL VERSION WITH LEGAL LINKS
import React, { useState } from "react";
import { Shield, AlertCircle, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import fondoLogin from "../imagenes/fondo-login-dentista.jpg";
import { supabase } from "../config/supabaseClient";

export default function LoginView({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  return (
    <>
      <div className="relative min-h-screen grid lg:grid-cols-2">
        {/* Panel ilustración */}
        <div
          className="hidden lg:flex relative flex-col justify-between p-10 text-white"
          style={{
            backgroundImage: `url(${fondoLogin})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-black/50" aria-hidden="true"></div>
          <div className="relative z-10" />
          <div className="relative z-10">
            <div className="text-3xl font-bold leading-tight">¡Bienvenida a tu consultorio digital! 🦷</div>
            <p className="mt-3 text-white/80">Accedé a tus pacientes y turnos desde un solo lugar.</p>
          </div>
          <div className="relative z-10 flex items-center gap-2 opacity-90">
            <Shield size={16} />
            <span className="text-sm">Datos protegidos con inicio seguro</span>
          </div>
        </div>

        {/* Panel de login */}
        <div className="relative z-10 flex items-center justify-center p-8 bg-gray-50">
          <div className="w-full max-w-md bg-white border rounded-2xl shadow-sm p-8 flex flex-col min-h-[500px]">
            <div className="flex-1">
              <h1 className="text-3xl font-semibold text-gray-900 text-center">Bienvenido</h1>
              <p className="text-gray-500 mt-2 text-center">Accedé a tu sistema odontológico.</p>

              <div className="mt-8 space-y-6">
                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
                    <AlertCircle size={16} />
                    {error}
                  </div>
                )}
                {success && (
                  <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm flex items-center gap-2">
                    <CheckCircle size={16} />
                    {success}
                  </div>
                )}

                <div className="space-y-4">
                  <p className="text-sm text-gray-600 text-center">
                    Para sincronizar tu calendario y gestionar tus turnos, inicia sesión con Google.
                  </p>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const { error } = await supabase.auth.signInWithOAuth({
                          provider: 'google',
                          options: {
                            redirectTo: `${window.location.origin}/`,
                            scopes: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file',
                            queryParams: {
                              access_type: 'offline',
                              prompt: 'consent',
                            },
                          },
                        });
                        if (error) throw error;
                      } catch (err) {
                        setError(err.message || 'Error al iniciar sesión con Google');
                        setLoading(false);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-3 py-4 px-4 bg-white border-2 border-gray-200 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 hover:border-teal-500 transition-all shadow-sm"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                    )}
                    Continuar con Google
                  </button>
                </div>

                <div className="pt-4">
                  <p className="text-xs text-center text-gray-400">
                    Al continuar, aceptas la sincronización automática de tu calendario de Google para la gestión de turnos.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100">
              <div className="flex flex-col items-center gap-2">
                <div className="flex gap-4 text-xs font-medium text-gray-400">
                  <Link to="/privacy" className="hover:text-teal-600 transition-colors">Política de Privacidad</Link>
                  <span>&bull;</span>
                  <Link to="/terms" className="hover:text-teal-600 transition-colors">Condiciones del Servicio</Link>
                </div>
                <div className="mt-2 text-center">
                  <p className="text-[10px] text-gray-400">Dental Dash &copy; 2026</p>
                  <p className="text-[10px] text-gray-400 mt-1">Powered by <a href="https://chilldigital.agency" target="_blank" rel="noreferrer" className="hover:text-teal-600">ChillDigital</a></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
