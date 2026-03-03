
import React from 'react';
import { CreditCard, User, Phone, CheckCircle, Loader } from 'lucide-react';
import { UseFormRegister, FieldErrors, UseFormSetValue } from 'react-hook-form';
import InsuranceAutocomplete from '../InsuranceAutocomplete';

interface PatientInfoFieldsProps {
    register: UseFormRegister<any>;
    errors: FieldErrors<any>;
    checkingPatient: boolean;
    patientFound: boolean;
    obraSocial: string | null | undefined;
    setValue: UseFormSetValue<any>;
    isSubmitting: boolean;
}

export default function PatientInfoFields({
    register,
    errors,
    checkingPatient,
    patientFound,
    obraSocial,
    setValue,
    isSubmitting,
}: PatientInfoFieldsProps) {
    return (
        <div className="space-y-6">
            {/* DNI Field */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    <CreditCard className="inline w-4 h-4 mr-1" />
                    DNI
                </label>
                <div className="relative">
                    <input
                        type="text"
                        {...register('dni')}
                        placeholder="12.345.678"
                        className={`text - sm w - full px - 3 py - 2 rounded - xl border ${errors.dni ? 'border-red-500' : 'border-transparent'} bg - [#F5F5F5] placeholder: text - sm focus: outline - none focus: ring - 0 focus: border - transparent`}
                    />
                    {checkingPatient && (
                        <Loader className="absolute right-3 top-2 w-5 h-5 text-gray-400 animate-spin" />
                    )}
                </div>
                {errors.dni && <p className="text-red-500 text-xs mt-1">{errors.dni?.message as string}</p>}
                {patientFound && (
                    <p className="text-teal-600 text-sm mt-1 flex items-center gap-1">
                        <CheckCircle size={16} />
                        ¡Paciente encontrado!
                    </p>
                )}
            </div>

            {/* Personal Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        <User className="inline w-4 h-4 mr-1" />
                        Nombre Completo
                    </label>
                    <input
                        type="text"
                        {...register('nombre')}
                        placeholder="Juan Pérez"
                        className={`text - sm w - full px - 3 py - 2 rounded - xl border ${errors.nombre ? 'border-red-500' : 'border-transparent'} bg - [#F5F5F5] placeholder: text - sm focus: outline - none focus: ring - 0 focus: border - transparent`}
                    />
                    {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre?.message as string}</p>}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Phone className="inline w-4 h-4 mr-1" />
                        Teléfono
                    </label>
                    <input
                        type="tel"
                        {...register('telefono')}
                        placeholder="+54 381 123 4567"
                        className={`text - sm w - full px - 3 py - 2 rounded - xl border ${errors.telefono ? 'border-red-500' : 'border-transparent'} bg - [#F5F5F5] placeholder: text - sm focus: outline - none focus: ring - 0 focus: border - transparent`}
                    />
                    {errors.telefono && <p className="text-red-500 text-xs mt-1">{errors.telefono?.message as string}</p>}
                </div>
            </div>

            {/* Email */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                </label>
                <input
                    type="email"
                    {...register('email')}
                    placeholder="paciente@correo.com"
                    className={`text - sm w - full px - 3 py - 2 rounded - xl border ${errors.email ? 'border-red-500' : 'border-transparent'} bg - [#F5F5F5] placeholder: text - sm focus: outline - none focus: ring - 0 focus: border - transparent`}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email?.message as string}</p>}
            </div>

            {/* Insurance Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Obra Social (Searchable Autocomplete) */}
                <InsuranceAutocomplete
                    value={obraSocial || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue('obraSocial', e.target.value, { shouldValidate: true })}
                    disabled={isSubmitting}
                    placeholder="OSDE, Swiss Medical, etc."
                />

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        N° de Afiliado
                    </label>
                    <input
                        type="text"
                        {...register('numeroAfiliado')}
                        placeholder="123456789"
                        className={`text - sm w - full px - 3 py - 2 rounded - xl border ${errors.numeroAfiliado ? 'border-red-500' : 'border-transparent'} bg - [#F5F5F5] placeholder: text - sm focus: outline - none focus: ring - 0 focus: border - transparent`}
                    />
                </div>
            </div>

            {/* Medical Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Alergias
                    </label>
                    <input
                        type="text"
                        {...register('alergias')}
                        placeholder="Ninguna, Penicilina, etc."
                        className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Antecedentes
                    </label>
                    <input
                        type="text"
                        {...register('antecedentes')}
                        placeholder="Diabetes, Hipertensión, etc."
                        className="text-sm w-full px-3 py-2 rounded-xl border border-transparent bg-[#F5F5F5] placeholder:text-sm focus:outline-none focus:ring-0 focus:border-transparent"
                    />
                </div>
            </div>
        </div>
    );
}
