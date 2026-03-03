const fs = require('fs');

// 1. PatientTable: pendingDelete is typed as null but accessed as .id
let pt = fs.readFileSync('src/components/PatientTable.tsx', 'utf8');
pt = pt.replace(
    'const [pendingDelete, setPendingDelete] = useState(null);',
    'const [pendingDelete, setPendingDelete] = useState<any>(null);'
);
fs.writeFileSync('src/components/PatientTable.tsx', pt);

// 2. PatientService: historiaClinica: publicUrl where historiaClinica is string | undefined in Patient
// but publicUrl is string | null <- conflict with null vs undefined
let pat = fs.readFileSync('src/services/PatientService.ts', 'utf8');
pat = pat.replace(
    'historiaClinica: publicUrl,',
    'historiaClinica: publicUrl ?? undefined,'
);
fs.writeFileSync('src/services/PatientService.ts', pat);

console.log('Done.');
