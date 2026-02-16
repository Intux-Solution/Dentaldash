import React, { useState, useEffect, useRef } from 'react';
import { Building2, Check, Search, X } from 'lucide-react';
import { PatientService } from '../services/PatientService';

/**
 * Searchable Autocomplete for Insurance Providers
 */
export default function InsuranceAutocomplete({ value, onChange, disabled, placeholder }) {
    const [suggestions, setSuggestions] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const fetchInsurances = async () => {
            setLoading(true);
            try {
                const list = await PatientService.getAllUniqueInsurances();
                setSuggestions(list);
            } catch (err) {
                console.error('Error fetching insurances for autocomplete:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchInsurances();
    }, []);

    useEffect(() => {
        if (value && showDropdown) {
            const filteredList = suggestions.filter(item =>
                item.toLowerCase().includes(value.toLowerCase()) &&
                item.toLowerCase() !== value.toLowerCase()
            );
            setFiltered(filteredList);
        } else if (showDropdown) {
            setFiltered(suggestions);
        }
    }, [value, suggestions, showDropdown]);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (item) => {
        onChange({ target: { name: 'obraSocial', value: item } });
        setShowDropdown(false);
    };

    const handleClear = () => {
        onChange({ target: { name: 'obraSocial', value: '' } });
        setShowDropdown(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Building2 size={16} className="mr-2 text-gray-500" />
                Obra Social
            </label>

            <div className="relative">
                <input
                    name="obraSocial"
                    type="text"
                    value={value}
                    onChange={(e) => {
                        onChange(e);
                        setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder={placeholder || "OSDE, Swiss Medical, etc."}
                    className="w-full rounded-xl border border-transparent bg-[#F5F5F5] px-3 py-2 pr-10 placeholder:text-sm text-sm focus:outline-none focus:ring-0 focus:shadow-none focus:border-transparent transition-all"
                    disabled={disabled}
                    autoComplete="off"
                />

                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {value && !disabled && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded-full"
                        >
                            <X size={14} />
                        </button>
                    )}
                    <Search size={16} className="text-gray-400" />
                </div>
            </div>

            {showDropdown && !disabled && (filtered.length > 0 || loading) && (
                <div className="absolute z-[60] mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="max-h-48 overflow-y-auto custom-scrollbar">
                        {loading ? (
                            <div className="p-3 text-xs text-center text-gray-500 italic">Buscando...</div>
                        ) : filtered.length > 0 ? (
                            filtered.map((item, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    onClick={() => handleSelect(item)}
                                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-colors text-left"
                                >
                                    <span>{item}</span>
                                    {value === item && <Check size={14} className="text-teal-600" />}
                                </button>
                            ))
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}
