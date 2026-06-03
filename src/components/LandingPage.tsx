import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users2, CalendarCheck, MessageCircle, Activity,
  Download, Shield, Check, Loader2, ChevronRight,
  ArrowRight, Menu, X,
} from 'lucide-react';
import { fetchPublicPlans, createCheckout, SubscriptionPlan } from '../services/SubscriptionService';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

// ─── Tooth SVG logo ────────────────────────────────────────────────────────────
const ToothSVG = ({ size = 24, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M12 2C9.5 2 7.5 3.5 6 3.5C4 3.5 3 2.5 3 2.5S2 5 2.5 8C3 11 4 13 5 14.5C5.5 15.5 6 19 6.5 21C7 22.5 8 22.5 8.5 21.5C9 20.5 9.5 18 10 17C10.5 16 11 16 12 16C13 16 13.5 16 14 17C14.5 18 15 20.5 15.5 21.5C16 22.5 17 22.5 17.5 21C18 19 18.5 15.5 19 14.5C20 13 21 11 21.5 8C22 5 21 2.5 21 2.5S20 3.5 18 3.5C16.5 3.5 14.5 2 12 2Z"
      fill="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ─── Dashboard illustration SVG ────────────────────────────────────────────────
const DashboardIllustration = () => (
  <svg viewBox="0 0 480 340" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-xl">
    {/* Drop shadow */}
    <filter id="shadow">
      <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="#0d9488" floodOpacity="0.12" />
    </filter>
    {/* Browser window */}
    <rect x="24" y="16" width="432" height="308" rx="14" fill="white" stroke="#e2e8f0" strokeWidth="1.5" filter="url(#shadow)" />
    {/* Title bar */}
    <rect x="24" y="16" width="432" height="36" rx="14" fill="#f8fafc" />
    <rect x="24" y="36" width="432" height="16" fill="#f8fafc" />
    <circle cx="50" cy="34" r="5.5" fill="#fca5a5" />
    <circle cx="68" cy="34" r="5.5" fill="#fde68a" />
    <circle cx="86" cy="34" r="5.5" fill="#86efac" />
    <rect x="108" y="28" width="180" height="12" rx="6" fill="#e2e8f0" />
    {/* Sidebar */}
    <rect x="24" y="52" width="76" height="272" fill="#f0fdfa" />
    <rect x="34" y="72" width="56" height="8" rx="4" fill="#99f6e4" />
    <rect x="34" y="92" width="56" height="8" rx="4" fill="#0d9488" />
    <rect x="34" y="112" width="56" height="8" rx="4" fill="#ccfbf1" />
    <rect x="34" y="132" width="56" height="8" rx="4" fill="#ccfbf1" />
    <rect x="34" y="152" width="56" height="8" rx="4" fill="#ccfbf1" />
    <rect x="34" y="172" width="56" height="8" rx="4" fill="#ccfbf1" />
    {/* Main content area */}
    {/* Stats row */}
    <rect x="112" y="64" width="96" height="56" rx="8" fill="#f0fdfa" stroke="#99f6e4" strokeWidth="1" />
    <rect x="120" y="74" width="48" height="6" rx="3" fill="#0d9488" opacity="0.6" />
    <rect x="120" y="86" width="36" height="10" rx="4" fill="#0d9488" />
    <rect x="120" y="102" width="52" height="5" rx="2.5" fill="#99f6e4" />

    <rect x="218" y="64" width="96" height="56" rx="8" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="1" />
    <rect x="226" y="74" width="48" height="6" rx="3" fill="#3b82f6" opacity="0.6" />
    <rect x="226" y="86" width="36" height="10" rx="4" fill="#3b82f6" />
    <rect x="226" y="102" width="52" height="5" rx="2.5" fill="#bfdbfe" />

    <rect x="324" y="64" width="108" height="56" rx="8" fill="#fefce8" stroke="#fde68a" strokeWidth="1" />
    <rect x="332" y="74" width="48" height="6" rx="3" fill="#ca8a04" opacity="0.6" />
    <rect x="332" y="86" width="36" height="10" rx="4" fill="#ca8a04" />
    <rect x="332" y="102" width="52" height="5" rx="2.5" fill="#fde68a" />

    {/* Calendar */}
    <rect x="112" y="132" width="180" height="180" rx="10" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
    <rect x="112" y="132" width="180" height="32" rx="10" fill="#f0fdfa" />
    <rect x="112" y="150" width="180" height="14" fill="#f0fdfa" />
    <rect x="124" y="140" width="60" height="8" rx="4" fill="#0d9488" opacity="0.7" />
    <rect x="264" y="140" width="16" height="8" rx="4" fill="#99f6e4" />
    {/* Calendar days header */}
    {[0,1,2,3,4,5,6].map(i => (
      <rect key={i} x={122 + i * 24} y="172" width="16" height="6" rx="3" fill="#cbd5e1" />
    ))}
    {/* Calendar cells */}
    {[0,1,2,3,4,5,6,7,8,9,10,11,12,13,15,16,17,18,19,20].map((i) => {
      const col = i % 7;
      const row = Math.floor(i / 7);
      const isBooked = [2, 5, 9, 12, 17].includes(i);
      const isToday = i === 7;
      return (
        <rect
          key={i}
          x={122 + col * 24}
          y={186 + row * 28}
          width="18"
          height="18"
          rx="5"
          fill={isToday ? '#0d9488' : isBooked ? '#ccfbf1' : '#f8fafc'}
          stroke={isBooked && !isToday ? '#99f6e4' : 'none'}
          strokeWidth="1"
        />
      );
    })}

    {/* Patient list */}
    <rect x="304" y="132" width="132" height="180" rx="10" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
    <rect x="316" y="144" width="60" height="7" rx="3.5" fill="#64748b" />
    {[0,1,2,3,4].map(i => (
      <g key={i}>
        <circle cx="326" cy={170 + i * 28} r="10" fill={['#ccfbf1','#dbeafe','#fce7f3','#fef9c3','#e0f2fe'][i]} />
        <rect x="342" y={163 + i * 28} width="60" height="6" rx="3" fill="#94a3b8" />
        <rect x="342" y={174 + i * 28} width="36" height="5" rx="2.5" fill="#cbd5e1" />
      </g>
    ))}

    {/* Tooth icon bottom left */}
    <rect x="24" y="280" width="76" height="44" fill="#ccfbf1" opacity="0.5" />
    <text x="62" y="308" textAnchor="middle" fontSize="22" fill="#0d9488">🦷</text>
  </svg>
);

// ─── Features data ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Users2,
    title: 'Gestión de pacientes',
    desc: 'Historial clínico, odontograma, consentimientos y archivos en un solo lugar.',
    color: 'bg-teal-50 text-teal-600',
  },
  {
    icon: CalendarCheck,
    title: 'Agenda inteligente',
    desc: 'Turnos con slots automáticos y sincronización con Google Calendar.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: MessageCircle,
    title: 'Chatbot WhatsApp',
    desc: 'Bot con IA que responde consultas y agenda turnos 24/7 sin intervención.',
    color: 'bg-green-50 text-green-600',
  },
  {
    icon: Activity,
    title: 'Odontograma interactivo',
    desc: 'Mapa dental SVG con historial completo de tratamientos por pieza.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: Download,
    title: 'Exportación de datos',
    desc: 'Reportes en CSV y PDF de pacientes y turnos cuando los necesitás.',
    color: 'bg-amber-50 text-amber-600',
  },
  {
    icon: Shield,
    title: 'Seguridad multitenant',
    desc: 'Datos de cada consultorio completamente aislados con RLS en PostgreSQL.',
    color: 'bg-rose-50 text-rose-600',
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Registrate con Google',
    desc: 'Un clic y tu consultorio ya tiene acceso. Sin formularios, sin contraseñas.',
  },
  {
    n: '2',
    title: 'Configurá tu consultorio',
    desc: 'Horarios, servicios, obras sociales y chatbot de WhatsApp en minutos.',
  },
  {
    n: '3',
    title: 'Gestioná todo desde un lugar',
    desc: 'Pacientes, turnos, odontogramas e historial clínico centralizado.',
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  // Navbar scroll shadow
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Load plans
  useEffect(() => {
    fetchPublicPlans()
      .then(setPlans)
      .catch(() => toast.error('Error al cargar los planes'))
      .finally(() => setPlansLoading(false));
  }, []);

  const handleContrat = async (plan: SubscriptionPlan) => {
    if (!session) {
      navigate('/login');
      return;
    }
    if (plan.price_monthly === 0) {
      navigate('/');
      return;
    }
    try {
      setCheckoutLoading(plan.id);
      const { init_point } = await createCheckout(plan.id);
      window.location.href = init_point;
    } catch (err: any) {
      toast.error(err.message ?? 'Error al iniciar el pago');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white font-sans antialiased">

      {/* ── NAVBAR ──────────────────────────────────────────────────────────── */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-200 ${
          scrolled ? 'bg-white/95 backdrop-blur shadow-sm' : 'bg-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-bold text-xl text-gray-900">
            <ToothSVG size={26} className="text-teal-600" />
            <span>DentalDash</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <button onClick={() => scrollTo('features')} className="hover:text-teal-600 transition-colors">Funcionalidades</button>
            <button onClick={() => scrollTo('como-funciona')} className="hover:text-teal-600 transition-colors">Cómo funciona</button>
            <button onClick={() => scrollTo('precios')} className="hover:text-teal-600 transition-colors">Precios</button>
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-semibold text-gray-700 hover:text-teal-600 transition-colors px-3 py-2"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/pricing"
              className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl transition-colors"
            >
              Ver planes
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-gray-600 hover:text-teal-600 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menú"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-5 py-4 flex flex-col gap-4">
            <button onClick={() => scrollTo('features')} className="text-left text-sm font-medium text-gray-700 hover:text-teal-600">Funcionalidades</button>
            <button onClick={() => scrollTo('como-funciona')} className="text-left text-sm font-medium text-gray-700 hover:text-teal-600">Cómo funciona</button>
            <button onClick={() => scrollTo('precios')} className="text-left text-sm font-medium text-gray-700 hover:text-teal-600">Precios</button>
            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <Link to="/login" className="flex-1 text-center text-sm font-semibold text-gray-700 border border-gray-200 rounded-xl py-2.5 hover:border-teal-400 transition-colors" onClick={() => setMenuOpen(false)}>
                Iniciar sesión
              </Link>
              <Link to="/pricing" className="flex-1 text-center text-sm font-semibold bg-teal-600 text-white rounded-xl py-2.5 hover:bg-teal-700 transition-colors" onClick={() => setMenuOpen(false)}>
                Ver planes
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 overflow-hidden bg-gradient-to-b from-teal-50 via-white to-white">
        {/* Dot grid background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #99f6e4 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            opacity: 0.45,
          }}
        />
        <div className="relative max-w-6xl mx-auto px-5 grid lg:grid-cols-2 gap-12 items-center">
          {/* Copy */}
          <div>
            <div className="inline-flex items-center gap-2 bg-teal-100 text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-5 uppercase tracking-wide">
              Sistema de gestión odontológica
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-[1.1] tracking-tight mb-5">
              Tu consultorio,<br />
              <span className="text-teal-600">todo en un lugar.</span>
            </h1>
            <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-md">
              DentalDash centraliza pacientes, turnos, odontogramas y mucho más.
              Empezá gratis, crecé sin límites.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm shadow-md shadow-teal-100"
              >
                Comenzar gratis
                <ArrowRight size={15} />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-teal-400 text-gray-700 font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
              >
                Iniciar sesión
                <ChevronRight size={15} />
              </Link>
            </div>
            {/* Social proof */}
            <p className="mt-6 text-xs text-gray-400">
              Prueba gratuita de 14 días &bull; Sin tarjeta de crédito &bull; Cancelá cuando quieras
            </p>
          </div>

          {/* Illustration */}
          <div className="relative hidden lg:block">
            <div className="absolute -inset-6 bg-teal-50 rounded-3xl opacity-60" />
            <div className="relative">
              <DashboardIllustration />
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-white border border-gray-200 text-teal-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-4 uppercase tracking-wide shadow-sm">
              Funcionalidades
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
              Todo lo que necesitás para<br className="hidden sm:block" /> gestionar tu consultorio
            </h2>
            <p className="mt-4 text-gray-500 max-w-lg mx-auto">
              Diseñado específicamente para odontólogos que quieren dejar de perder tiempo con herramientas genéricas.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => (
              <div
                key={title}
                className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${color} mb-4`}>
                  <Icon size={20} />
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ───────────────────────────────────────────────────── */}
      <section id="como-funciona" className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4 uppercase tracking-wide">
              Cómo funciona
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
              Listo para usar en minutos
            </h2>
            <p className="mt-4 text-gray-500 max-w-md mx-auto">
              Sin instalaciones, sin configuraciones complejas. Solo con tu cuenta de Google.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-0.5 bg-gradient-to-r from-teal-200 via-teal-300 to-teal-200" />

            {STEPS.map((step, i) => (
              <div key={i} className="relative flex flex-col items-center text-center px-6 py-4">
                <div className="relative z-10 w-20 h-20 rounded-2xl bg-teal-600 text-white flex flex-col items-center justify-center mb-5 shadow-lg shadow-teal-100">
                  <span className="text-xs font-semibold opacity-70 leading-none">PASO</span>
                  <span className="text-3xl font-extrabold leading-tight">{step.n}</span>
                </div>
                <h3 className="font-bold text-gray-900 text-base mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed max-w-[200px]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────────────── */}
      <section id="precios" className="py-24 bg-gradient-to-b from-teal-50 to-white">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-white border border-teal-100 text-teal-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-4 uppercase tracking-wide shadow-sm">
              Planes y precios
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
              Elegí el plan para tu consultorio
            </h2>
            <p className="mt-4 text-gray-500 max-w-lg mx-auto">
              Comenzá con la prueba gratuita. Actualizá cuando estés listo.
            </p>
          </div>

          {plansLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-teal-600" size={32} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start max-w-5xl mx-auto">
                {plans
                  .filter((p) => p.name !== 'Trial')
                  .concat(plans.filter((p) => p.name === 'Trial'))
                  .map((plan) => {
                    const isPro = plan.name === 'Pro';
                    const isBusy = checkoutLoading === plan.id;
                    return (
                      <div
                        key={plan.id}
                        className={`relative rounded-2xl p-6 border flex flex-col gap-5 transition-shadow ${
                          isPro
                            ? 'border-teal-500 shadow-xl bg-white ring-2 ring-teal-500'
                            : 'border-gray-200 bg-white shadow-sm hover:shadow-md'
                        }`}
                      >
                        {isPro && (
                          <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-teal-600 text-white text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                            Más popular
                          </span>
                        )}
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                          <p className="text-gray-500 text-sm mt-1">{plan.description}</p>
                        </div>
                        <div>
                          {plan.price_monthly === 0 ? (
                            <p className="text-3xl font-bold text-gray-900">Gratis</p>
                          ) : (
                            <>
                              <p className="text-3xl font-bold text-gray-900">
                                ${plan.price_monthly.toLocaleString('es-AR')}
                                <span className="text-base font-normal text-gray-400"> ARS/mes</span>
                              </p>
                              {plan.price_yearly && (
                                <p className="text-xs text-teal-600 mt-1">
                                  o ${plan.price_yearly.toLocaleString('es-AR')} ARS/año (ahorrás 2 meses)
                                </p>
                              )}
                            </>
                          )}
                        </div>
                        <ul className="space-y-2 flex-1">
                          {(plan.features as string[]).map((f, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                              <Check size={15} className="text-teal-500 mt-0.5 shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                        <button
                          onClick={() => handleContrat(plan)}
                          disabled={isBusy}
                          className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 ${
                            isPro
                              ? 'bg-teal-600 hover:bg-teal-700 text-white'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                          }`}
                        >
                          {isBusy && <Loader2 size={15} className="animate-spin" />}
                          {plan.price_monthly === 0 ? 'Comenzar prueba gratis' : 'Contratar plan'}
                        </button>
                      </div>
                    );
                  })}
              </div>
              <p className="text-center mt-8 text-xs text-gray-400">
                Los pagos se procesan de forma segura a través de MercadoPago. Podés cancelar en cualquier momento.
              </p>
            </>
          )}
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-5 py-12">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 font-bold text-lg mb-2">
                <ToothSVG size={22} className="text-teal-400" />
                <span>DentalDash</span>
              </div>
              <p className="text-gray-400 text-sm max-w-xs">
                Sistema de gestión odontológica SaaS para consultorios modernos.
              </p>
            </div>
            {/* Links */}
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Legal</p>
              <Link to="/privacy" className="text-gray-400 hover:text-white transition-colors">Política de Privacidad</Link>
              <Link to="/terms" className="text-gray-400 hover:text-white transition-colors">Condiciones del Servicio</Link>
            </div>
            {/* Auth CTA */}
            <div className="flex flex-col gap-3">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Empezá ahora</p>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                Ver planes <ArrowRight size={14} />
              </Link>
              <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors text-center">
                Ya tengo cuenta →
              </Link>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-gray-500">
            <span>Dental Dash &copy; 2026. Todos los derechos reservados.</span>
            <span>
              Powered by{' '}
              <a href="https://chilldigital.agency" target="_blank" rel="noreferrer" className="hover:text-teal-400 transition-colors">
                ChillDigital
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
