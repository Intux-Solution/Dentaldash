import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Select } from 'antd';
import { Loader2 } from 'lucide-react';
import ModalShell from './ModalShell';
import { PlanFormSchema, type PlanFormData } from '../schemas/plan.schema';
import { AdminService } from '../services/AdminService';
import { ALL_FEATURE_KEYS } from '../config/featureKeys';
import toast from 'react-hot-toast';

const FieldError = ({ error }: { error?: { message?: string } }) =>
  error ? <p className="mt-1 text-xs text-red-500">{error.message}</p> : null;

const inputCls = (hasError?: any) =>
  `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-0 ${
    hasError ? 'border-red-400 bg-red-50' : 'border-transparent bg-[#F5F5F5]'
  }`;

interface PlanFormModalProps {
  open: boolean;
  plan?: any;
  onClose: () => void;
  onSaved: () => void;
}

export default function PlanFormModal({ open, plan, onClose, onSaved }: PlanFormModalProps) {
  const isEdit = !!plan;

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PlanFormData>({
    resolver: zodResolver(PlanFormSchema),
    defaultValues: { name: '', description: '', price_monthly: 0, price_yearly: undefined, features: [], feature_keys: [], sort_order: 0, trial_days: undefined },
  });

  const watchPriceMonthly = watch('price_monthly');

  useEffect(() => {
    if (open) {
      if (plan) {
        reset({
          name: plan.name ?? '',
          description: plan.description ?? '',
          price_monthly: plan.price_monthly ?? 0,
          price_yearly: plan.price_yearly ?? undefined,
          features: plan.features ?? [],
          feature_keys: plan.feature_keys ?? [],
          sort_order: plan.sort_order ?? 0,
          trial_days: plan.trial_days ?? undefined,
        });
      } else {
        reset({ name: '', description: '', price_monthly: 0, price_yearly: undefined, features: [], feature_keys: [], sort_order: 0, trial_days: undefined });
      }
    }
  }, [open, plan, reset]);

  const onSubmit = async (data: PlanFormData) => {
    try {
      if (isEdit) {
        await AdminService.updatePlan(plan.id, data);
        toast.success('Plan actualizado');
      } else {
        await AdminService.createPlan({
          name: data.name,
          description: data.description ?? undefined,
          price_monthly: data.price_monthly,
          price_yearly: data.price_yearly ?? undefined,
          features: data.features,
          sort_order: data.sort_order,
          trial_days: data.trial_days ?? null,
        });
        toast.success('Plan creado');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar el plan');
    }
  };

  if (!open) return null;

  return (
    <ModalShell
      title={isEdit ? 'Editar Plan' : 'Nuevo Plan'}
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 rounded-xl border text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="plan-form"
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting
              ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
              : isEdit ? 'Guardar cambios' : 'Crear plan'}
          </button>
        </div>
      }
    >
      <form id="plan-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {/* Nombre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
          <input
            {...register('name')}
            type="text"
            placeholder="Ej: Pro"
            className={inputCls(errors.name)}
            disabled={isSubmitting}
          />
          <FieldError error={errors.name} />
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <textarea
            {...register('description')}
            rows={2}
            placeholder="Descripción breve del plan..."
            className={`resize-none ${inputCls(errors.description)}`}
            disabled={isSubmitting}
          />
          <FieldError error={errors.description} />
        </div>

        {/* Precios */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio mensual (ARS) *</label>
            <input
              {...register('price_monthly')}
              type="number"
              min={0}
              step="0.01"
              placeholder="0"
              className={inputCls(errors.price_monthly)}
              disabled={isSubmitting}
            />
            <FieldError error={errors.price_monthly} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio anual (ARS)</label>
            <input
              {...register('price_yearly')}
              type="number"
              min={0}
              step="0.01"
              placeholder="Opcional"
              className={inputCls(errors.price_yearly)}
              disabled={isSubmitting}
            />
            <FieldError error={errors.price_yearly} />
          </div>
        </div>

        {/* Dias de prueba (solo para planes gratuitos) */}
        {Number(watchPriceMonthly) === 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dias de prueba</label>
            <input
              {...register('trial_days')}
              type="number"
              min={1}
              placeholder="Ej: 14"
              className={inputCls(errors.trial_days)}
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-400">Duracion del periodo de prueba para nuevos usuarios</p>
            <FieldError error={errors.trial_days} />
          </div>
        )}

        {/* Features */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Features (etiquetas)</label>
          <Controller
            name="features"
            control={control}
            render={({ field }) => (
              <Select
                mode="tags"
                style={{ width: '100%' }}
                placeholder="Escribí una feature y presioná Enter"
                value={field.value}
                onChange={field.onChange}
                disabled={isSubmitting}
                tokenSeparators={[',']}
              />
            )}
          />
          <FieldError error={errors.features} />
        </div>

        {/* Permisos de funcionalidad */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Permisos de funcionalidad</label>
          <Controller
            name="feature_keys"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-1 gap-2 bg-gray-50 rounded-xl p-3">
                {ALL_FEATURE_KEYS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded text-teal-600 accent-teal-600"
                      checked={field.value.includes(key)}
                      disabled={isSubmitting}
                      onChange={(e) => {
                        if (e.target.checked) {
                          field.onChange([...field.value, key]);
                        } else {
                          field.onChange(field.value.filter((k: string) => k !== key));
                        }
                      }}
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                    <span className="text-xs text-gray-400 font-mono ml-auto">{key}</span>
                  </label>
                ))}
              </div>
            )}
          />
        </div>

        {/* Orden */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Orden de visualización</label>
          <input
            {...register('sort_order')}
            type="number"
            min={0}
            placeholder="0"
            className={inputCls(errors.sort_order)}
            disabled={isSubmitting}
          />
          <FieldError error={errors.sort_order} />
        </div>
      </form>
    </ModalShell>
  );
}
