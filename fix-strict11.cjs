const fs = require('fs');

// 1. FaqsTab: add interfaces for FaqItem and FaqsTab
let faqs = fs.readFileSync('src/components/settings/FaqsTab.tsx', 'utf8');

// Type FaqItem props
faqs = faqs.replace(
    'const FaqItem = ({ faq, onUpdate, onDelete }) => {',
    'const FaqItem = ({ faq, onUpdate, onDelete }: { faq: any; onUpdate: (id: string, updates: any) => void; onDelete: (id: string) => void }) => {'
);

// Type FaqsTab props
faqs = faqs.replace(
    'export default function FaqsTab({ tenant, faqs, setFaqs }) {',
    'export default function FaqsTab({ tenant, faqs, setFaqs }: { tenant: any; faqs: any[]; setFaqs: React.Dispatch<React.SetStateAction<any[]>> }) {'
);

// Type handleUpdateFAQ and handleDeleteFAQ params
faqs = faqs.replace(
    'const handleUpdateFAQ = async (faqId, updates) => {',
    'const handleUpdateFAQ = async (faqId: string, updates: any) => {'
);
faqs = faqs.replace(
    'const handleDeleteFAQ = async (id) => {',
    'const handleDeleteFAQ = async (id: string) => {'
);
fs.writeFileSync('src/components/settings/FaqsTab.tsx', faqs);

// 2. index.tsx: fix ReactDOM.createRoot null argument
let idx = fs.readFileSync('src/index.tsx', 'utf8');
idx = idx.replace(
    "const root = ReactDOM.createRoot(document.getElementById('root'));",
    "const rootElement = document.getElementById('root');\nif (!rootElement) throw new Error('Root element not found');\nconst root = ReactDOM.createRoot(rootElement);"
);
fs.writeFileSync('src/index.tsx', idx);

console.log('Done.');
