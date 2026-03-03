const fs = require('fs');

// 1. PatientService: fix insert spread (patient_id appears in both explicit key and record spread)
// The record type is Omit<ClinicalRecord, 'id' | 'created_at'> which still contains patient_id and user_id
// So we need to destructure them out of record before spreading
let pat = fs.readFileSync('src/services/PatientService.ts', 'utf8');

// Replace the entire insert block to avoid spread conflict
const old = `      .insert([{
        patient_id: patientId,
        user_id: userId,
        tipo_procedimiento: record.tipo_procedimiento,
        descripcion: record.descripcion,
        notas: record.notas,
        fecha: record.fecha,
        odontogram_state: record.odontogram_state
          ? JSON.stringify(record.odontogram_state)
          : null,
      }])`;

// If the node fix worked, current state may be different. Let's do a broader match
const altOld = `      .insert([{
        patient_id: patientId,
        ...record,
        user_id: userId,
        odontogram_state: record.odontogram_state
          ? JSON.stringify(record.odontogram_state)
          : null,
      }])`;

const newInsert = `      .insert([{
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

if (pat.includes(old)) {
    pat = pat.replace(old, newInsert);
} else if (pat.includes(altOld)) {
    pat = pat.replace(altOld, newInsert);
}
fs.writeFileSync('src/services/PatientService.ts', pat);

// 2. PatientProfileModal: add props interface
let ppm = fs.readFileSync('src/components/PatientProfileModal.tsx', 'utf8');
ppm = ppm.replace(
    'export default function PatientProfileModal({ open, patient, onClose, onEdit, onDelete, onMessage, onOpenRecord }) {',
    `interface PatientProfileModalProps {
  open: boolean;
  patient: any;
  onClose: () => void;
  onEdit?: (patient: any) => void;
  onDelete?: (patient: any) => Promise<void>;
  onMessage?: (patient: any) => void;
  onOpenRecord?: (patient: any) => void;
}

export default function PatientProfileModal({ open, patient, onClose, onEdit, onDelete, onMessage, onOpenRecord }: PatientProfileModalProps) {`
);
// Also type the getEstadoColor and getField inner functions 
ppm = ppm
    .replace('const getEstadoColor = (estado) => {', 'const getEstadoColor = (estado: string) => {')
    .replace('const getField = (p, fieldNames, defaultValue = \'-\') => {', 'const getField = (p: any, fieldNames: string[], defaultValue = \'-\') => {')
    .replace('const onKey = (e) => {', 'const onKey = (e: KeyboardEvent) => {');
fs.writeFileSync('src/components/PatientProfileModal.tsx', ppm);

console.log('Done.');
