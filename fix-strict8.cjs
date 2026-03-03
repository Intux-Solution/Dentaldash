const fs = require('fs');

// 1. Fix PatientService addClinicalRecord:
// The ClinicalRecord type has patient_id and user_id in it. 
// When we spread `record` (which is Omit<ClinicalRecord, 'id' | 'created_at'>), those fields are still there.
// Then we also explicitly specify patient_id and user_id -> TS2783 duplicate key.
// Fix: destructure patient_id and user_id OUT of the spread
let pat = fs.readFileSync('src/services/PatientService.ts', 'utf8');

// Find and replace the insert block
const insertOld1 = `.insert([{
        patient_id: patientId,
        ...record,
        user_id: userId,
        odontogram_state: record.odontogram_state
          ? JSON.stringify(record.odontogram_state)
          : null,
      }])`;

const insertOld2 = `.insert([{
        patient_id: patientId,
        user_id: userId,
        tipo_procedimiento: (record as any).tipo_procedimiento,
        descripcion: (record as any).descripcion,
        notas: (record as any).notas,
        fecha: (record as any).fecha,
        archivos_urls: (record as any).archivos_urls,
        odontogram_state: record.odontogram_state
          ? JSON.stringify(record.odontogram_state)
          : null,
      }])`;

const insertNew = `.insert([(() => {
        // Destructure known keys from record to avoid TS2783 duplicate key spread conflict
        const { patient_id: _p, user_id: _u, odontogram_state, ...rest } = record;
        return {
          ...rest,
          patient_id: patientId,
          user_id: userId,
          odontogram_state: odontogram_state
            ? JSON.stringify(odontogram_state)
            : null,
        };
      })()])`;

if (pat.includes(insertOld1)) {
    pat = pat.replace(insertOld1, insertNew);
    console.log('Replaced insertOld1');
} else if (pat.includes(insertOld2)) {
    pat = pat.replace(insertOld2, insertNew);
    console.log('Replaced insertOld2');
} else {
    console.log('WARNING: PatientService insert block not found. Current around line 181:');
    // Just show current state
    const lines = pat.split('\n');
    lines.slice(178, 195).forEach((l, i) => console.log((178 + i + 1) + ': ' + l));
}
fs.writeFileSync('src/services/PatientService.ts', pat);

// 2. Fix PatientProfileModal InfoRow prop typing
let ppm = fs.readFileSync('src/components/PatientProfileModal.tsx', 'utf8');
const infoRowOld = "  const InfoRow = ({ icon: Icon, label, value, className = '' }) => (";
const infoRowNew = `  const InfoRow = ({ icon: Icon, label, value, className = '' }: { icon: React.ElementType; label: string; value: React.ReactNode; className?: string }) => (`;
ppm = ppm.replace(infoRowOld, infoRowNew);
fs.writeFileSync('src/components/PatientProfileModal.tsx', ppm);

console.log('Patches applied.');
