/**
 * Log que solo escribe en desarrollo.
 *
 * La consola del navegador queda visible en cualquier equipo compartido del
 * consultorio, así que los payloads de turnos y los datos de pacientes (DNI,
 * antecedentes) no pueden imprimirse en producción. Para errores usar
 * `console.error`, que sí debe sobrevivir al build — pero sin datos personales
 * en el mensaje.
 */
export const devLog = (...args: unknown[]): void => {
  if (import.meta.env.DEV) console.log(...args);
};
