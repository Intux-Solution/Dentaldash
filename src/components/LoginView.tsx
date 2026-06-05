import React, { useState } from "react";
import { Shield, AlertCircle, Calendar, Users, Stethoscope, Eye, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";
import fondoLogin from "../imagenes/fondo-login-dentista.jpg";
import { supabase } from "../config/supabaseClient";

interface LoginViewProps {
  onSuccess?: () => void;
}

const FEATURES = [
  { icon: Calendar,     text: "Agenda inteligente sincronizada con Google Calendar" },
  { icon: Users,        text: "Gestión completa de pacientes en un solo lugar" },
  { icon: Stethoscope,  text: "Historial clínico, odontograma y consentimientos digitales" },
];

type Mode = "login" | "register";

export default function LoginView({ onSuccess }: LoginViewProps) {
  const [mode, setMode]           = useState<Mode>("login");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");
  const [showPass, setShowPass]   = useState(false);

  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [fullName, setFullName]   = useState("");

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setSuccess("");
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
          scopes: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file",
          queryParams: { access_type: "offline" },
        },
      });
      if (error) throw error;
    } catch (errUnknown: unknown) {
      const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown));
      setError(err.message || "Error al iniciar sesión con Google");
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onSuccess?.();
    } catch (errUnknown: unknown) {
      const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown));
      setError(err.message || "Email o contraseña incorrectos");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { setError("El nombre es obligatorio"); return; }
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (error) throw error;
      setSuccess("¡Cuenta creada! Revisá tu email para confirmar el registro.");
      setEmail(""); setPassword(""); setFullName("");
    } catch (errUnknown: unknown) {
      const err = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown));
      setError(err.message || "Error al crear la cuenta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Panel izquierdo: imagen + marca ── */}
      <div
        className="hidden lg:flex lg:w-[55%] relative flex-col"
        style={{ backgroundImage: `url(${fondoLogin})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-teal-950/95 via-teal-900/85 to-teal-700/75" />

        <div className="relative z-10 flex flex-col h-full p-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl flex items-center justify-center text-xl select-none">
              🦷
            </div>
            <span className="text-white text-xl font-bold tracking-tight">DentalDash</span>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <h2 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-5">
              Tu consultorio,<br />todo en un lugar.
            </h2>
            <p className="text-teal-100/90 text-lg mb-12 max-w-sm leading-relaxed">
              La plataforma que simplifica la gestión de tu consultorio odontológico, desde cualquier lugar.
            </p>
            <ul className="space-y-4">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-4">
                  <div className="w-9 h-9 bg-white/10 border border-white/15 rounded-xl flex items-center justify-center shrink-0">
                    <Icon size={17} className="text-teal-200" />
                  </div>
                  <span className="text-white/85 text-sm leading-snug">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2 text-teal-300/80 text-xs">
            <Shield size={14} />
            <span>Datos protegidos · Acceso seguro con Google OAuth 2.0</span>
          </div>
        </div>
      </div>

      {/* ── Panel derecho: formulario ── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 px-6 py-12">

        <div className="flex lg:hidden items-center mb-10">
          <img src="/Logo%20dentaldash.png" alt="DentalDash" className="h-10 w-auto" />
        </div>

        <div className="w-full max-w-sm">

          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-8">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === "login"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === "register"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Crear cuenta
            </button>
          </div>

          {/* Feedback */}
          {error && (
            <div className="mb-5 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="mb-5 bg-teal-50 border border-teal-100 text-teal-700 px-4 py-3 rounded-xl text-sm">
              {success}
            </div>
          )}

          {/* Formulario email/password */}
          <form onSubmit={mode === "login" ? handleEmailLogin : handleRegister} className="space-y-3">
            {mode === "register" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Nombre completo</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Dr. Juan García"
                  required
                  className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="dr.garcia@consultorio.com"
                required
                className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === "register" ? "Mínimo 6 caracteres" : "••••••••"}
                  required
                  minLength={6}
                  className="w-full px-3.5 py-3 pr-10 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-xl transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed text-sm mt-1"
            >
              {loading
                ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Procesando...</span>
                : mode === "login" ? "Iniciar sesión" : "Crear cuenta"
              }
            </button>
          </form>

          {/* Divisor */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">o continuá con</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Botón Google */}
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 hover:border-teal-400 hover:shadow-md transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed text-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continuar con Google
          </button>

          <div className="my-6 border-t border-gray-100" />

          {/* Links legales */}
          <div className="text-center space-y-2">
            <div className="flex justify-center gap-4 text-xs text-gray-400">
              <Link to="/privacy" className="hover:text-teal-600 transition-colors">Política de Privacidad</Link>
              <span>&bull;</span>
              <Link to="/terms" className="hover:text-teal-600 transition-colors">Condiciones del Servicio</Link>
            </div>
            <p className="text-[10px] text-gray-300">
              Dental Dash &copy; 2026 &middot; Powered by{" "}
              <a href="https://chilldigital.agency" target="_blank" rel="noreferrer" className="hover:text-teal-600 transition-colors">
                ChillDigital
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
