const fs = require('fs');

// StatsCard: type props
let sc = fs.readFileSync('src/components/StatsCard.tsx', 'utf8');
sc = sc.replace(
    'export default function StatsCard({ title, value, color }) {',
    'export default function StatsCard({ title, value, color }: { title: string; value: string | number; color: string }) {'
);
fs.writeFileSync('src/components/StatsCard.tsx', sc);

// ServicesTab: type handleRemove param and filter callback
let svc = fs.readFileSync('src/components/settings/ServicesTab.tsx', 'utf8');
svc = svc.replace(
    'const handleRemove = async (index) => {',
    'const handleRemove = async (index: number) => {'
);
svc = svc.replace(
    '.filter((_, idx) => idx !== index)',
    '.filter((_: any, idx: number) => idx !== index)'
);
// Also type map callbacks if any
svc = svc.replace(
    '(profile.services || []).map((service, i) => (',
    '(profile.services || []).map((service: any, i: number) => ('
);
fs.writeFileSync('src/components/settings/ServicesTab.tsx', svc);

// InsurancesTab: type the map callback
let ins = fs.readFileSync('src/components/settings/InsurancesTab.tsx', 'utf8');
ins = ins.replace(
    '(profile.accepted_insurances || []).map((ins, i) => (',
    '(profile.accepted_insurances || []).map((ins: string, i: number) => ('
);
fs.writeFileSync('src/components/settings/InsurancesTab.tsx', ins);

console.log('Done.');
