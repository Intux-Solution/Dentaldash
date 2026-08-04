import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ImageLightboxProps {
    src: string;
    alt: string;
    onClose: () => void;
}

/**
 * Visor a pantalla completa para las capturas de la ayuda. A diferencia de
 * `ModalShell`, acá sí cierra con Escape: es una vista de sólo lectura donde el
 * teclado es la salida natural.
 */
export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);

        const original = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = original;
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={alt}
        >
            <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute top-4 right-4 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
                <X size={22} />
            </button>

            <img
                src={src}
                alt={alt}
                onClick={(e) => e.stopPropagation()}
                className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            />
        </div>
    );
}
