const fs = require('fs');

// ProfileTab.tsx: TS2322 imgSrc = avatarPreview || googleAvatar is string | null 
// but img src expects string | undefined
let pt = fs.readFileSync('src/components/settings/ProfileTab.tsx', 'utf8');

// Fix: coerce null to undefined for img src attribute
pt = pt.replace(
    'src={avatarPreview || googleAvatar}',
    'src={(avatarPreview || googleAvatar) ?? undefined}'
);

fs.writeFileSync('src/components/settings/ProfileTab.tsx', pt);
console.log('Done.');
