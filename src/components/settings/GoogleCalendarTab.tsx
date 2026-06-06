import React from 'react';
import { Calendar } from 'lucide-react';

interface GoogleCalendarTabProps {
    googleConnected: boolean;
    googleDisconnecting: boolean;
    handleConnectGoogle: () => void;
    handleDisconnectGoogle: () => void;
}

export default function GoogleCalendarTab({
    googleConnected, googleDisconnecting,
    handleConnectGoogle, handleDisconnectGoogle
}: GoogleCalendarTabProps) {
    return (
        <div className="p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar size={20} className="text-teal-600" />
                Conexión de Google Calendar
            </h2>
            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col md:flex-row items-center gap-8">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`w-3 h-3 rounded-full ${googleConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="font-bold text-gray-700">
                            Estado: {googleConnected ? 'Conectado' : 'Desconectado'}
                        </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                        Conecta tu cuenta de Google para sincronizar automáticamente tus turnos con
                        tu Google Calendar. Cada turno que crees, edites o elimines se reflejará en tu calendario.
                    </p>

                    {googleConnected ? (
                        <button
                            onClick={handleDisconnectGoogle}
                            disabled={googleDisconnecting}
                            className="px-6 py-2 bg-red-50 text-white border border-red-200 !text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all disabled:opacity-50"
                        >
                            {googleDisconnecting ? 'Desconectando...' : 'Desconectar Google Calendar'}
                        </button>
                    ) : (
                        <button
                            onClick={handleConnectGoogle}
                            className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all disabled:opacity-50 whitespace-nowrap"
                        >
                            Conectar Google Calendar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
