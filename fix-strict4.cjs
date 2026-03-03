const fs = require('fs');

// 1. GoogleCalendarService.ts: cachedToken null -> string | null explicit type
let gcal = fs.readFileSync('src/services/GoogleCalendarService.ts', 'utf8');
gcal = gcal.replace(
    'let cachedToken = null;',
    'let cachedToken: string | null = null;'
);
// Also type the untyped session params
gcal = gcal
    .replace('static getProviderToken(session) {', 'static getProviderToken(session: any) {')
    .replace('static getRefreshToken(session) {', 'static getRefreshToken(session: any) {')
    .replace('static async refreshGoogleToken(session) {', 'static async refreshGoogleToken(session: any) {');
fs.writeFileSync('src/services/GoogleCalendarService.ts', gcal);

// 2. Header.tsx: userData.avatar type mismatch: null vs string
// Fix by typing the state properly
let header = fs.readFileSync('src/components/Header.tsx', 'utf8');
header = header.replace(
    "const [userData, setUserData] = useState({",
    "const [userData, setUserData] = useState<{ name: string; avatar: string | null; email: string; role: string }>({",
);
fs.writeFileSync('src/components/Header.tsx', header);

// 3. PatientService.ts: user_id null in insert
let patSvc = fs.readFileSync('src/services/PatientService.ts', 'utf8');
// Already changed to ?? undefined but it still fails, change to || undefined
patSvc = patSvc.replace('user_id: userId ?? undefined,', 'user_id: userId || undefined,');
fs.writeFileSync('src/services/PatientService.ts', patSvc);

console.log('Done.');
