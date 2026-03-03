const fs = require('fs');

// Sidebar: type props
let sb = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
sb = sb.replace(
    'export default function Sidebar({ sidebarOpen, setSidebarOpen, onLogout }) {',
    `interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  onLogout: () => void;
}

export default function Sidebar({ sidebarOpen, setSidebarOpen, onLogout }: SidebarProps) {`
);
fs.writeFileSync('src/components/Sidebar.tsx', sb);

// SettingsView: session is typed as null, but useSettings may expect Session | null
let sv = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');
sv = sv.replace(
    "const [session, setSession] = useState(null);",
    "const [session, setSession] = useState<import('@supabase/supabase-js').Session | null>(null);"
);
fs.writeFileSync('src/components/SettingsView.tsx', sv);

console.log('Done.');
