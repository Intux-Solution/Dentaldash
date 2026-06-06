import React, { useState } from 'react';
import { Loader2, Gift, Ban, Settings, Shield, ShieldOff, Trash2, AlertTriangle } from 'lucide-react';
import ModalShell from './ModalShell';

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Activa', color: 'text-green-700', bg: 'bg-green-100' },
  free: { label: 'Gratuito', color: 'text-teal-700', bg: 'bg-teal-100' },
  trial: { label: 'Trial', color: 'text-blue-700', bg: 'bg-blue-100' },
  past_due: { label: 'Pago fallido', color: 'text-amber-700', bg: 'bg-amber-100' },
  cancelled: { label: 'Cancelada', color: 'text-red-700', bg: 'bg-red-100' },
};

interface UserDetailModalProps {
  open: boolean;
  user: any | null;
  plans: any[];
  actionLoading: string | null;
  selectedPlans: Record<string, string>;
  setSelectedPlans: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onGrantFree: (userId: string, name: string) => void;
  onCancel: (userId: string, name: string) => void;
  onToggleAdmin: (userId: string, name: string, role: string) => void;
  onAssignPlan: (userId: string, name: string) => void;
  onOpenPermissions: (user: any) => void;
  onDelete: (userId: string, name: string) => void;
  onClose: () => void;
}

export default function UserDetailModal({
  open,
  user,
  plans,
  actionLoading,
  selectedPlans,
  setSelectedPlans,
  onGrantFree,
  onCancel,
  onToggleAdmin,
  onAssignPlan,
  onOpenPermissions,
  onDelete,
  onClose,
}: UserDetailModalProps) {
  const [confirmText, setConfirmText] = useState('');

  if (!open || !user) return null;

  const name = user.full_name ?? user.email ?? user.id;
  const sub = user.subscriptions?.[0];
  const statusCfg = STATUS_LABEL[sub?.status] ?? { label: 'Sin suscripción', color: 'text-gray-500', bg: 'bg-gray-100' };
  const planName =
    sub?.subscription_plans?.name ??
    plans.find((p: any) => p.id === sub?.plan_id)?.name ??
    (sub?.status === 'free' ? 'Acceso Gratuito' : sub?.status === 'trial' ? 'Trial' : sub?.status ? sub.status : '—');
  const periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString('es-AR')
    : sub?.trial_ends_at
      ? new Date(sub.trial_ends_at).toLocaleDateString('es-AR')
      : '—';
  const registered = user.created_at ? new Date(user.created_at).toLocaleDateString('es-AR') : '—';
  const isAdmin = user.role === 'admin';

  const isBusy = (suffix: string) => actionLoading === user.id + suffix;
  const canDelete = confirmText.trim().toLowerCase() === (user.email ?? '').trim().toLowerCase() && !!user.email;

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 text-right">{children}</span>
    </div>
  );

  return (
    <ModalShell title={name} onClose={onClose} maxWidth="max-w-lg">
      {/* ── Información ── */}
      <div className="mb-5">
        <Row label="Email">{user.email || '—'}</Row>
        <Row label="Rol">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
            {user.role}
          </span>
        </Row>
        <Row label="Plan">{planName}</Row>
        <Row label="Estado">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
            {statusCfg.label}
          </span>
        </Row>
        <Row label="Vencimiento">{periodEnd}</Row>
        <Row label="Registro">{registered}</Row>
        <Row label="ID"><span className="font-mono text-xs text-gray-400">{user.id}</span></Row>
      </div>

      {/* ── Acciones ── */}
      <div className="mb-5">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Acciones</h4>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onGrantFree(user.id, name)}
            disabled={isBusy('_free')}
            className="flex items-center justify-center gap-1.5 text-sm bg-teal-50 hover:bg-teal-100 text-teal-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {isBusy('_free') ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
            Acceso gratis
          </button>

          <button
            onClick={() => onCancel(user.id, name)}
            disabled={isBusy('_cancel') || sub?.status === 'cancelled'}
            className="flex items-center justify-center gap-1.5 text-sm bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isBusy('_cancel') ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
            Cancelar suscripción
          </button>

          <button
            onClick={() => onOpenPermissions(user)}
            className="flex items-center justify-center gap-1.5 text-sm bg-gray-50 hover:bg-gray-100 text-gray-700 px-3 py-2 rounded-lg transition-colors"
          >
            <Settings size={14} />
            Permisos
          </button>

          <button
            onClick={() => onToggleAdmin(user.id, name, user.role)}
            disabled={isBusy('_admin')}
            className={`flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-50 ${
              isAdmin ? 'bg-purple-50 hover:bg-purple-100 text-purple-700' : 'bg-gray-50 hover:bg-gray-100 text-gray-600'
            }`}
          >
            {isBusy('_admin') ? <Loader2 size={14} className="animate-spin" /> : isAdmin ? <ShieldOff size={14} /> : <Shield size={14} />}
            {isAdmin ? 'Quitar admin' : 'Hacer admin'}
          </button>
        </div>

        {/* Cambiar plan */}
        <div className="flex gap-2 mt-2">
          <select
            value={selectedPlans[user.id] ?? ''}
            onChange={(e) => setSelectedPlans((prev) => ({ ...prev, [user.id]: e.target.value }))}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
          >
            <option value="">Cambiar plan...</option>
            {plans.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => onAssignPlan(user.id, name)}
            disabled={!selectedPlans[user.id] || isBusy('_assign')}
            className="text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isBusy('_assign') ? <Loader2 size={14} className="animate-spin" /> : 'Asignar'}
          </button>
        </div>
      </div>

      {/* ── Zona de peligro ── */}
      <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <AlertTriangle size={15} className="text-red-500 shrink-0" />
          <h4 className="text-sm font-semibold text-red-700">Eliminar usuario</h4>
        </div>
        <p className="text-xs text-red-600/90 mb-3 leading-relaxed">
          Esta acción es <strong>irreversible</strong>. Se borrará la cuenta y todos sus datos:
          pacientes, turnos, odontogramas, historiales clínicos y archivos. Para confirmar, escribí el
          email del usuario.
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={user.email || 'email del usuario'}
          className="w-full mb-2 px-3 py-2 text-sm border border-red-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
        />
        <button
          onClick={() => onDelete(user.id, name)}
          disabled={!canDelete || isBusy('_delete')}
          className="w-full flex items-center justify-center gap-1.5 text-sm bg-red-600 hover:bg-red-700 text-white font-medium px-3 py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isBusy('_delete') ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Eliminar definitivamente
        </button>
      </div>
    </ModalShell>
  );
}
