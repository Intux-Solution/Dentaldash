import React, { useState } from 'react';
import { Plus, Trash2, Save, Pencil } from 'lucide-react';
import { supabase } from '../../config/supabaseClient';
import { message } from 'antd';

const FaqItem = ({ faq, onUpdate, onDelete }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [question, setQuestion] = useState(faq.question);
    const [answer, setAnswer] = useState(faq.answer);

    const handleSave = () => {
        if (question !== faq.question || answer !== faq.answer) {
            onUpdate(faq.id, { question, answer });
        }
        setIsEditing(false);
        message.success("Pregunta modificada correctamente");
    };

    return (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col gap-2 animate-in fade-in">
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 space-y-2">
                    {isEditing ? (
                        <>
                            <input
                                type="text"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                placeholder="Pregunta"
                                className="w-full bg-white font-bold text-gray-800 text-sm border focus:ring-1 focus:ring-teal-100 rounded p-2 outline-none"
                                autoFocus
                            />
                            <textarea
                                value={answer}
                                rows={2}
                                onChange={(e) => setAnswer(e.target.value)}
                                placeholder="Respuesta"
                                className="w-full bg-white text-xs text-gray-500 border focus:ring-1 focus:ring-teal-100 rounded p-2 outline-none resize-none"
                            />
                        </>
                    ) : (
                        <>
                            <div className="w-full bg-transparent font-bold text-gray-800 text-sm p-1">
                                {faq.question}
                            </div>
                            <div className="w-full bg-transparent text-xs text-gray-500 p-1 whitespace-pre-wrap">
                                {faq.answer}
                            </div>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {isEditing ? (
                        <button onClick={handleSave} className="p-2 text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-all" title="Guardar cambios">
                            <Save size={16} />
                        </button>
                    ) : (
                        <button onClick={() => setIsEditing(true)} className="p-2 text-gray-400 hover:text-teal-600 transition-all rounded-lg" title="Editar">
                            <Pencil size={16} />
                        </button>
                    )}
                    <button onClick={() => onDelete(faq.id)} className="p-2 text-gray-400 hover:text-red-500 transition-all rounded-lg" title="Eliminar">
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function FaqsTab({ tenant, faqs, setFaqs }) {
    const tenantId = tenant?.user_id || tenant?.id;

    const handleAddFAQ = async () => {
        const qEl = document.getElementById('faq-question');
        const aEl = document.getElementById('faq-answer');
        if (!qEl.value.trim() || !aEl.value.trim()) return;

        try {
            const { data, error } = await supabase
                .from('tenant_faqs')
                .insert({
                    question: qEl.value.trim(),
                    answer: aEl.value.trim(),
                    tenant_id: tenantId
                })
                .select()
                .single();

            if (error) throw error;
            setFaqs(prev => [...prev, data]);
            qEl.value = '';
            aEl.value = '';
            message.success('Pregunta agregada correctamente');
        } catch (err) {
            message.error('Error al agregar FAQ: ' + err.message);
        }
    };

    const handleUpdateFAQ = async (faqId, updates) => {
        try {
            const { error } = await supabase.from('tenant_faqs').update(updates).eq('id', faqId);
            if (error) throw error;
            setFaqs(prev => prev.map(f => f.id === faqId ? { ...f, ...updates } : f));
        } catch (err) {
            console.error('Error updating FAQ:', err);
        }
    };

    const handleDeleteFAQ = async (id) => {
        try {
            const { error } = await supabase.from('tenant_faqs').delete().eq('id', id);
            if (error) throw error;
            setFaqs(prev => prev.filter(f => f.id !== id));
            message.success('FAQ eliminada');
        } catch (err) {
            message.error('Error al eliminar FAQ: ' + err.message);
        }
    };

    return (
        <div className="p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Plus size={20} className="text-teal-600" />
                Preguntas Frecuentes
            </h2>
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden mb-6">
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Pregunta del Paciente</label>
                        <input type="text" id="faq-question" placeholder="Ej: ¿Qué obras sociales aceptan?" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Respuesta del Asistente</label>
                        <textarea id="faq-answer" rows={2} placeholder="Ej: Aceptamos OSDE, Swiss Medical y Galeno..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all" />
                    </div>
                    <button
                        onClick={handleAddFAQ}
                        className="w-full py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all flex items-center justify-center gap-2"
                    >
                        <Plus size={18} />
                        <span>Guardar Pregunta</span>
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                {faqs.map(faq => (
                    <FaqItem
                        key={faq.id}
                        faq={faq}
                        onUpdate={handleUpdateFAQ}
                        onDelete={handleDeleteFAQ}
                    />
                ))}
            </div>
        </div>
    );
}
