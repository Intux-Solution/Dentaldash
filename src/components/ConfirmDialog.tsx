import React from 'react';
import { Loader2 } from 'lucide-react';
import ModalShell from './ModalShell';

/**
 * ConfirmDialog
 *
 * Confirmacion in-app sobre ModalShell, en reemplazo del confirm() nativo:
 * el dialogo del navegador rompe el look de la app y no permite formatear
 * el mensaje. El cuerpo es JSX libre para poder resaltar montos y fechas.
 */

interface ConfirmDialogProps {
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmClass =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-teal-600 hover:bg-teal-700 text-white';

  return (
    <ModalShell
      title={title}
      onClose={loading ? () => {} : onCancel}
      footer={(
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60 ${confirmClass}`}
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      )}
    >
      <div className="py-1 space-y-3 text-sm text-gray-700 leading-relaxed">
        {children}
      </div>
    </ModalShell>
  );
}
