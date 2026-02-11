import React from 'react';
import { cls } from '../utils/helpers';

export default function TextInput({ label, value, onChange, icon: Icon, type = 'text' }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cls("w-full", Icon ? "pl-9" : "pl-3", "pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500")}
        />
      </div>
    </div>
  );
}