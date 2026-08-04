import { KeyRound, SlidersHorizontal, Users, CalendarDays, type LucideIcon } from 'lucide-react';

/**
 * Contenido de la sección de Ayuda y del tour de bienvenida.
 *
 * El texto y las capturas provienen de los manuales de `Manuales/*.docx`; las
 * imágenes se extrajeron a `public/ayuda/<guia>/NN.png` respetando el orden de
 * aparición en el documento. Van en `public/` a propósito: no entran al bundle
 * de Vite y se cargan bajo demanda con `loading="lazy"`.
 *
 * Para agregar o reordenar contenido, editar únicamente este archivo: las
 * vistas (`HelpView`, `WelcomeTour`) son genéricas.
 */

export interface HelpStep {
    title: string;
    /** Párrafos del paso. */
    body: string[];
    /** Rutas absolutas de capturas, ej. '/ayuda/configuracion/01.png'. */
    images?: string[];
    /** Aviso destacado al pie del paso. */
    note?: string;
    /** Deep-link a la configuración relacionada, ej. '/configuracion?tab=services'. */
    link?: { label: string; to: string };
    /**
     * Feature key requerida para que el paso tenga sentido. Si el plan del
     * usuario no la incluye, el paso se omite del tour y del checklist.
     */
    featureKey?: string;
}

export type HelpGuideId = 'acceso' | 'configuracion' | 'pacientes' | 'turnos';

export interface HelpGuide {
    id: HelpGuideId;
    title: string;
    summary: string;
    icon: LucideIcon;
    steps: HelpStep[];
}

/** Pasos de la puesta en marcha; son también la base del tour de bienvenida. */
const CONFIGURACION_STEPS: HelpStep[] = [
    {
        title: 'Configurá tu perfil',
        body: [
            'En Configuración → Perfil podés cargar tu foto, tu nombre profesional y el teléfono de contacto.',
            'El teléfono es el que usa el chatbot cuando necesita derivar una consulta a una persona, así que conviene que sea uno que atiendas.',
        ],
        images: ['/ayuda/configuracion/01.png'],
        link: { label: 'Ir a Perfil', to: '/configuracion?tab=profile' },
    },
    {
        title: 'Cargá tus obras sociales',
        body: [
            'En Obras Sociales agregá todas las que aceptás: escribí el nombre y hacé clic en “Agregar”.',
            'Son las únicas que vas a poder elegir después al crear un paciente o un turno, así que conviene cargarlas todas de una.',
        ],
        images: ['/ayuda/configuracion/02.png'],
        link: { label: 'Ir a Obras Sociales', to: '/configuracion?tab=insurances' },
        featureKey: 'insurance_management',
    },
    {
        title: 'Definí tus tratamientos',
        body: [
            'En Servicios cargá cada tratamiento que ofrecés con su duración: escribí el nombre, poné los minutos y hacé clic en el botón verde “+”.',
            'La duración es la que determina cuánto ocupa el turno en la agenda, así que vale la pena ser realista con los tiempos.',
        ],
        images: ['/ayuda/configuracion/03.png'],
        link: { label: 'Ir a Servicios', to: '/configuracion?tab=services' },
        featureKey: 'services_config',
    },
    {
        title: 'Establecé tus horarios de atención',
        body: [
            'En Horarios definí los bloques de atención para cada día de la semana.',
            'En los días que no atendés, borrá los bloques predeterminados: si quedan cargados, la plataforma va a ofrecer turnos esos días.',
        ],
        images: ['/ayuda/configuracion/04.png'],
        link: { label: 'Ir a Horarios', to: '/configuracion?tab=schedule' },
    },
    {
        title: 'Conectá WhatsApp',
        body: [
            'Desde WhatsApp hacé clic en “Conectar WhatsApp” y escaneá el código QR que aparece en pantalla.',
            'Importante: conectá la línea del consultorio, no tu WhatsApp personal. Es la que va a usar el chatbot para atender a los pacientes.',
        ],
        images: ['/ayuda/configuracion/05.png', '/ayuda/configuracion/06.png'],
        link: { label: 'Ir a WhatsApp', to: '/configuracion?tab=whatsapp' },
        featureKey: 'whatsapp_bot',
    },
    {
        title: 'Cargá tus preguntas frecuentes',
        body: [
            'Escribí las preguntas que te hacen siempre, con su respuesta, para que el chatbot pueda contestarlas solo.',
            'Por ejemplo: “¿Dónde se ubica el consultorio?” → “En San Martín 123, San Miguel de Tucumán.” Las podés editar o borrar cuando quieras.',
        ],
        images: ['/ayuda/configuracion/07.png', '/ayuda/configuracion/08.png'],
        link: { label: 'Ir a Preguntas Frecuentes', to: '/configuracion?tab=faqs' },
        featureKey: 'faqs_config',
    },
];

export const HELP_GUIDES: HelpGuide[] = [
    {
        id: 'configuracion',
        title: 'Configuración inicial',
        summary: 'Lo que hay que dejar listo antes de cargar el primer turno.',
        icon: SlidersHorizontal,
        steps: CONFIGURACION_STEPS,
    },
    {
        id: 'pacientes',
        title: 'Gestión de pacientes',
        summary: 'Crear, editar y eliminar pacientes, y usar el odontograma digital.',
        icon: Users,
        steps: [
            {
                title: 'Cómo crear un paciente',
                body: [
                    'Entrá a Pacientes y hacé clic en “Agregar”.',
                    'Se abre una ventana para cargar los datos completos: nombre, DNI, teléfono, email, obra social, N° de afiliado, alergias, antecedentes, historia clínica (podés adjuntar un PDF o una imagen), estado y notas. Cuando termines, hacé clic en “Crear”.',
                    'El paciente aparece en el listado, donde después lo vas a poder editar o eliminar.',
                ],
                images: [
                    '/ayuda/pacientes/01.png',
                    '/ayuda/pacientes/02.png',
                    '/ayuda/pacientes/03.png',
                    '/ayuda/pacientes/04.png',
                ],
                note: 'En “Obra Social” solo aparecen las que cargaste antes en Configuración.',
            },
            {
                title: 'Cómo editar un paciente',
                body: [
                    'Hacé clic en el nombre del paciente dentro del listado.',
                    'En la ventana que se abre, hacé clic en “Editar”, modificá los datos que necesites y guardá.',
                ],
                images: ['/ayuda/pacientes/05.png', '/ayuda/pacientes/06.png', '/ayuda/pacientes/07.png'],
            },
            {
                title: 'Cómo eliminar un paciente',
                body: [
                    'Hacé clic en el nombre del paciente dentro del listado y después en el botón “Eliminar”.',
                    'Confirmá la eliminación en la ventana siguiente.',
                ],
                images: ['/ayuda/pacientes/08.png', '/ayuda/pacientes/09.png', '/ayuda/pacientes/10.png'],
            },
            {
                title: 'Cómo trabajar con el odontograma digital',
                body: [
                    'Abrí el odontograma desde la opción correspondiente en el listado de pacientes.',
                    'Arriba vas a encontrar las herramientas disponibles para cada pieza: Caries, Tratado, Pendiente y Ausente. Elegí una y hacé clic sobre el sector de la pieza tratada o a tratar.',
                    'En “Evolución Clínica” podés detallar los tratamientos aplicados con más precisión.',
                ],
                images: ['/ayuda/pacientes/11.png', '/ayuda/pacientes/12.png', '/ayuda/pacientes/13.png'],
                note: 'Después de cada cambio, hacé clic en “Guardar Cambios”. Si salís sin guardar, se pierde.',
                featureKey: 'odontogram',
            },
        ],
    },
    {
        id: 'turnos',
        title: 'Gestión de turnos',
        summary: 'Agendar, modificar y cancelar turnos, con sincronización a Google Calendar.',
        icon: CalendarDays,
        steps: [
            {
                title: 'Cómo crear un turno',
                body: [
                    'Entrá a Turnos y hacé clic en “Nuevo Turno”.',
                    'Empezá por el DNI del paciente: si ya existe, el resto de los campos se completan solos. Si todavía no está cargado, completá todos los datos.',
                    'Elegí el tipo de turno, el día y el horario. Después confirmá con “Confirmar Turno”.',
                    'El turno queda sincronizado con tu Google Calendar y también lo vas a ver en el dashboard.',
                ],
                images: [
                    '/ayuda/turnos/01.png',
                    '/ayuda/turnos/02.png',
                    '/ayuda/turnos/03.png',
                    '/ayuda/turnos/04.png',
                    '/ayuda/turnos/05.png',
                    '/ayuda/turnos/06.png',
                    '/ayuda/turnos/07.png',
                    '/ayuda/turnos/08.png',
                    '/ayuda/turnos/09.png',
                ],
                note: 'Si el paciente no estaba cargado, se crea automáticamente al confirmar el turno. Los tipos de turno y los horarios disponibles salen de lo que configuraste en Configuración.',
            },
            {
                title: 'Cómo editar un turno',
                body: [
                    'Buscá el turno en la sección Turnos o en “Próximos Turnos” del dashboard, y hacé clic en el ícono del ojo.',
                    'En la ventana de detalles, hacé clic en “Editar Turno”, modificá lo que necesites y guardá los cambios.',
                ],
                images: [
                    '/ayuda/turnos/10.png',
                    '/ayuda/turnos/11.png',
                    '/ayuda/turnos/12.png',
                    '/ayuda/turnos/13.png',
                ],
            },
            {
                title: 'Cómo cancelar un turno',
                body: [
                    'Igual que para editar: buscá el turno y abrí sus detalles con el ícono del ojo.',
                    'Hacé clic en “Cancelar” y confirmá con “Cancelar Turno”.',
                ],
                images: [
                    '/ayuda/turnos/14.png',
                    '/ayuda/turnos/15.png',
                    '/ayuda/turnos/16.png',
                    '/ayuda/turnos/17.png',
                ],
            },
        ],
    },
    {
        id: 'acceso',
        title: 'Acceso a la plataforma',
        summary: 'Cómo iniciar sesión con Google y qué permisos hay que otorgar. Útil para compartir con un colega.',
        icon: KeyRound,
        steps: [
            {
                title: 'Iniciar sesión con Google',
                body: [
                    'Entrá a dentaldash.intux.solutions y hacé clic en “Continuar con Google”.',
                    'Elegí la cuenta de Google con la que vas a usar la plataforma.',
                ],
                images: ['/ayuda/acceso/01.png', '/ayuda/acceso/02.png'],
            },
            {
                title: 'La advertencia de Google',
                body: [
                    'Puede aparecer una pantalla que dice “Google no verificó esta app”. Es un mensaje normal mientras la plataforma está en fase de testeo.',
                    'Hacé clic en “Configuración avanzada” y después en “Ir a DentalDash” para continuar.',
                ],
                images: ['/ayuda/acceso/03.png', '/ayuda/acceso/04.png', '/ayuda/acceso/05.png'],
            },
            {
                title: 'Otorgar los permisos',
                body: [
                    'La plataforma necesita permisos sobre Google Drive y Google Calendar para la gestión diaria de turnos.',
                    'Hacé clic en “Seleccionar todos” y después en “Continuar”.',
                ],
                images: ['/ayuda/acceso/06.png', '/ayuda/acceso/07.png'],
                note: 'Sin el permiso de Calendar, los turnos no se sincronizan con tu calendario de Google.',
            },
            {
                title: 'Listo, ya estás adentro',
                body: [
                    'Vas a caer directo en el dashboard.',
                    'El paso siguiente es dejar configurado el consultorio: mirá la guía de Configuración inicial.',
                ],
                images: ['/ayuda/acceso/08.png', '/ayuda/acceso/09.png'],
            },
        ],
    },
];

/** Pasos que usa el tour de bienvenida del primer ingreso. */
export const TOUR_STEPS = CONFIGURACION_STEPS;

export const getGuide = (id: string | null): HelpGuide | undefined =>
    HELP_GUIDES.find((g) => g.id === id);
