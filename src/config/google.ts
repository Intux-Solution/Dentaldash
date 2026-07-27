/**
 * Scopes de OAuth que pedimos a Google.
 *
 * Debe ser idéntico en el login (LoginView) y en la conexión desde Configuración
 * (useSettings): si difieren, Google considera que es un consentimiento distinto
 * y fuerza re-consents innecesarios.
 *
 * Solo pedimos Calendar. El scope `drive.file` que se pedía antes quedó de la
 * función `process-pdf`, ya neutralizada, y no lo usa ningún código actual.
 */
export const GOOGLE_OAUTH_SCOPES = 'https://www.googleapis.com/auth/calendar';
