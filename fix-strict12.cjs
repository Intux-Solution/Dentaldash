const fs = require('fs');

// InsurancesTab: fix untyped props
let ins = fs.readFileSync('src/components/settings/InsurancesTab.tsx', 'utf8');
// add typing to any function components with { ... } destructure params
ins = ins.replace(/const \w+ = \(([\w, ]+)\) => \{/, (match, params) => {
    return match; // We'll do targeted replacements below
});
// Get the export default function signature
ins = ins.replace(
    /export default function (\w+)\(\{ ([^}]+) \}\) \{/,
    (match, name, paramStr) => `export default function ${name}({ ${paramStr} }: { [key: string]: any }) {`
);
// Type internal function params
ins = ins.replace(/const (\w+) = \(\{ ([^}]+) \}\) => \(/g,
    (match, name, params) => `const ${name} = ({ ${params} }: { [key: string]: any }) => (`
);
ins = ins.replace(/const (\w+) = \(\{ ([^}]+) \}\) => \{/g,
    (match, name, params) => `const ${name} = ({ ${params} }: { [key: string]: any }) => {`
);
fs.writeFileSync('src/components/settings/InsurancesTab.tsx', ins);

// ServicesTab: same approach
let svc = fs.readFileSync('src/components/settings/ServicesTab.tsx', 'utf8');
svc = svc.replace(
    /export default function (\w+)\(\{ ([^}]+) \}\) \{/,
    (match, name, paramStr) => `export default function ${name}({ ${paramStr} }: { [key: string]: any }) {`
);
svc = svc.replace(/const (\w+) = \(\{ ([^}]+) \}\) => \(/g,
    (match, name, params) => `const ${name} = ({ ${params} }: { [key: string]: any }) => (`
);
svc = svc.replace(/const (\w+) = \(\{ ([^}]+) \}\) => \{/g,
    (match, name, params) => `const ${name} = ({ ${params} }: { [key: string]: any }) => {`
);
fs.writeFileSync('src/components/settings/ServicesTab.tsx', svc);

// useNormalizedPatients: fix param types
let nnp = fs.readFileSync('src/hooks/useNormalizedPatients.ts', 'utf8');
// Find and type any untyped params
nnp = nnp.replace(/\.map\(p =>/g, '.map((p: any) =>');
nnp = nnp.replace(/\.filter\(p =>/g, '.filter((p: any) =>');
nnp = nnp.replace(/fieldNames\.some\(k =>/g, 'fieldNames.some((k: string) =>');
fs.writeFileSync('src/hooks/useNormalizedPatients.ts', nnp);

console.log('Done.');
