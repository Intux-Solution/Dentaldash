import { supabase } from '../config/supabaseClient';

export const StorageService = {
    /**
     * Upload a file to Supabase Storage
     * @param {File} file - The file to upload
     * @param {string} bucket - The bucket name (default: 'clinical-records')
     * @param {string} path - The path/filename
     * @returns {Promise<string|null>} The full path of the uploaded file
     */
    async uploadFile(file, bucket = 'clinical-records', path, userId = null) {
        try {
            if (!file) return null;

            // Ensure unique filename if only a folder or prefix is provided
            // If 'path' is just a folder or patient ID, append filename
            let finalPath = path;
            if (!path) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${crypto.randomUUID()}.${fileExt}`;
                finalPath = fileName;
            }

            // SAFETY NET: Supabase RLS policies usually require the file to be within 
            // a folder matching the user's ID to permit the INSERT operation.
            if (bucket === 'clinical-records' && finalPath && !finalPath.includes('/') && userId) {
                finalPath = `${userId}/${finalPath}`;
            }

            const { data, error } = await supabase.storage
                .from(bucket)
                .upload(finalPath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;
            return data.path;
        } catch (error) {
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
    async getSignedUrl(path, bucket = 'clinical-records', expiresIn = 3600) {
        try {
            if (!path) return null;

            // 1. Verificar si el archivo realmente existe antes de intentar firmarlo
            // Esto evita el error 400 (Bad Request) que ensucia la consola
            const fileName = path.split('/').pop();
            const folderPath = path.substring(0, path.lastIndexOf('/')) || ''; // Si está en raiz, folder es ''

            const { data: files, error: listError } = await supabase.storage
                .from(bucket)
                .list(folderPath, {
                    search: fileName
                });

            if (listError) {
                console.warn('Error checking file existence:', listError);
                return null;
            }

            // Si la lista está vacía o el archivo exacto no está, retornamos null
            const fileExists = files && files.find(f => f.name === fileName);
            if (!fileExists) {
                console.warn(`File not found in storage: ${path}`);
                return null;
            }

            // 2. Si existe, procedemos a firmar
            const { data, error } = await supabase.storage
                .from(bucket)
                .createSignedUrl(path, expiresIn);

            if (error) {
                console.error('Error getting signed URL:', error);
                return null;
            }
            return data.signedUrl;
        } catch (error) {
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
    async deleteFile(path, bucket = 'clinical-records') {
        try {
            if (!path) return;
            const { error } = await supabase.storage
                .from(bucket)
                .remove([path]);

            if (error) throw error;
        } catch (error) {
            console.error('Error deleting file from storage:', error);
            throw error;
        }
    }
};
