import { create } from 'zustand';

interface AppState {
    dashboardSearchTerm: string;
    setDashboardSearchTerm: (term: string) => void;
    dashboardStatusFilter: string;
    setDashboardStatusFilter: (status: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
    dashboardSearchTerm: '',
    setDashboardSearchTerm: (term) => set({ dashboardSearchTerm: term }),
    dashboardStatusFilter: 'Todos',
    setDashboardStatusFilter: (status) => set({ dashboardStatusFilter: status }),
}));
