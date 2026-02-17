import { supabase } from '../config/supabaseClient';

export class GoogleDriveService {
    /**
     * Get the provider token from the current session.
     */
    static async getProviderToken() {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.provider_token;
    }

    /**
     * Busca o crea la carpeta especificada.
     */
    static async getOrCreateFolder(folderName, token) {
        // 1. Buscar si existe
        const searchParams = new URLSearchParams({
            q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)',
        });

        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?${searchParams}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
            return searchData.files[0].id;
        }

        // 2. Si no existe, crearla
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            })
        });

        const createData = await createRes.json();
        return createData.id;
    }

    /**
     * Busca y elimina archivos con el mismo nombre en una carpeta.
     */
    static async deleteExistingFiles(fileName, folderId, token) {
        const searchParams = new URLSearchParams({
            q: `name = '${fileName}' and '${folderId}' in parents and trashed = false`,
            fields: 'files(id)',
        });

        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?${searchParams}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
            for (const file of searchData.files) {
                await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }
        }
    }

    /**
     * Sube un archivo a Google Drive dentro de HistoriasClinicas, con el nombre del paciente.
     */
    static async uploadFile(file, patientName = "Paciente") {
        const token = await this.getProviderToken();
        if (!token) {
            console.warn('No Google provider token found.');
            return null;
        }

        try {
            // 1. Asegurar carpeta HistoriasClinicas
            const folderId = await this.getOrCreateFolder('HistoriasClinicas', token);

            // 2. Preparar nombre de archivo (Saneado básico)
            const fileExt = file.name.split('.').pop();
            const fileName = `${patientName.replace(/[^a-z0-9]/gi, '_')}.${fileExt}`;

            // 3. Eliminar si ya existe (para sobrescribir)
            await this.deleteExistingFiles(fileName, folderId, token);

            // 4. Subir el archivo
            const metadata = {
                name: fileName,
                mimeType: file.type,
                parents: [folderId]
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', file);

            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: form,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Drive Upload Error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            return {
                id: data.id,
                url: data.webViewLink,
                embedUrl: data.webViewLink.replace('/view', '/preview')
            };
        } catch (error) {
            console.error('Error in GoogleDriveService:', error);
            return null;
        }
    }
}
