const fs = require('fs');

let file = fs.readFileSync('src/components/InsuranceAutocomplete.tsx', 'utf8');
file = file.replace(
    "import { PatientService } from '../services/PatientService';",
    "import { InsuranceService } from '../services/InsuranceService';"
);
file = file.replace(
    'await PatientService.getAllUniqueInsurances()',
    'await InsuranceService.getAllUniqueInsurances()'
);
fs.writeFileSync('src/components/InsuranceAutocomplete.tsx', file);
console.log('InsuranceAutocomplete updated.');
