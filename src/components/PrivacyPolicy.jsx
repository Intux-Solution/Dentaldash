// src/components/PrivacyPolicy.jsx
import React from 'react';
import { Shield, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
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
                            <Shield size={28} />
                        </div>
                        <h1 className="text-3xl font-extrabold text-gray-900">Política de Privacidad</h1>
                    </div>

                    <div className="prose prose-teal max-w-none text-gray-600 space-y-6 text-sm md:text-base leading-relaxed">
                        <section>
                            <h2 className="text-xl font-bold text-gray-800">1. Introducción</h2>
                            <p>
                                En Dental Dash, la privacidad y seguridad de tus datos son nuestra máxima prioridad. Esta Política de Privacidad describe cómo recopilamos, utilizamos y protegemos la información cuando utilizas nuestra plataforma de gestión odontológica.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-800">2. Información que Recopilamos</h2>
                            <p>
                                Al utilizar Dental Dash a través de tu cuenta de Google, accedemos a la siguiente información:
                            </p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong>Información de Perfil:</strong> Nombre, dirección de correo electrónico y foto de perfil para identificar tu cuenta.</li>
                                <li><strong>Google Calendar:</strong> Solicitamos permisos para leer y escribir en tu calendario con el único fin de sincronizar tus turnos y citas profesionales. No compartimos esta información con terceros.</li>
                                <li><strong>Datos de Pacientes:</strong> La información que ingresas sobre tus pacientes se almacena de forma segura en bases de datos cifradas y es accesible únicamente por ti.</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-800">3. Uso de la Información</h2>
                            <p>
                                Utilizamos los datos recopilados estrictamente para:
                            </p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>Proporcionar el servicio de gestión de consultorio.</li>
                                <li>Sincronizar automáticamente tus citas con Google Calendar.</li>
                                <li>Mejorar la experiencia del usuario y el rendimiento de la aplicación.</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-800">4. Seguridad de los Datos</h2>
                            <p>
                                Implementamos medidas de seguridad técnicas y organizativas de última generación, incluyendo cifrado SSL/TLS y almacenamiento seguro a través de Supabase, para proteger tus datos contra accesos no autorizados.
                            </p>
                        </section>

                        <section className="pt-8 border-t">
                            <p className="text-xs text-center text-gray-400">
                                Última actualización: 16 de febrero de 2026. <br />
                                Si tienes dudas sobre nuestra política, puedes contactarnos en soporte@dentaldash.com
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
