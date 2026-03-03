const fs = require('fs');

// Fix Header.tsx
let header = fs.readFileSync('src/components/Header.tsx', 'utf8');
header = header.replace(
    '// src/components/Header.jsx ',
    '// src/components/Header.tsx '
);
header = header.replace(
    /export default function Header\(\{ title, setSidebarOpen, onLogout \}\) \{/,
    `interface HeaderProps {
  title: string;
  setSidebarOpen: (open: boolean) => void;
  onLogout: () => void;
}

export default function Header({ title, setSidebarOpen, onLogout }: HeaderProps) {`
);
fs.writeFileSync('src/components/Header.tsx', header);

// Fix PatientService: user_id null -> undefined (TS2783)
let patSvc = fs.readFileSync('src/services/PatientService.ts', 'utf8');
// The insert object has user_id: userId where userId could derive as null-able
// Turn it into user_id: userId || undefined to satisfy Supabase's typing
patSvc = patSvc.replace(
    'user_id: userId,',
    'user_id: userId ?? undefined,'
);
fs.writeFileSync('src/services/PatientService.ts', patSvc);

console.log('Fixed Header.tsx and PatientService.ts.');
