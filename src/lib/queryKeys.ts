/**
 * Query keys canónicas de React Query.
 *
 * Existen porque las keys estaban dispersas: `['patients']` era una const privada
 * de `usePatients`, así que nadie de afuera podía invalidarla — y eso es
 * exactamente lo que motivó el bus de `CustomEvent`s (`patients:refresh`,
 * `turnos:refresh`, `profile:updated`) que corría en paralelo a React Query.
 *
 * `invalidateQueries` matchea POR PREFIJO: invalidar `queryKeys.patients.all`
 * alcanza tanto a todas las listas paginadas/filtradas como a `patients.detail(id)`.
 * Ese es el mecanismo que hace innecesarios los eventos globales.
 */
export const queryKeys = {
    patients: {
        /** Prefijo: alcanza todas las listas y detalles. */
        all: ['patients'] as const,
        list: (page: number, pageSize: number, search: string, status: string) =>
            ['patients', page, pageSize, search, status] as const,
        detail: (id: string) => ['patients', 'detail', id] as const,
    },
    turnos: {
        /** Prefijo: alcanza todos los rangos de fecha cacheados. */
        all: ['turnos'] as const,
        range: (from: string | null, to: string | null) => ['turnos', from, to] as const,
    },
    profile: {
        detail: (userId: string) => ['profile', userId] as const,
    },
    settings: {
        detail: (userId: string) => ['settings', userId] as const,
    },
} as const;
