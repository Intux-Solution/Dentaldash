const fs = require('fs');

// PatientService: fix with CRLF-aware replacement
let pat = fs.readFileSync('src/services/PatientService.ts', 'utf8');

// Find the old block using regex (handles both LF and CRLF)
const regex = /\.insert\(\[\{\r?\n\s+patient_id: patientId,\r?\n\s+\.\.\.record,\r?\n\s+user_id: userId,\r?\n\s+odontogram_state: record\.odontogram_state\r?\n\s+\? JSON\.stringify\(record\.odontogram_state\)\r?\n\s+: null,\r?\n\s+\}\]\)/;

const newBlock = `.insert([(() => {
        const { patient_id: _rp, user_id: _ru, odontogram_state, ...rest } = record as any;
        return {
          ...rest,
          patient_id: patientId,
          user_id: userId,
          odontogram_state: odontogram_state
            ? JSON.stringify(odontogram_state)
            : null,
        };
      })()])`;

if (regex.test(pat)) {
    pat = pat.replace(regex, newBlock);
    fs.writeFileSync('src/services/PatientService.ts', pat);
    console.log('PatientService insert block patched successfully.');
} else {
    console.log('Warning: regex did not match. Trying alternative...');
    // Just rewrite the addClinicalRecord method to fully avoid the issue
    const wholeMethod = /static async addClinicalRecord\([^{]+\): Promise<ClinicalRecord> {[\s\S]*?if \(error\) throw error;\s*return data;\s*}/;
    pat = pat.replace(wholeMethod, `static async addClinicalRecord(
    patientId: string,
    record: Omit<ClinicalRecord, 'id' | 'created_at'>,
    userId: string
  ): Promise<ClinicalRecord> {
    const insertPayload = {
      patient_id: patientId,
      user_id: userId,
      fecha: (record as any).fecha,
      diagnostico: (record as any).diagnostico,
      tratamiento: (record as any).tratamiento,
      archivo_url: (record as any).archivo_url,
      odontogram_state: record.odontogram_state
        ? JSON.stringify(record.odontogram_state)
        : null,
    };
    const { data, error } = await supabase
      .from('treatment_history')
      .insert([insertPayload])
      .select()
      .single();

    if (error) throw error;
    return data;
  }`);
    fs.writeFileSync('src/services/PatientService.ts', pat);
    console.log('PatientService addClinicalRecord rewritten.');
}
