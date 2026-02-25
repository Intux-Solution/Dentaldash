import { create } from 'zustand';

interface AppState {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    statusFilter: string;
    setStatusFilter: (status: string) => void;
    dashboardSearchTerm: string;
    setDashboardSearchTerm: (term: string) => void;
    dashboardStatusFilter: string;
    setDashboardStatusFilter: (status: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
    searchTerm: '',
    setSearchTerm: (term) => set({ searchTerm: term }),
    statusFilter: 'Todos',
    setStatusFilter: (status) => set({ statusFilter: status }),
    dashboardSearchTerm: '',
    setDashboardSearchTerm: (term) => set({ dashboardSearchTerm: term }),
    dashboardStatusFilter: 'Todos',
    setDashboardStatusFilter: (status) => set({ dashboardStatusFilter: status }),
}));
