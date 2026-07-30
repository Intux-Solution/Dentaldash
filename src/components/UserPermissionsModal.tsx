import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import ModalShell from './ModalShell';
import { AdminService } from '../services/AdminService';
import { ALL_FEATURE_KEYS } from '../config/featureKeys';

interface UserPermissionsModalProps {
  open: boolean;
  user: any | null;
  onClose: () => void;
}

export default function UserPermissionsModal({ open, user, onClose }: UserPermissionsModalProps) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    AdminService.getUserPermissions(user.id)
      .then((data: any[]) => {
        const map: Record<string, boolean> = {};
        data.forEach((p) => { map[p.feature_key] = p.enabled; });
        setPermissions(map);
      })
      .catch((err: any) => toast.error(err.message ?? 'Error al cargar permisos'))
      .finally(() => setLoading(false));
  }, [open, user]);

  const handleToggle = async (key: string, current: boolean) => {
    const newValue = !current;
    setPermissions((prev) => ({ ...prev, [key]: newValue }));
    setSaving(key);
    try {
      await AdminService.updateUserPermission(user.id, key, newValue);
    } catch (err: any) {
      setPermissions((prev) => ({ ...prev, [key]: current }));
      toast.error(err.message ?? 'Error al guardar permiso');
    } finally {
      setSaving(null);
    }
  };

  if (!open || !user) return null;

  return (
    <ModalShell
      title={`Permisos — ${user.full_name ?? user.email ?? user.id}`}
      onClose={onClose}
      maxWidth="max-w-sm"
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-teal-600" size={24} />
        </div>
      ) : (
        <ul className="space-y-2">
          {ALL_FEATURE_KEYS.map(({ key, label }) => {
            const enabled = permissions[key] ?? false;
            const isSaving = saving === key;
            return (
              <li key={key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400 font-mono">{key}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle(key, enabled)}
                  disabled={isSaving}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                    enabled ? 'bg-teal-500' : 'bg-gray-200'
                  }`}
                  aria-label={label}
                >
                  {isSaving ? (
                    <Loader2 size={12} className="animate-spin mx-auto text-white" />
                  ) : (
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ModalShell>
  );
}
