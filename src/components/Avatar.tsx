import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { initials } from '../utils/helpers';
import { avatarColor } from '../utils/avatar';

interface AvatarProps {
    /** URL ya resuelta con `resolveAvatarUrl`. Si falta, se muestran las iniciales. */
    src?: string | null;
    /** Nombre del que se derivan las iniciales y el color de fondo. */
    name?: string | null;
    /** Diámetro en píxeles. */
    size?: number;
    /** Clases extra del contenedor (ring, shadow, border...). */
    className?: string;
    alt?: string;
}

/**
 * Avatar del profesional. Si no hay foto cargada, genera una por defecto con
 * las iniciales del nombre sobre un color determinístico.
 */
export default function Avatar({ src, name, size = 40, className = '', alt = 'Perfil' }: AvatarProps) {
    const [failed, setFailed] = useState(false);

    // Una URL nueva merece un nuevo intento de carga.
    useEffect(() => {
        setFailed(false);
    }, [src]);

    const dimensions = { width: size, height: size };

    if (src && !failed) {
        return (
            <img
                src={src}
                alt={alt}
                style={dimensions}
                onError={() => setFailed(true)}
                className={`rounded-full object-cover ${className}`}
            />
        );
    }

    const text = initials(name ?? '');

    return (
        <div
            style={dimensions}
            aria-label={alt}
            className={`rounded-full flex items-center justify-center text-white font-semibold select-none ${avatarColor(name)} ${className}`}
        >
            {text ? (
                <span style={{ fontSize: Math.round(size * 0.4), lineHeight: 1 }}>{text}</span>
            ) : (
                <User size={Math.round(size * 0.5)} />
            )}
        </div>
    );
}
