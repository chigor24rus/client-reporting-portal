import React, { createContext, useContext, useState, useCallback } from 'react';
import { MOCK_CLIENTS, MASTERS, type Client, type Master } from '@/data/mockData';

type User = {
  id: string;
  name: string;
  role: 'master' | 'admin';
  masterId?: string;
  phone: string;
};

export type Admin = {
  id: string;
  name: string;
  phone: string;
  password: string;
  createdAt: string;
};

type AppContextType = {
  user: User | null;
  login: (phone: string, password: string) => boolean;
  logout: () => void;
  clients: Client[];
  masters: Master[];
  admins: Admin[];
  updateClient: (id: string, updates: Partial<Client>) => void;
  addMaster: (master: Omit<Master, 'id'>) => void;
  removeMaster: (id: string) => void;
  toggleMaster: (id: string) => void;
  addAdmin: (admin: Omit<Admin, 'id' | 'createdAt'>) => boolean;
  removeAdmin: (id: string) => void;
  changeAdminPassword: (id: string, newPassword: string) => void;
  currentPage: string;
  setCurrentPage: (page: string) => void;
};

const AppContext = createContext<AppContextType | null>(null);

const INITIAL_ADMINS: Admin[] = [
  { id: 'a1', name: 'Руководитель', phone: '+79000000001', password: '1234', createdAt: '2025-01-01' },
];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [clients, setClients] = useState<Client[]>(MOCK_CLIENTS);
  const [masters, setMasters] = useState<Master[]>(MASTERS);
  const [admins, setAdmins] = useState<Admin[]>(INITIAL_ADMINS);
  const [currentPage, setCurrentPage] = useState('dashboard');

  const MASTER_USERS: User[] = [
    { id: 'm1', name: 'Иванов Алексей Петрович', role: 'master', masterId: '1', phone: '+79012345678' },
    { id: 'm2', name: 'Сидорова Мария Владимировна', role: 'master', masterId: '2', phone: '+79023456789' },
    { id: 'm3', name: 'Петров Дмитрий Сергеевич', role: 'master', masterId: '3', phone: '+79034567890' },
  ];

  const login = useCallback((phone: string, password: string): boolean => {
    const cleanPhone = phone.replace(/\D/g, '');

    const foundAdmin = admins.find(
      a => a.phone.replace(/\D/g, '') === cleanPhone && a.password === password
    );
    if (foundAdmin) {
      setUser({ id: foundAdmin.id, name: foundAdmin.name, role: 'admin', phone: foundAdmin.phone });
      setCurrentPage('upload');
      return true;
    }

    const foundMaster = MASTER_USERS.find(u => u.phone.replace(/\D/g, '') === cleanPhone);
    if (foundMaster && password === '1234') {
      setUser(foundMaster);
      setCurrentPage('dashboard');
      return true;
    }

    return false;
  }, [admins]);

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

  const addAdmin = useCallback((admin: Omit<Admin, 'id' | 'createdAt'>): boolean => {
    const cleanPhone = admin.phone.replace(/\D/g, '');
    const exists = admins.some(a => a.phone.replace(/\D/g, '') === cleanPhone);
    if (exists) return false;
    setAdmins(prev => [...prev, {
      ...admin,
      id: String(Date.now()),
      createdAt: new Date().toISOString().slice(0, 10),
    }]);
    return true;
  }, [admins]);

  const removeAdmin = useCallback((id: string) => {
    setAdmins(prev => prev.filter(a => a.id !== id));
  }, []);

  const changeAdminPassword = useCallback((id: string, newPassword: string) => {
    setAdmins(prev => prev.map(a => a.id === id ? { ...a, password: newPassword } : a));
  }, []);

  return (
    <AppContext.Provider value={{
      user, login, logout,
      clients, masters, admins,
      updateClient, addMaster, removeMaster, toggleMaster,
      addAdmin, removeAdmin, changeAdminPassword,
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
