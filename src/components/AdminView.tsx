import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { AdminService } from '../services/AdminService';
import { ExportService } from '../services/ExportService';
import { Users, CreditCard, LayoutList, CheckCircle, RefreshCw, Loader2, Plus, Pencil, Trash2, Download, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import PlanFormModal from './PlanFormModal';
import AdminMetrics from './AdminMetrics';
import TrialExpiringAlert from './TrialExpiringAlert';
import UserPermissionsModal from './UserPermissionsModal';
import UserDetailModal from './UserDetailModal';
import SearchInput from './SearchInput';

type Tab = 'usuarios' | 'planes' | 'pagos' | 'mensajes';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active: { label: 'Activa', color: 'text-green-600' },
  free: { label: 'Gratuito', color: 'text-teal-600' },
  trial: { label: 'Trial', color: 'text-blue-600' },
  past_due: { label: 'Pago fallido', color: 'text-amber-600' },
  cancelled: { label: 'Cancelada', color: 'text-red-600' },
};

// Estado real del pago segun MercadoPago (columna mp_status de payment_events)
const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  authorized: { label: 'Autorizado', color: 'bg-green-100 text-green-700' },
  charged: { label: 'Cobrado', color: 'bg-green-100 text-green-700' },
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
  paused: { label: 'Pausado', color: 'bg-amber-100 text-amber-700' },
  payment_failed: { label: 'Pago fallido', color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
};

export default function AdminView() {
  const [tab, setTab] = useState<Tab>('usuarios');
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);

  const [selectedPlans, setSelectedPlans] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [permissionsUser, setPermissionsUser] = useState<any | null>(null);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const detailUser = useMemo(
    () => users.find((u: any) => u.id === detailUserId) ?? null,
    [users, detailUserId]
  );

  const loadTab = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      if (t === 'usuarios') {
        const [userData, planData] = await Promise.all([
          AdminService.listUsers(),
          AdminService.listPlans(),
        ]);
        setUsers(userData);
        setPlans(planData);
      } else if (t === 'planes') {
        const data = await AdminService.listPlans();
        setPlans(data);
      } else if (t === 'mensajes') {
        const data = await AdminService.listSupportMessages();
        setMessages(data);
      } else {
        const data = await AdminService.listPaymentEvents();
        setEvents(data);
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter((u: any) => {
      const sub = u.subscriptions?.[0];
      return (
        (u.full_name ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (sub?.status ?? '').toLowerCase().includes(q)
      );
    });
  }, [users, searchQuery]);

  const handleExportUsers = () => {
    ExportService.exportUsersCSV(users);
  };

  const handleSyncPayments = async () => {
    setActionLoading('sync_payments');
    try {
      const res = await AdminService.backfillPaymentStatus();
      toast.success(`Estados sincronizados (${res?.updated ?? 0} actualizados)`);
      loadTab('pagos');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al sincronizar estados');
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenPermissions = (user: any) => {
    setPermissionsUser(user);
    setPermissionsModalOpen(true);
  };

  const handleToggleAdmin = async (userId: string, name: string, currentRole: string) => {
    const isAdmin = currentRole === 'admin';
    const msg = isAdmin ? `¿Quitar rol admin a ${name}?` : `¿Otorgar rol admin a ${name}?`;
    if (!confirm(msg)) return;
    setActionLoading(userId + '_admin');
    try {
      if (isAdmin) {
        await AdminService.removeAdmin(userId);
        toast.success(`${name} ya no es admin`);
      } else {
        await AdminService.addAdmin(userId);
        toast.success(`${name} ahora es admin`);
      }
      loadTab('usuarios');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGrantFree = async (userId: string, name: string) => {
    setActionLoading(userId + '_free');
    try {
      await AdminService.grantFreeAccess(userId);
      toast.success(`Acceso gratuito otorgado a ${name}`);
      loadTab('usuarios');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (userId: string, name: string) => {
    if (!confirm(`¿Cancelar la suscripción de ${name}?`)) return;
    setActionLoading(userId + '_cancel');
    try {
      await AdminService.cancelSubscription(userId);
      toast.success(`Suscripción de ${name} cancelada`);
      loadTab('usuarios');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    setActionLoading(userId + '_delete');
    try {
      await AdminService.deleteUser(userId);
      toast.success(`Usuario ${name} eliminado`);
      setDetailUserId(null);
      loadTab('usuarios');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreatePlan = () => {
    setEditingPlan(null);
    setPlanModalOpen(true);
  };

  const handleEditPlan = (plan: any) => {
    setEditingPlan(plan);
    setPlanModalOpen(true);
  };

  const handleDeletePlan = async (planId: string, planName: string) => {
    if (!confirm(`¿Eliminar permanentemente el plan "${planName}"? Esta acción no se puede deshacer.`)) return;
    setActionLoading(planId + '_delete');
    try {
      await AdminService.deletePlan(planId);
      toast.success(`Plan "${planName}" eliminado`);
      loadTab('planes');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAssignPlan = async (userId: string, name: string) => {
    const planId = selectedPlans[userId];
    if (!planId) return;
    setActionLoading(userId + '_assign');
    try {
      await AdminService.updateUserPlan(userId, planId);
      toast.success(`Plan asignado a ${name}`);
      loadTab('usuarios');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleTogglePlan = async (planId: string, current: boolean) => {
    setActionLoading(planId);
    try {
      await AdminService.togglePlan(planId, !current);
      toast.success(`Plan ${current ? 'desactivado' : 'activado'}`);
      loadTab('planes');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkRead = async (messageId: string) => {
    setActionLoading(`msg-${messageId}`);
    try {
      await AdminService.markSupportMessageRead(messageId);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: 'read', read_at: new Date().toISOString() } : m))
      );
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo marcar como leído');
    } finally {
      setActionLoading(null);
    }
  };

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'usuarios', label: 'Usuarios', icon: <Users size={16} /> },
    { key: 'planes', label: 'Planes', icon: <LayoutList size={16} /> },
    { key: 'pagos', label: 'Pagos', icon: <CreditCard size={16} /> },
    { key: 'mensajes', label: 'Mensajes', icon: <MessageSquare size={16} /> },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
        <button
          onClick={() => loadTab(tab)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-teal-600 transition-colors"
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-teal-600" size={28} />
        </div>
      ) : (
        <>
          {/* ── USUARIOS ── */}
          {tab === 'usuarios' && (
            <div>
              <AdminMetrics users={users} />
              <TrialExpiringAlert users={users} />
              <div className="flex items-center justify-between gap-3 mb-4">
                <SearchInput
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, email o estado..."
                />
                <button
                  onClick={handleExportUsers}
                  className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-teal-700 border border-gray-200 hover:border-teal-300 bg-white px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Download size={14} />
                  Exportar CSV
                </button>
              </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Nombre</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Rol</th>
                    <th className="px-4 py-3 text-left">Plan</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-left">Vencimiento</th>
                    <th className="px-4 py-3 text-left">Registro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredUsers.map((u: any) => {
                    const sub = u.subscriptions?.[0];
                    const statusCfg = STATUS_LABEL[sub?.status] ?? { label: 'Sin suscripción', color: 'text-gray-400' };
                    const periodEnd = sub?.current_period_end
                      ? new Date(sub.current_period_end).toLocaleDateString('es-AR')
                      : sub?.trial_ends_at
                        ? new Date(sub.trial_ends_at).toLocaleDateString('es-AR')
                        : '—';

                    return (
                      <tr
                        key={u.id}
                        onClick={() => setDetailUserId(u.id)}
                        className="hover:bg-teal-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-gray-800">{u.full_name ?? '(sin nombre)'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{u.email || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {sub?.subscription_plans?.name
                            ?? plans.find((p: any) => p.id === sub?.plan_id)?.name
                            ?? (sub?.status === 'free' ? 'Acceso Gratuito'
                              : sub?.status === 'trial' ? 'Trial'
                              : sub?.status ? sub.status
                              : '—')}
                        </td>
                        <td className={`px-4 py-3 font-medium ${statusCfg.color}`}>
                          {statusCfg.label}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{periodEnd}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString('es-AR') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      {searchQuery ? 'Sin resultados para la búsqueda' : 'No hay usuarios'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            </div>
          )}

          {/* ── PLANES ── */}
          {tab === 'planes' && (
            <div>
              <div className="flex justify-end mb-4">
                <button
                  onClick={handleCreatePlan}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors"
                >
                  <Plus size={16} />
                  Nuevo Plan
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {plans.map((plan: any) => (
                  <div key={plan.id} className={`rounded-xl border p-5 bg-white ${plan.is_active ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-60'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-800">{plan.name}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">{plan.description}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${plan.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {plan.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 mb-1">
                      ${Number(plan.price_monthly).toLocaleString('es-AR')}
                      <span className="text-sm font-normal text-gray-400"> /mes</span>
                    </p>
                    {plan.price_yearly && (
                      <p className="text-xs text-teal-600 mb-3">
                        ${Number(plan.price_yearly).toLocaleString('es-AR')} /año
                      </p>
                    )}
                    <ul className="space-y-1 mb-4">
                      {(plan.features as string[]).map((f: string, i: number) => (
                        <li key={i} className="text-xs text-gray-500 flex items-center gap-1.5">
                          <CheckCircle size={11} className="text-teal-400 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTogglePlan(plan.id, plan.is_active)}
                        disabled={!!actionLoading}
                        className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                          plan.is_active
                            ? 'bg-red-50 hover:bg-red-100 text-red-600'
                            : 'bg-teal-50 hover:bg-teal-100 text-teal-700'
                        }`}
                      >
                        {actionLoading === plan.id
                          ? <Loader2 size={14} className="animate-spin mx-auto" />
                          : plan.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        onClick={() => handleEditPlan(plan)}
                        disabled={!!actionLoading}
                        title="Editar plan"
                        className="p-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors disabled:opacity-50"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeletePlan(plan.id, plan.name)}
                        disabled={!!actionLoading}
                        title="Eliminar plan"
                        className="p-2 rounded-lg bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === plan.id + '_delete'
                          ? <Loader2 size={14} className="animate-spin" />
                          : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
                {plans.length === 0 && (
                  <p className="col-span-3 text-center text-gray-400 py-10">No hay planes</p>
                )}
              </div>
            </div>
          )}

          {/* ── PAGOS ── */}
          {tab === 'pagos' && (
            <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={handleSyncPayments}
                disabled={actionLoading === 'sync_payments'}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-teal-700 border border-gray-200 hover:border-teal-300 bg-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {actionLoading === 'sync_payments'
                  ? <Loader2 size={14} className="animate-spin" />
                  : <RefreshCw size={14} />}
                Sincronizar estados
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Fecha</th>
                    <th className="px-4 py-3 text-left">Usuario</th>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-left">ID MercadoPago</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {events.map((e: any) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(e.created_at).toLocaleString('es-AR')}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{e.user_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{e.event_type}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{e.mp_resource_id ?? '—'}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const cfg = PAYMENT_STATUS[e.mp_status];
                          if (cfg) {
                            return (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                                {cfg.label}
                              </span>
                            );
                          }
                          return (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              {e.mp_status ?? (e.processed ? 'Sin datos' : 'Sin procesar')}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                  {events.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin eventos de pago</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            </div>
          )}

          {/* ── MENSAJES ── */}
          {tab === 'mensajes' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Dentista</th>
                      <th className="px-4 py-3 text-left font-medium">Asunto</th>
                      <th className="px-4 py-3 text-left font-medium">Mensaje</th>
                      <th className="px-4 py-3 text-left font-medium">Fecha</th>
                      <th className="px-4 py-3 text-left font-medium">Estado</th>
                      <th className="px-4 py-3 text-right font-medium">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map((msg) => (
                      <tr key={msg.id} className={`border-t border-gray-50 ${msg.status === 'new' ? 'bg-amber-50/40' : ''}`}>
                        <td className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap">{msg.user_name ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{msg.subject}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-md whitespace-pre-wrap break-words">{msg.body}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(msg.created_at).toLocaleString('es-AR')}
                        </td>
                        <td className="px-4 py-3">
                          {msg.status === 'read' ? (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Leído</span>
                          ) : (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">Nuevo</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {msg.status !== 'read' && (
                            <button
                              onClick={() => handleMarkRead(msg.id)}
                              disabled={actionLoading === `msg-${msg.id}`}
                              className="inline-flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 disabled:opacity-50"
                            >
                              {actionLoading === `msg-${msg.id}`
                                ? <Loader2 size={14} className="animate-spin" />
                                : <CheckCircle size={14} />}
                              Marcar leído
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {messages.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin mensajes</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      <PlanFormModal
        open={planModalOpen}
        plan={editingPlan}
        onClose={() => { setPlanModalOpen(false); setEditingPlan(null); }}
        onSaved={() => loadTab('planes')}
      />
      <UserPermissionsModal
        open={permissionsModalOpen}
        user={permissionsUser}
        onClose={() => { setPermissionsModalOpen(false); setPermissionsUser(null); }}
      />
      <UserDetailModal
        open={!!detailUserId}
        user={detailUser}
        plans={plans}
        actionLoading={actionLoading}
        selectedPlans={selectedPlans}
        setSelectedPlans={setSelectedPlans}
        onGrantFree={handleGrantFree}
        onCancel={handleCancel}
        onToggleAdmin={handleToggleAdmin}
        onAssignPlan={handleAssignPlan}
        onOpenPermissions={handleOpenPermissions}
        onDelete={handleDeleteUser}
        onClose={() => setDetailUserId(null)}
      />
    </div>
  );
}
