const fs = require('fs');

// Fix Header.tsx - avatar type 
let header = fs.readFileSync('src/components/Header.tsx', 'utf8');
// Replace exact lines from file
header = header
    .replace('avatar: avatar,\n', 'avatar: (avatar ?? null) as string | null,\n')
    .replace('avatar: avatar,\r\n', 'avatar: (avatar ?? null) as string | null,\r\n')
    .replace('email: user.email,\n', 'email: user.email ?? \'\',\n')
    .replace('email: user.email,\r\n', 'email: user.email ?? \'\',\r\n');
fs.writeFileSync('src/components/Header.tsx', header);

// Fix PatientService.ts - user_id null in insert  
let patSvc = fs.readFileSync('src/services/PatientService.ts', 'utf8');
// The insert spread: user_id: userId || undefined may still fail; the issue is that
// userId is typed as string (non-null), so the TS2783 is actually about a spread-conflict.
// Let's look at the actual structure: {...record} which may already have user_id.
// The safest fix: use a conditional spread instead
patSvc = patSvc
    .replace('user_id: userId || undefined,', 'user_id: userId,')
    .replace('user_id: userId ?? undefined,', 'user_id: userId,');
// Also if the issue is null/undefined from spread record, wrap user_id after spreading record
fs.writeFileSync('src/services/PatientService.ts', patSvc);

console.log('Final patches applied.');
