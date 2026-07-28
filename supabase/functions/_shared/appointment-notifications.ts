// Notificaciones por email al agendar un turno.
//
// Se dispara desde los tres origenes posibles de alta: el link publico de reservas
// (`public-booking`), el bot de WhatsApp (`chat-webhook`) y la app del dentista
// (via la Edge Function `notify-appointment`). Hasta ahora solo el bot avisaba, y
// solo al dentista por WhatsApp.
//
// Nada de lo que hay aca puede hacer fallar la creacion del turno: todos los caminos
// devuelven un resultado, ninguno lanza.

import { renderEmailLayout, sendEmail } from "./email.ts";

const AR_TIMEZONE = "America/Argentina/Buenos_Aires";

export interface NotifyResult {
  patient: string;
  dentist: string;
}

/** Fecha larga en hora argentina, ej: "miércoles 5 de agosto de 2026". */
function formatDateAR(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: AR_TIMEZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Hora "HH:mm" en hora argentina. */
function formatTimeAR(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: AR_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Avisa por email al paciente y al dentista de un turno recien creado.
 *
 * Requiere un cliente con service role: lee `profiles`, `patients` y el email del
 * dentista desde `auth.users`.
 */
export async function notifyAppointmentCreated(
  supabase: any,
  appointmentId: string,
): Promise<NotifyResult> {
  const result: NotifyResult = { patient: "skipped", dentist: "skipped" };

  try {
    const { data: appointment } = await supabase
      .from("appointments")
      .select("id, user_id, title, appointment_type, start_time, end_time, notes, patient_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (!appointment) {
      console.error("notifyAppointmentCreated: turno no encontrado", appointmentId);
      return result;
    }

    const [{ data: profile }, { data: patient }] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, business_name, contact_phone")
        .eq("id", appointment.user_id)
        .maybeSingle(),
      appointment.patient_id
        ? supabase
            .from("patients")
            .select("nombre, email, telefono")
            .eq("id", appointment.patient_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const consultorio = profile?.business_name || profile?.full_name || "tu consultorio";
    const profesional = profile?.full_name || consultorio;
    const fecha = formatDateAR(appointment.start_time);
    const hora = formatTimeAR(appointment.start_time);
    const servicio = appointment.appointment_type || "Consulta";

    // ── Paciente ────────────────────────────────────────────────────────────
    // `patients.email` es opcional: si no lo cargaron, simplemente no se envia.
    if (patient?.email) {
      const html = renderEmailLayout({
        heading: "Tu turno está confirmado",
        intro: `Hola ${patient.nombre ?? ""}, reservamos tu turno en ${consultorio}.`,
        rows: [
          { label: "Profesional", value: profesional },
          { label: "Servicio", value: servicio },
          { label: "Fecha", value: fecha },
          { label: "Hora", value: hora },
          { label: "Teléfono del consultorio", value: profile?.contact_phone ?? "" },
        ],
        footer: "Si no podés asistir, avisanos con anticipación para liberar el horario.",
      });

      const sent = await sendEmail({
        to: patient.email,
        subject: `Turno confirmado — ${fecha} a las ${hora}`,
        html,
      });
      result.patient = sent.sent ? "sent" : sent.reason;
      if (!sent.sent && sent.reason === "api_error") {
        console.error("Error enviando email al paciente:", sent.detail);
      }
    }

    // ── Dentista ────────────────────────────────────────────────────────────
    const { data: authUser } = await supabase.auth.admin.getUserById(appointment.user_id);
    const dentistEmail = authUser?.user?.email;

    if (dentistEmail) {
      const html = renderEmailLayout({
        heading: "Nuevo turno agendado",
        intro: `Se agendó un turno nuevo en ${consultorio}.`,
        rows: [
          { label: "Paciente", value: patient?.nombre ?? "Sin nombre" },
          { label: "Teléfono", value: patient?.telefono ?? "" },
          { label: "Email", value: patient?.email ?? "" },
          { label: "Servicio", value: servicio },
          { label: "Fecha", value: fecha },
          { label: "Hora", value: hora },
          { label: "Notas", value: appointment.notes ?? "" },
        ],
      });

      const sent = await sendEmail({
        to: dentistEmail,
        subject: `Nuevo turno: ${patient?.nombre ?? "Paciente"} — ${fecha} ${hora}`,
        html,
      });
      result.dentist = sent.sent ? "sent" : sent.reason;
      if (!sent.sent && sent.reason === "api_error") {
        console.error("Error enviando email al dentista:", sent.detail);
      }
    }
  } catch (err) {
    // Una notificacion fallida jamas debe propagarse: el turno ya existe.
    console.error("notifyAppointmentCreated error:", err);
  }

  return result;
}
