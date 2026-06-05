import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { AdminService } from '../services/AdminService';
import { ExportService } from '../services/ExportService';
import { Users, CreditCard, LayoutList, CheckCircle, RefreshCw, Loader2, Plus, Pencil, Trash2, Download, Shield, ShieldOff, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import PlanFormModal from './PlanFormModal';
import AdminMetrics from './AdminMetrics';
import TrialExpiringAlert from './TrialExpiringAlert';
import UserPermissionsModal from './UserPermissionsModal';
import SearchInput from './SearchInput';

type Tab = 'usuarios' | 'planes' | 'pagos';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active: { label: 'Activa', color: 'text-green-600' },
  free: { label: 'Gratuito', color: 'text-teal-600' },
  trial: { label: 'Trial', color: 'text-blue-600' },
  past_due: { label: 'Pago fallido', color: 'text-amber-600' },
  cancelled: { label: 'Cancelada', color: 'text-red-600' },
};

export default function AdminView() {
  const [tab, setTab] = useState<Tab>('usuarios');
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);

  const [selectedPlans, setSelectedPlans] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [permissionsUser, setPermissionsUser] = useState<any | null>(null);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);

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

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'usuarios', label: 'Usuarios', icon: <Users size={16} /> },
    { key: 'planes', label: 'Planes', icon: <LayoutList size={16} /> },
    { key: 'pagos', label: 'Pagos', icon: <CreditCard size={16} /> },
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
                    <th className="px-4 py-3 text-left">Acciones</th>
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
                      <tr key={u.id} className="hover:bg-gray-50">
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
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2 flex-wrap">
                              <button
                                onClick={() => handleGrantFree(u.id, u.full_name ?? u.id)}
                                disabled={actionLoading === u.id + '_free'}
                                className="text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 px-2 py-1 rounded-md transition-colors disabled:opacity-50"
                              >
                                {actionLoading === u.id + '_free' ? <Loader2 size={12} className="animate-spin" /> : 'Acceso gratis'}
                              </button>
                              {sub?.status !== 'cancelled' && (
                                <button
                                  onClick={() => handleCancel(u.id, u.full_name ?? u.id)}
                                  disabled={actionLoading === u.id + '_cancel'}
                                  className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded-md transition-colors disabled:opacity-50"
                                >
                                  {actionLoading === u.id + '_cancel' ? <Loader2 size={12} className="animate-spin" /> : 'Cancelar'}
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenPermissions(u)}
                                title="Editar permisos individuales"
                                className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 px-2 py-1 rounded-md transition-colors flex items-center gap-1"
                              >
                                <Settings size={11} />
                                Permisos
                              </button>
                              <button
                                onClick={() => handleToggleAdmin(u.id, u.full_name ?? u.id, u.role)}
                                disabled={actionLoading === u.id + '_admin'}
                                title={u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                                className={`text-xs px-2 py-1 rounded-md transition-colors flex items-center gap-1 disabled:opacity-50 ${
                                  u.role === 'admin'
                                    ? 'bg-purple-50 hover:bg-purple-100 text-purple-700'
                                    : 'bg-gray-50 hover:bg-gray-100 text-gray-500'
                                }`}
                              >
                                {actionLoading === u.id + '_admin'
                                  ? <Loader2 size={11} className="animate-spin" />
                                  : u.role === 'admin'
                                    ? <><ShieldOff size={11} /> Admin</>
                                    : <><Shield size={11} /> Admin</>}
                              </button>
                            </div>
                            <div className="flex gap-1.5">
                              <select
                                value={selectedPlans[u.id] ?? ''}
                                onChange={(e) => setSelectedPlans((prev) => ({ ...prev, [u.id]: e.target.value }))}
                                className="text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
                              >
                                <option value="">Cambiar plan...</option>
                                {plans.map((p: any) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleAssignPlan(u.id, u.full_name ?? u.id)}
                                disabled={!selectedPlans[u.id] || actionLoading === u.id + '_assign'}
                                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {actionLoading === u.id + '_assign' ? <Loader2 size={12} className="animate-spin" /> : 'Asignar'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">
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
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${e.processed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {e.processed ? 'Procesado' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {events.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin eventos de pago</td></tr>
                  )}
                </tbody>
              </table>
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
    </div>
  );
}
