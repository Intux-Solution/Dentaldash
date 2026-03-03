const fs = require('fs');

// Fix PatientService.ts: val implicit any in filter
let patSvc = fs.readFileSync('src/services/PatientService.ts', 'utf8');
patSvc = patSvc.replace(
    '.filter((val): val is string => !!val && val.trim() !== \'\');',
    '.filter((val: unknown): val is string => typeof val === \'string\' && val.trim() !== \'\');'
);
fs.writeFileSync('src/services/PatientService.ts', patSvc);

// Fix AppointmentService.ts: TS2538 type used as index
// The issue is statusMap[validatedData.status] where status may be undefined
let apptSvc = fs.readFileSync('src/services/AppointmentService.ts', 'utf8');
// Replace only the problematic indexing line - add a fallback for undefined status
apptSvc = apptSvc.replace(
    "status: statusMap[validatedData.status] || 'confirmed'",
    "status: (validatedData.status ? statusMap[validatedData.status] : undefined) || 'confirmed'"
);
fs.writeFileSync('src/services/AppointmentService.ts', apptSvc);

console.log('Done.');
