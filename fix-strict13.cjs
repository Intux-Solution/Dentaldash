const fs = require('fs');

// InsurancesTab: type handleRemove param
let ins = fs.readFileSync('src/components/settings/InsurancesTab.tsx', 'utf8');
ins = ins.replace(
    'const handleRemove = async (index) => {',
    'const handleRemove = async (index: number) => {'
);
// Also type the .filter callback
ins = ins.replace(
    '.filter((_, idx) => idx !== index)',
    '.filter((_: any, idx: number) => idx !== index)'
);
fs.writeFileSync('src/components/settings/InsurancesTab.tsx', ins);

// useNormalizedPatients: type getField params
let nnp = fs.readFileSync('src/hooks/useNormalizedPatients.ts', 'utf8');
nnp = nnp.replace(
    'function parseFechaToMs(raw) {',
    'function parseFechaToMs(raw: unknown) {'
);
nnp = nnp.replace(
    'export function useNormalizedPatients(patients) {',
    'export function useNormalizedPatients(patients: any[]) {'
);
nnp = nnp.replace(
    "const getField = (obj, fieldNames, defaultValue = '') => {",
    "const getField = (obj: any, fieldNames: string[], defaultValue = '') => {"
);
fs.writeFileSync('src/hooks/useNormalizedPatients.ts', nnp);

console.log('Done.');
