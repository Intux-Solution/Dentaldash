const fs = require('fs');

// StorageService.ts
let storage = fs.readFileSync('src/services/StorageService.ts', 'utf8');
const oldUploadFile = `    async uploadFile(file: File, bucket = 'clinical-records', path: string, userId: string | null = null) {
        try {
            if (!file) return null;

            // Ensure unique filename if only a folder or prefix is provided
            // If 'path' is just a folder or patient ID, append filename
            let finalPath = path;
            if (!path) {
                const fileExt = file.name.split('.').pop();
                const fileName = \`\${crypto.randomUUID()}.\${fileExt}\`;
                finalPath = fileName;
            }

            // SAFETY NET: Supabase RLS policies usually require the file to be within 
            // a folder matching the user's ID to permit the INSERT operation.
            if (bucket === 'clinical-records' && finalPath && !finalPath.includes('/') && userId) {
                finalPath = \`\${userId}/\${finalPath}\`;
            }

            const { data, error } = await supabase.storage
                .from(bucket)
                .upload(finalPath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;
            return data.path;`;

const newUploadFile = `    async uploadFile(file: File, bucket = 'clinical-records', path: string) {
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
            return data.path;`;

let oldUploadFileCRLF = oldUploadFile.replace(/\n/g, '\r\n');
storage = storage.replace(oldUploadFile, newUploadFile);
storage = storage.replace(oldUploadFileCRLF, newUploadFile);
fs.writeFileSync('src/services/StorageService.ts', storage);

// PatientService.ts
let patient = fs.readFileSync('src/services/PatientService.ts', 'utf8');
const oldPatientUpload = `    const fileExt = file.name.split('.').pop();
    const fileName = \`\${Math.random()}.\${fileExt}\`;
    const filePath = \`\${userId}/\${fileName}\`;

    const { error: uploadError } = await supabase.storage
      .from('clinical-records')
      .upload(filePath, file);

    if (uploadError) throw uploadError;
    return filePath;`;

const newPatientUpload = `    const fileExt = file.name.split('.').pop();
    const fileName = \`\${crypto.randomUUID()}.\${fileExt}\`;
    const filePath = \`\${userId}/\${fileName}\`;

    const uploadedPath = await StorageService.uploadFile(file, 'clinical-records', filePath);
    if (!uploadedPath) throw new Error('No se pudo completar la subida del archivo');
    
    return uploadedPath;`;

let oldPatientUploadCRLF = oldPatientUpload.replace(/\n/g, '\r\n');
patient = patient.replace(oldPatientUpload, newPatientUpload);
patient = patient.replace(oldPatientUploadCRLF, newPatientUpload);
fs.writeFileSync('src/services/PatientService.ts', patient);

console.log('Replacements completed.');
