import React, { createContext, useContext, useState, useCallback } from 'react';
import { MOCK_CLIENTS, MASTERS, type Client, type Master } from '@/data/mockData';

type User = {
  id: string;
  name: string;
  role: 'master' | 'admin';
  masterId?: string;
  phone: string;
};

type AppContextType = {
  user: User | null;
  login: (phone: string, password: string) => boolean;
  logout: () => void;
  clients: Client[];
  masters: Master[];
  updateClient: (id: string, updates: Partial<Client>) => void;
  addMaster: (master: Omit<Master, 'id'>) => void;
  removeMaster: (id: string) => void;
  toggleMaster: (id: string) => void;
  currentPage: string;
  setCurrentPage: (page: string) => void;
};

const AppContext = createContext<AppContextType | null>(null);

const DEMO_USERS: User[] = [
  { id: 'a1', name: 'Руководитель', role: 'admin', phone: '+79000000001' },
  { id: 'm1', name: 'Иванов Алексей Петрович', role: 'master', masterId: '1', phone: '+79012345678' },
  { id: 'm2', name: 'Сидорова Мария Владимировна', role: 'master', masterId: '2', phone: '+79023456789' },
  { id: 'm3', name: 'Петров Дмитрий Сергеевич', role: 'master', masterId: '3', phone: '+79034567890' },
];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [clients, setClients] = useState<Client[]>(MOCK_CLIENTS);
  const [masters, setMasters] = useState<Master[]>(MASTERS);
  const [currentPage, setCurrentPage] = useState('dashboard');

  const login = useCallback((phone: string, password: string): boolean => {
    const cleanPhone = phone.replace(/\D/g, '');
    const found = DEMO_USERS.find(u => u.phone.replace(/\D/g, '') === cleanPhone);
    if (found && password === '1234') {
      setUser(found);
      setCurrentPage(found.role === 'admin' ? 'upload' : 'dashboard');
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setCurrentPage('dashboard');
  }, []);

  const updateClient = useCallback((id: string, updates: Partial<Client>) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const addMaster = useCallback((master: Omit<Master, 'id'>) => {
    setMasters(prev => [...prev, { ...master, id: String(Date.now()) }]);
  }, []);

  const removeMaster = useCallback((id: string) => {
    setMasters(prev => prev.filter(m => m.id !== id));
  }, []);

  const toggleMaster = useCallback((id: string) => {
    setMasters(prev => prev.map(m => m.id === id ? { ...m, active: !m.active } : m));
  }, []);

  return (
    <AppContext.Provider value={{
      user, login, logout,
      clients, masters,
      updateClient, addMaster, removeMaster, toggleMaster,
      currentPage, setCurrentPage,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
