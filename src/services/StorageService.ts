import { supabase } from '../config/supabaseClient';

export const StorageService = {
    /**
     * Upload a file to Supabase Storage
     * @param {File} file - The file to upload
     * @param {string} bucket - The bucket name (default: 'clinical-records')
     * @param {string} path - The path/filename
     * @returns {Promise<string|null>} The full path of the uploaded file
     */
    async uploadFile(file: File, bucket = 'clinical-records', path: string) {
        try {
            if (!file) return null;
            if (!path) throw new Error('Path is required to upload a file');

            const { data, error } = await supabase.storage
                .from(bucket)
                .upload(path, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;
            return data.path;
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            console.error('Error uploading file:', error);
            throw error;
        }
    },

    /**
     * Get a signed URL for a file
     * @param {string} path - The path of the file in storage
     * @param {string} bucket - The bucket name (default: 'clinical-records')
     * @param {number} expiresIn - Expiration time in seconds (default: 3600 - 1 hour)
     * @returns {Promise<string|null>} The signed URL
     */
    async getSignedUrl(path: string, bucket = 'clinical-records', expiresIn = 3600) {
        try {
            if (!path) return null;

            // Debido a "Eventual Consistency" en Supabase, el archivo puede no estar listo 
            // instantáneamente para firmar tras la subida. Agregamos un retry mechanism.
            let attempt = 0;
            const maxAttempts = 3;

            while (attempt < maxAttempts) {
                const { data, error } = await supabase.storage
                    .from(bucket)
                    .createSignedUrl(path, expiresIn);

                if (!error && data?.signedUrl) {
                    return data.signedUrl;
                }

                attempt++;
                if (attempt < maxAttempts) {
                    // Esperar (500ms, 1000ms, etc) antes de reintentar
                    await new Promise(resolve => setTimeout(resolve, attempt * 500));
                } else {
                    console.error('Error getting signed URL after retries:', error);
                    return null;
                }
            }
            return null;
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            // Ignore abort errors (component unmounted or rapid changes)
            if (error.message && (error.message.includes('aborted') || error.name === 'AbortError')) {
                return null;
            }
            console.error('Error in getSignedUrl:', error);
            return null;
        }
    },

    /**
     * Delete a file from Supabase Storage
     * @param {string} path - The path of the file to delete
     * @param {string} bucket - The bucket name (default: 'clinical-records')
     */
    async deleteFile(path: string, bucket = 'clinical-records') {
        try {
            if (!path) return;
            const { error } = await supabase.storage
                .from(bucket)
                .remove([path]);

            if (error) throw error;
        } catch (errorUnknown: unknown) {
            const error = errorUnknown instanceof Error ? errorUnknown : new Error(String(errorUnknown) || "Ocurrió un error inesperado.");
            console.error('Error deleting file from storage:', error);
            throw error;
        }
    },

    /**
     * Valida la URL de un registro. Si es pública la devuelve, 
     * si es un path válido solicita y devuelve una URL firmada.
     * @param {string} rawUrl - La string cruda desde la base de datos
     * @returns {Promise<string|null>} URL válida construida
     */
    async getValidRecordUrl(rawUrl: string): Promise<string | null> {
        if (!rawUrl) return null;

        const isPublicUrl = rawUrl.startsWith("http://") || rawUrl.startsWith("https://");
        if (isPublicUrl) return rawUrl;

        const isLikelyPath = typeof rawUrl === 'string' &&
            rawUrl.length > 5 &&
            !rawUrl.includes(' ') &&
            !['Sin archivo', 'Sin historia clínica', 'Sin historia clinica', '-'].includes(rawUrl);

        if (!isLikelyPath) return null;

        return await this.getSignedUrl(rawUrl);
    }
};
