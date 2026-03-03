const fs = require('fs');

// 1. LoginView.tsx: add LoginViewProps interface
let lv = fs.readFileSync('src/components/LoginView.tsx', 'utf8');
lv = lv.replace(
    'export default function LoginView({ onSuccess }) {',
    `interface LoginViewProps {
  onSuccess?: () => void;
}

export default function LoginView({ onSuccess }: LoginViewProps) {`
);
fs.writeFileSync('src/components/LoginView.tsx', lv);

// 2. Header.tsx: fix avatar assignment
// The issue is avatar is string | undefined in one case but null in state.
// Fix by assigning avatar || null explicitly
let header = fs.readFileSync('src/components/Header.tsx', 'utf8');
header = header.replace(
    'avatar: (avatar ?? null) as string | null,',
    'avatar: avatar ?? null,'
);
// If that already exists, replace it again correctly
if (!header.includes('avatar: avatar ?? null,')) {
    header = header.replace('avatar: avatar,', 'avatar: (avatar as string | null) ?? null,');
}
header = header.replace(/email: user\.email,/g, 'email: user.email ?? \'\',');
fs.writeFileSync('src/components/Header.tsx', header);

// 3. PatientService: TS2783 user_id specified more than once in spread
// The issue is: {user_id: userId, ...record} and record also has user_id
// Fix: move user_id after the spread
let pat = fs.readFileSync('src/services/PatientService.ts', 'utf8');
pat = pat.replace(
    `        patient_id: patientId,\r\n        user_id: userId,\r\n        ...record,`,
    `        patient_id: patientId,\r\n        ...record,\r\n        user_id: userId,`
);
pat = pat.replace(
    `        patient_id: patientId,\n        user_id: userId,\n        ...record,`,
    `        patient_id: patientId,\n        ...record,\n        user_id: userId,`
);
fs.writeFileSync('src/services/PatientService.ts', pat);

// 4. PatientService TS2322: publicUrl is null, not string
// Fix the mapDbPatient to coerce string properly
pat = fs.readFileSync('src/services/PatientService.ts', 'utf8');
pat = pat.replace(
    'publicUrl = data.publicUrl;',
    'publicUrl = data.publicUrl ?? null;'
);
fs.writeFileSync('src/services/PatientService.ts', pat);

console.log('All fixes applied.');
