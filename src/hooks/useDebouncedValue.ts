import { useEffect, useState } from 'react';

/**
 * Devuelve `value` retrasado `delay` ms.
 *
 * Pensado para alimentar queryKeys de React Query desde un input controlado sin
 * disparar un fetch por tecla. Lo que se retrasa es el valor que entra a la
 * query, no la escritura del input ni la de la URL: esas siguen siendo inmediatas.
 *
 * En el primer render devuelve `value` sin retraso, así una URL con `?q=juan`
 * arranca con el término ya aplicado en vez de gastar un fetch sin filtro.
 */
export function useDebouncedValue<T>(value: T, delay = 400): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}
