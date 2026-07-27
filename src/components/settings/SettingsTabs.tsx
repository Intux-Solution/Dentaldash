// src/components/settings/SettingsTabs.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';

export interface SettingsTab {
    key: string;
    label: string;
    locked: boolean;
}

interface SettingsTabsProps {
    tabs: SettingsTab[];
    activeTab: string;
    onSelect: (key: string) => void;
}

const SCROLL_STEP = 220;

export default function SettingsTabs({ tabs, activeTab, onSelect }: SettingsTabsProps) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [atStart, setAtStart] = useState(true);
    const [atEnd, setAtEnd] = useState(true);

    const sync = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) return;
        setAtStart(el.scrollLeft <= 1);
        setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
    }, []);

    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        sync();
        const ro = new ResizeObserver(sync);
        ro.observe(el);
        return () => ro.disconnect();
    }, [sync]);

    // Traer la pestaña activa a la vista (ej: al entrar con ?tab=faqs)
    useEffect(() => {
        scrollerRef.current
            ?.querySelector(`[data-tab="${activeTab}"]`)
            ?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    }, [activeTab]);

    const nudge = (direction: -1 | 1) => {
        scrollerRef.current?.scrollBy({ left: direction * SCROLL_STEP, behavior: 'smooth' });
    };

    return (
        <div className="relative border-b border-gray-100 mb-6">
            <div ref={scrollerRef} onScroll={sync} className="flex overflow-x-auto no-scrollbar">
                {tabs.map(({ key, label, locked }) => (
                    <button
                        key={key}
                        data-tab={key}
                        onClick={() => onSelect(key)}
                        className={`px-6 py-3 font-medium text-sm whitespace-nowrap relative flex items-center gap-1.5 ${activeTab === key ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        {activeTab === key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />}
                        {label}
                        {locked && <Lock size={12} className="text-gray-400" />}
                    </button>
                ))}
            </div>

            {!atStart && (
                <button
                    type="button"
                    onClick={() => nudge(-1)}
                    aria-label="Desplazar pestañas a la izquierda"
                    className="absolute left-0 top-0 bottom-0 z-10 pl-1 pr-6 flex items-center text-gray-400 hover:text-gray-700 bg-gradient-to-r from-gray-100 via-gray-100 to-transparent"
                >
                    <ChevronLeft size={18} />
                </button>
            )}

            {!atEnd && (
                <button
                    type="button"
                    onClick={() => nudge(1)}
                    aria-label="Desplazar pestañas a la derecha"
                    className="absolute right-0 top-0 bottom-0 z-10 pr-1 pl-6 flex items-center text-gray-400 hover:text-gray-700 bg-gradient-to-l from-gray-100 via-gray-100 to-transparent"
                >
                    <ChevronRight size={18} />
                </button>
            )}
        </div>
    );
}
