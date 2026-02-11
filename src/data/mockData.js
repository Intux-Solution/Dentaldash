// src/data/mockData.js
export const initialPatients = [
  { id: 1, airtableId: 'rec001', nombre: "Benjamin Torres Lemos", obraSocial: "OSDE", telefono: "+54 381 612 3456", email: "benjamin@ejemplo.com", direccion: "Av. Siempre Viva 742, Tucumán", historiaClinica: "Abrir", ultimaVisita: "12/08/2025" },
  { id: 2, airtableId: 'rec002', nombre: "Agustin Corbalan", obraSocial: "Swiss Medical", telefono: "+54 11 3631 4341", email: "agustin@ejemplo.com", direccion: "CABA, Argentina", historiaClinica: "Abrir", ultimaVisita: "02/07/2025" },
  { id: 3, airtableId: 'rec003', nombre: "Esteban Alvarez Farhat", obraSocial: "Medicus", telefono: "+54 381 618 2736", email: "esteban@ejemplo.com", direccion: "San Miguel de Tucumán", historiaClinica: "Abrir", ultimaVisita: "24/02/2025" },
  { id: 4, airtableId: 'rec004', nombre: "Facundo Salado", obraSocial: "Medifé", telefono: "+54 381 692 7465", email: "facundo@ejemplo.com", direccion: "Yerba Buena", historiaClinica: "Abrir", ultimaVisita: "16/06/2025" }
];

export const mockData = {
  stats: { turnosHoy: 2, turnosSemana: 9, totalPacientes: 27 },
  proximosTurnos: [
    { fecha: "Viernes 22 de Agosto", hora: "15:00 hs", paciente: "Benjamin Torres Lemos", tipo: "Consulta General" },
    { fecha: "Viernes 22 de Agosto", hora: "15:30 hs", paciente: "Agustin Corbalan", tipo: "Arreglo de Caries" },
    { fecha: "Martes 26 de Agosto", hora: "10:45 hs", paciente: "Esteban Alvarez Farhat", tipo: "Extracción" }
  ]
};