import { supabase } from '../config/supabaseClient';

export const StorageService = {
    /**
     * Upload a file to Supabase Storage
     * @param {File} file - The file to upload
     * @param {string} bucket - The bucket name (default: 'clinical-records')
     * @param {string} path - The path/filename
     * @returns {Promise<string|null>} The full path of the uploaded file
     */
    async uploadFile(file, bucket = 'clinical-records', path) {
        try {
            if (!file) return null;

            // Ensure unique filename if only a folder or prefix is provided
            // If 'path' is just a folder or patient ID, append filename
            let finalPath = path;
            if (!path) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
                finalPath = fileName;
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

            const { data, error } = await supabase.storage
                .from(bucket)
                .createSignedUrl(path, expiresIn);

            if (error) {
                // If it's a 400 we likely just deleted the file while changing it, ignore console noise
                if (error.status !== 400) console.error('Error getting signed URL:', error);
                return null;
            }
            return data.signedUrl;
        } catch (error) {
            // Silencio absoluto en el catch para evitar ruidos de red/consola inútiles
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
