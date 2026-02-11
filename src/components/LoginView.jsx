
// src/components/LoginView.jsx - SUPABASE VERSION
import React, { useState, useEffect } from "react";
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react";
import fondoLogin from "../imagenes/fondo-login-dentista.jpg";
import { signIn } from "../utils/auth"; // Usa nuestra función wrapper de Supabase
import { supabase } from "../config/supabaseClient";


export default function LoginView({ onSuccess }) {
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Forgot password modal state
  const [fpOpen, setFpOpen] = useState(false);
  const [fpEmail, setFpEmail] = useState("");
  const [fpLoading, setFpLoading] = useState(false);
  const [fpMsg, setFpMsg] = useState({ type: "", text: "" });



  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCredentials((prev) => ({ ...prev, [name]: value }));
    if (error) setError("");
    if (success) setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!credentials.username.trim() || !credentials.password.trim()) {
      setError("Por favor completá todos los campos");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Supabase Login
      await signIn(credentials.username.trim(), credentials.password);

      setSuccess("¡Bienvenido!");
      // No necesitamos hacer nada más, App.js detectará el session change automáticamente

    } catch (err) {
      console.error("Login error:", err);
      if (err.message === "Invalid login credentials") {
        setError("Usuario o contraseña incorrectos");
      } else {
        setError(err.message || "Error de autenticación");
      }
    } finally {
      setLoading(false);
    }
  };

  const quickFill = (user) => {
    // Placeholder for dev convenience if needed, otherwise empty
    // setCredentials({ username: "test@example.com", password: "password" });
  };

  // Forgot Password: submit
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!fpEmail.trim()) {
      setFpMsg({ type: "error", text: "Por favor ingresa tu email para recuperar la contraseña." });
      return;
    }

    setFpLoading(true);
    setFpMsg({ type: "", text: "" }); // Clear previous messages

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(fpEmail.trim(), {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) throw error;

      setFpMsg({ type: "success", text: "Se ha enviado un correo de recuperación. Revisa tu bandeja de entrada." });
      // Optionally close the modal after success, or let the user see the message
      // setFpOpen(false);
    } catch (err) {
      console.error("Forgot password error:", err);
      setFpMsg({ type: "error", text: err.message || "Error al enviar correo de recuperación." });
    } finally {
      setFpLoading(false);
    }
  };

  // Close modal with ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setFpOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <style>{`
        .brand-bg { background-color: #0C9488 !important; }
        .brand-text { color: #0C9488 !important; }
        .brand-btn { background-color: #0C9488 !important; color: #fff !important; }
        .brand-btn:hover { background-color: #097C73 !important; }
        .brand-ring:focus { outline: none !important; box-shadow: 0 0 0 2px #0C9488 !important; }
      `}</style>

      <div className="relative min-h-screen grid lg:grid-cols-2">
        {/* Fondo para mobile: misma imagen con overlay negro */}
        <div
          className="lg:hidden absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${fondoLogin})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-black/50" />
        </div>
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
        <div className="relative z-10 flex items-center justify-center p-8">
          <div className="w-full max-w-md bg-white border rounded-2xl shadow-sm p-8">
            <h1 className="text-3xl font-semibold text-gray-900">Login</h1>
            <p className="text-gray-500 mt-2">Accedé a tu sistema odontológico.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {/* Mensajes de estado */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                  <CheckCircle size={16} />
                  <span>{success}</span>
                </div>
              )}

              {/* Campo Usuario */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  id="username"
                  name="username"
                  value={credentials.username}
                  onChange={handleInputChange}
                  placeholder="tu@email.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                  disabled={loading}
                  autoComplete="username"
                />
              </div>

              {/* Campo Contraseña */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    value={credentials.password}
                    onChange={handleInputChange}
                    placeholder="Tu contraseña"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors pr-12"
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {/* Botón Login */}
              <button
                type="submit"
                disabled={loading || !credentials.username.trim() || !credentials.password.trim()}
                className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Ingresando...
                  </>
                ) : (
                  "Ingresar"
                )}
              </button>

              {/* Olvidaste tu contraseña */}
              <div className="text-center mt-4">
                <button
                  type="button"
                  className="text-sm text-gray-400 hover:underline hover:text-teal-700 transition-colors"
                  onClick={() => { setFpOpen(true); setFpEmail(""); setFpMsg({ type: "", text: "" }); }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </form>

            {/* Footer info */}
            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
              <p className="text-xs text-gray-500">Dental Dash</p>
              <p className="text-xs text-gray-400 mt-1">Powered by <a href="https://chilldigital.agency" target="_blank">ChillDigital</a></p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Forgot Password */}
      {fpOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFpOpen(false)} aria-hidden="true" />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow-xl border p-6 relative">
              <h2 className="text-xl font-semibold text-gray-900">Recuperar contraseña</h2>
              <p className="text-sm text-gray-500 mt-1">Ingresá tu email. Si existe una cuenta, te enviaremos instrucciones.</p>

              {/* Mensaje modal */}
              {fpMsg.text && (
                <div className={`mt-4 px-4 py-3 rounded-lg text-sm border flex items-center gap-2 ${fpMsg.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                  {fpMsg.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  <span>{fpMsg.text}</span>
                </div>
              )}

              <form onSubmit={handleForgotPassword} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="fp-email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    id="fp-email"
                    type="email"
                    value={fpEmail}
                    onChange={(e) => setFpEmail(e.target.value)}
                    placeholder="tuemail@ejemplo.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                    disabled={fpLoading}
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button type="button" className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50" onClick={() => setFpOpen(false)} disabled={fpLoading}>Cancelar</button>
                  <button type="submit" disabled={fpLoading || !fpEmail.trim()} className="px-4 py-2 text-sm rounded-lg brand-btn disabled:bg-gray-400 disabled:cursor-not-allowed">{fpLoading ? "Enviando..." : "Enviar"}</button>
                </div>
              </form>

              {/* Cerrar con X */}
              <button type="button" aria-label="Cerrar" onClick={() => setFpOpen(false)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">×</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
