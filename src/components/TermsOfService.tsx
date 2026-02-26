// src/components/TermsOfService.jsx
import React from 'react';
import { FileText, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TermsOfService() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <header className="bg-white border-b px-6 py-4 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-gray-500 hover:text-teal-600 transition-colors"
                    >
                        <ArrowLeft size={20} />
                        <span className="font-medium">Volver</span>
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center text-white">🦷</div>
                        <span className="font-bold text-gray-900">Dental Dash</span>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 md:p-12">
                    <div className="flex items-center gap-4 mb-8 text-teal-600">
                        <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center">
                            <FileText size={28} />
                        </div>
                        <h1 className="text-3xl font-extrabold text-gray-900">Condiciones del Servicio</h1>
                    </div>

                    <div className="prose prose-teal max-w-none text-gray-600 space-y-6 text-sm md:text-base leading-relaxed">
                        <section>
                            <h2 className="text-xl font-bold text-gray-800">1. Aceptación de los Términos</h2>
                            <p>
                                Al acceder y utilizar Dental Dash, aceptas cumplir con estos Términos y Condiciones. Si no estás de acuerdo con alguna parte de estos términos, no deberás utilizar el servicio.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-800">2. Uso de la Plataforma</h2>
                            <p>
                                Dental Dash es una herramienta diseñada para profesionales de la odontología. Eres responsable de mantener la confidencialidad de tu cuenta y de todas las actividades que ocurran bajo la misma. El uso indebido de la plataforma, incluyendo el intento de vulnerar su seguridad, resultará en la terminación inmediata del acceso.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-800">3. Integración con Google</h2>
                            <p>
                                El servicio requiere la integración con Google Calendar. Al habilitar esta función, autorizas a Dental Dash a gestionar los eventos de calendario relacionados con tus citas. Dental Dash no asume responsabilidad por errores en la sincronización derivados de fallas en los servicios de terceros.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-800">4. Responsabilidad Profesional</h2>
                            <p>
                                Dental Dash es una herramienta de apoyo a la gestión. El profesional odontólogo es el único responsable del tratamiento de los datos de sus pacientes bajo las leyes locales de salud y protección de datos (como la Ley 25.326 de Protección de Datos Personales en Argentina).
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-800">5. Modificaciones</h2>
                            <p>
                                Nos reservamos el derecho de modificar estos términos en cualquier momento. El uso continuado de la plataforma después de dichos cambios constituye la aceptación de los nuevos términos.
                            </p>
                        </section>

                        <section className="pt-8 border-t">
                            <p className="text-xs text-center text-gray-400">
                                Última actualización: 16 de febrero de 2026. <br />
                                Copyright &copy; 2026 ChillDigital Agency.
                            </p>
                        </section>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-8 bg-gray-50 border-t">
                <div className="text-center text-sm text-gray-400">
                    &copy; 2026 Dental Dash. Todos los derechos reservados.
                </div>
            </footer>
        </div>
    );
}
