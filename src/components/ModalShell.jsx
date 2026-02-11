import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * ModalShell
 *
 * Estructura con 3 zonas:
 *  - Header fijo (título + cerrar)
 *  - Body scrollable (contenido)
 *  - Footer fijo (botones)
 *
 * Esto asegura márgenes superior/inferior respecto a la ventana,
 * que el scroll sólo afecte al contenido y que los botones
 * queden siempre visibles. Además, el contenedor de la tarjeta
 * usa `overflow-hidden` para que la barra de scroll no sobresalga.
 */
export default function ModalShell({ title, onClose, children, footer }) {
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Wrapper: añade márgenes top/bottom */}
      <div className="relative z-10 flex h-full items-center justify-center py-6 md:py-10 px-4">
        {/* Card del modal */}
        <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border flex flex-col max-h-[calc(100vh-3rem)] md:max-h-[calc(100vh-5rem)] min-h-0 overflow-hidden">
          {/* Header fijo */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
            <h3 className="text-lg font-semibold text-gray-900 truncate pr-4">{title}</h3>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 [scrollbar-gutter:stable]">
            {children}
          </div>

          {/* Footer fijo (botones) */}
          {footer && (
            <div className="px-6 py-4 border-t bg-white">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}