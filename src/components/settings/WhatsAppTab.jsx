import React from 'react';
import { MessageSquare } from 'lucide-react';
import { QRCode } from 'antd';
import { supabase } from '../../config/supabaseClient';

export default function WhatsAppTab({
    tenant, setTenant, profile,
    instanceStatus, pollingActive, qrCodeData, saving,
    handleConnectWhatsApp, handleDisconnectWhatsApp, session
}) {
    if (!profile?.user_id) {
        return (
            <div className="p-8 text-center py-12">
                <p className="text-gray-500 mb-4">Iniciando configuración...</p>
            </div>
        );
    }

    return (
        <div className="p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <MessageSquare size={20} className="text-teal-600" />
                Conexión de WhatsApp
            </h2>
            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col md:flex-row items-center gap-8">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`w-3 h-3 rounded-full ${instanceStatus === 'connected' ? 'bg-green-500' : instanceStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                        <span className="font-bold text-gray-700">
                            Estado: {instanceStatus === 'connected' ? 'Conectado' : instanceStatus === 'connecting' ? 'Conectando...' : 'Desconectado'}
                        </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                        Conecta tu cuenta de WhatsApp para que el asistente pueda responder a tus pacientes automáticamente.
                    </p>

                    {instanceStatus === 'connected' ? (
                        <button
                            onClick={handleDisconnectWhatsApp}
                            disabled={saving}
                            className="px-6 py-2 bg-red-50 text-white border border-red-200 !text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all disabled:opacity-50"
                        >
                            Desconectar WhatsApp
                        </button>
                    ) : (
                        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                            <button
                                onClick={handleConnectWhatsApp}
                                disabled={saving || pollingActive}
                                className="flex-1 px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all disabled:opacity-50 whitespace-nowrap"
                            >
                                {pollingActive ? 'Esperando conexión...' : 'Conectar WhatsApp'}
                            </button>
                            {pollingActive && (
                                <button
                                    onClick={handleDisconnectWhatsApp}
                                    disabled={saving}
                                    className="flex-1 px-6 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl font-bold hover:bg-red-100 transition-all disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                            )}
                        </div>
                    )}
                </div>
                {qrCodeData && instanceStatus !== 'connected' && (
                    <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
                        {qrCodeData.startsWith('data:image') ? (
                            <img src={qrCodeData} alt="WhatsApp QR" className="w-[180px] h-[180px] object-contain" />
                        ) : (
                            <QRCode value={qrCodeData} size={180} />
                        )}
                        <p className="text-[10px] text-center mt-2 text-gray-400 font-bold uppercase">Escanea con WhatsApp</p>
                    </div>
                )}
            </div>
        </div>
    );
}
