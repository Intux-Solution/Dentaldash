import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import ModalShell from './ModalShell';
import { supportMessageSchema, type SupportMessageData } from '../schemas/support.schema';
import { SupportService } from '../services/SupportService';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const FieldError = ({ error }: { error?: { message?: string } }) =>
  error ? <p className="mt-1 text-xs text-red-500">{error.message}</p> : null;

const inputCls = (hasError?: any) =>
  `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-0 ${
    hasError ? 'border-red-400 bg-red-50' : 'border-transparent bg-[#F5F5F5]'
  }`;

interface SupportMessageModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SupportMessageModal({ open, onClose }: SupportMessageModalProps) {
  const { session } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupportMessageData>({
    resolver: zodResolver(supportMessageSchema),
    defaultValues: { subject: '', body: '' },
  });

  useEffect(() => {
    if (open) reset({ subject: '', body: '' });
  }, [open, reset]);

  const onSubmit = async (data: SupportMessageData) => {
    const userId = session?.user?.id;
    if (!userId) {
      toast.error('No se pudo identificar tu sesión.');
      return;
    }
    try {
      await SupportService.sendMessage(userId, data.subject, data.body);
      toast.success('Mensaje enviado al administrador');
      reset({ subject: '', body: '' });
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo enviar el mensaje');
    }
  };

  if (!open) return null;

  return (
    <ModalShell
      title="Contactar al administrador"
      onClose={onClose}
      maxWidth="max-w-md"
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
            form="support-form"
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting
              ? <><Loader2 size={14} className="animate-spin" /> Enviando...</>
              : 'Enviar'}
          </button>
        </div>
      }
    >
      <form id="support-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <p className="text-sm text-gray-500">
          ¿Encontraste una falla o necesitás ayuda? Dejanos tu mensaje y el administrador lo revisará.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Asunto *</label>
          <input
            {...register('subject')}
            type="text"
            placeholder="Ej: Error al guardar un turno"
            className={inputCls(errors.subject)}
            disabled={isSubmitting}
          />
          <FieldError error={errors.subject} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje *</label>
          <textarea
            {...register('body')}
            rows={5}
            placeholder="Contanos qué pasó o en qué te podemos ayudar..."
            className={`resize-none ${inputCls(errors.body)}`}
            disabled={isSubmitting}
          />
          <FieldError error={errors.body} />
        </div>
      </form>
    </ModalShell>
  );
}
