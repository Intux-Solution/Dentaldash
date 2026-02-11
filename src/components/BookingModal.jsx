import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import BookingForm from './BookingForm';

export default function BookingModal({ open, onClose, onSuccess }) {
  if (!open) return null;

  const handleSuccess = () => {
    if (onSuccess) onSuccess();
    onClose();
  };

  // Bloquear scroll del body mientras el modal está abierto
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, []);

  return (
    // El contenedor externo no debe scrollear: el scroll va dentro del modal
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      ></div>
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 text-gray-900 hover:text-gray-700"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
          
          {/* BookingForm content (scrollable) */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] w-full">
            <BookingForm onSuccess={handleSuccess} />
          </div>
        </div>
      </div>
    </div>
  );
}
