export class ExportService {
  // Prefija con comilla simple las celdas que Excel/Sheets interpretarían como
  // inicio de fórmula (CSV/Formula Injection). El prefijo desactiva la fórmula
  // sin alterar el valor visible al abrir el archivo. Necesario porque parte
  // de los datos exportados viene de terceros no confiables (booking público,
  // bot de WhatsApp).
  private static sanitizeCell(value: string): string {
    return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  }

  private static downloadCsv(filename: string, rows: string[][]): void {
    const csv = rows
      .map(r => r.map(cell => `"${this.sanitizeCell(String(cell ?? '')).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  static exportPatientsCSV(patients: any[]): void {
    const headers = [
      'Nombre', 'DNI', 'Teléfono', 'Email',
      'Obra Social', 'Nro Afiliado', 'Estado',
      'Fecha Nacimiento', 'Alergias', 'Antecedentes',
    ];
    const rows = patients.map(p => [
      p.nombre || p.name || '',
      p.dni || '',
      p.telefono || p.phone || '',
      p.email || '',
      p.obraSocial || p.obra_social || '',
      p.numeroAfiliado || p.numero_afiliado || '',
      p.estado || '',
      p.fechaNacimiento || p.fecha_nacimiento || '',
      Array.isArray(p.alergias) ? p.alergias.join('; ') : (p.alergias || ''),
      p.antecedentes || '',
    ]);
    const date = new Date().toISOString().slice(0, 10);
    this.downloadCsv(`pacientes_${date}.csv`, [headers, ...rows]);
  }

  static exportUsersCSV(users: any[]): void {
    const headers = [
      'Nombre', 'Email', 'Rol', 'Plan', 'Estado', 'Vencimiento', 'Fecha registro',
    ];
    const rows = users.map((u: any) => {
      const sub = u.subscriptions?.[0];
      return [
        u.full_name || '',
        u.email || '',
        u.role || '',
        sub?.subscription_plans?.name || '',
        sub?.status || '',
        sub?.current_period_end
          ? new Date(sub.current_period_end).toLocaleDateString('es-AR')
          : sub?.trial_ends_at
            ? new Date(sub.trial_ends_at).toLocaleDateString('es-AR')
            : '',
        u.created_at ? new Date(u.created_at).toLocaleDateString('es-AR') : '',
      ];
    });
    const date = new Date().toISOString().slice(0, 10);
    this.downloadCsv(`usuarios_${date}.csv`, [headers, ...rows]);
  }

  static exportAppointmentsCSV(events: any[]): void {
    const headers = [
      'Fecha', 'Hora Inicio', 'Hora Fin',
      'Tipo', 'Paciente', 'Estado', 'Notas',
    ];
    const rows = events.map(ev => {
      const start = new Date(ev.start || ev.start_time || '');
      const end = ev.end ? new Date(ev.end || ev.end_time) : null;
      return [
        isNaN(start.getTime()) ? '' : start.toLocaleDateString('es-AR'),
        isNaN(start.getTime()) ? '' : start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        end && !isNaN(end.getTime()) ? end.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '',
        ev.tipoTurno || ev.appointment_type || ev.title || '',
        ev.patientName || ev.paciente || '',
        ev.status || '',
        ev.notes || '',
      ];
    });
    const date = new Date().toISOString().slice(0, 10);
    this.downloadCsv(`turnos_${date}.csv`, [headers, ...rows]);
  }
}
