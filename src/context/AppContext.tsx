import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  apiLogin, apiLogout, apiGetMe,
  apiGetUsers, apiCreateUser, apiUpdateUser, apiDeleteUser,
  apiGetClients, apiLockClient, apiUnlockClient, apiUpdateClient,
  getToken,
} from '@/lib/api';
import { MOCK_CLIENTS } from '@/data/mockData';
import type { Client } from '@/data/mockData';

export type WorkItem = {
  id: string;
  vin: string;
  work: string;
  workDate: string;
  mileage: number;
  orderNumber: string;
  status: 'pending' | 'done';
  result: string | null;
  resultNote: string | null;
  callbackDate: string | null;
  isUpcoming: boolean;
  urgencySeconds: number;
  ageMonths: number;
  nextServiceDate: string;
};

export type ClientCard = {
  phone: string;
  name: string;
  birthDate?: string | null;
  totalSpent?: number | null;
  isBirthday?: boolean;
  isDeferred?: boolean;
  cardCallbackDate?: string | null;
  works: WorkItem[];
  status: 'pending' | 'done';
  lockedBy?: string | null;
  lockedAt?: string | null;
  lockedByName?: string | null;
};

export type User = {
  id: string;
  name: string;
  role: 'master' | 'admin';
  masterId?: string;
  phone: string;
};

export type ApiUser = {
  id: string;
  name: string;
  phone: string;
  role: 'admin' | 'master';
  active: boolean;
  createdAt: string | null;
  masterId: string | null;
  isTest?: boolean;
};

type AppContextType = {
  user: User | null;
  authLoading: boolean;
  login: (phone: string, password: string) => Promise<string | null>;
  logout: () => void;
  clients: Client[];
  clientCards: ClientCard[];
  apiUsers: ApiUser[];
  loadingUsers: boolean;
  loadingClients: boolean;
  updateClient: (id: string, updates: Partial<Client>) => void;
  lockClient: (id: string) => Promise<boolean>;
  unlockClient: (id: string) => Promise<void>;
  syncClientResult: (id: string, result: string, note: string, callbackDate: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
  createUser: (payload: { name: string; phone: string; password: string; role: string }) => Promise<string | null>;
  updateUserPassword: (id: string, payload: string | { phone?: string; password?: string }) => Promise<void>;
  removeUser: (id: string) => Promise<void>;
  toggleUserActive: (id: string, active: boolean) => Promise<void>;
  refreshClients: () => Promise<void>;
  currentPage: string;
  setCurrentPage: (page: string) => void;
};

const AppContext = createContext<AppContextType | null>(null);

function mapApiUser(u: ApiUser): User {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    masterId: u.masterId || undefined,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientCards, setClientCards] = useState<ClientCard[]>([]);
  const [apiUsers, setApiUsers] = useState<ApiUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');

  useEffect(() => {
    if (!getToken()) {
      setAuthLoading(false);
      return;
    }
    apiGetMe().then(({ status, data }) => {
      if (status === 200) {
        const u = (data as { user: ApiUser }).user;
        setUser(mapApiUser(u));
        setCurrentPage(u.role === 'admin' ? 'statistics' : 'dashboard');
      }
    }).finally(() => setAuthLoading(false));
  }, []);

  const login = useCallback(async (phone: string, password: string): Promise<string | null> => {
    const { status, data } = await apiLogin(phone, password);
    if (status === 200) {
      const u = (data as { user: ApiUser }).user;
      setUser(mapApiUser(u));
      setCurrentPage(u.role === 'admin' ? 'statistics' : 'dashboard');
      return null;
    }
    return (data as { error: string }).error || 'Ошибка входа';
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
    setApiUsers([]);
    setClients([]);
    setCurrentPage('dashboard');
  }, []);

  const refreshUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { status, data } = await apiGetUsers();
    if (status === 200) {
      setApiUsers((data as { users: ApiUser[] }).users);
    }
    setLoadingUsers(false);
  }, []);

  const refreshClients = useCallback(async () => {
    setLoadingClients(true);
    const params = user?.role === 'admin'
      ? { include_all: 'true' }
      : user?.id ? { user_id: user.id } : undefined;
    const { status, data } = await apiGetClients(params);
    if (status === 200) {
      const raw = (data as { clients: Record<string, unknown>[] }).clients;
      if (raw.length > 0) {
        if (user?.role === 'master') {
          // Новый формат: карточки с массивом works
          setClientCards(raw as unknown as ClientCard[]);
          setClients([]);
        } else {
          // Для админа — плоский список
          setClients(raw.map((c: Record<string, unknown>) => ({
            id: String(c.id),
            name: String(c.name),
            phone: String(c.phone || ''),
            vin: String(c.vin),
            work: String(c.work),
            workDate: String(c.workDate),
            mileage: Number(c.mileage) || 0,
            orderNumber: String(c.orderNumber || ''),
            masterId: c.masterId ? String(c.masterId) : null,
            status: String(c.status) as 'pending' | 'done',
            result: c.result ? String(c.result) : null,
            resultNote: c.resultNote ? String(c.resultNote) : null,
            callbackDate: c.callbackDate ? String(c.callbackDate) : null,
            isExcluded: Boolean(c.isExcluded),
            birthDate: c.birthDate ? String(c.birthDate) : null,
            totalSpent: c.totalSpent ? Number(c.totalSpent) : null,
            isTest: Boolean(c.isTest),
          })));
          setClientCards([]);
        }
      } else {
        setClients(user?.role === 'admin' ? MOCK_CLIENTS : []);
        setClientCards([]);
      }
    }
    setLoadingClients(false);
  }, [user]);

  useEffect(() => {
    if (user) {
      refreshClients();
      if (user.role === 'admin') refreshUsers();
    }
  }, [user, refreshClients, refreshUsers]);

  // Тихий поллинг блокировок каждые 10 сек для мастеров
  useEffect(() => {
    if (!user || user.role !== 'master') return;
    const interval = setInterval(async () => {
      const params = user.id ? { user_id: user.id } : undefined;
      const { status, data } = await apiGetClients(params);
      if (status === 200) {
        const raw = (data as { clients: Record<string, unknown>[] }).clients;
        if (raw.length > 0) {
          setClientCards(prev => prev.map(card => {
            const fresh = (raw as unknown as ClientCard[]).find(r => r.phone === card.phone);
            if (!fresh) return card;
            return { ...card, lockedBy: fresh.lockedBy, lockedAt: fresh.lockedAt, lockedByName: fresh.lockedByName };
          }));
        }
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [user]);

  const updateClient = useCallback((id: string, updates: Partial<Client>) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const lockClient = useCallback(async (id: string): Promise<boolean> => {
    if (!user) return false;
    const { status, data } = await apiLockClient(id, user.id);
    if (status === 200) return true;
    alert((data as { error: string }).error || 'Не удалось открыть карточку');
    return false;
  }, [user]);

  const unlockClient = useCallback(async (id: string): Promise<void> => {
    if (!user) return;
    await apiUnlockClient(id, user.id);
  }, [user]);

  const syncClientResult = useCallback(async (
    id: string, result: string, note: string, callbackDate: string
  ) => {
    const { status } = await apiUpdateClient(id, {
      result,
      result_note: note,
      callback_date: callbackDate || undefined,
      user_id: user?.id,
    });
    if (status === 200) {
      setClients(prev => prev.map(c => c.id === id ? {
        ...c,
        result,
        resultNote: note,
        callbackDate: callbackDate || null,
        status: 'done',
        isExcluded: ['3', '4'].includes(result),
      } : c));
    }
  }, [user]);

  const createUser = useCallback(async (payload: {
    name: string; phone: string; password: string; role: string;
  }): Promise<string | null> => {
    const { status, data } = await apiCreateUser(payload);
    if (status === 201) {
      await refreshUsers();
      return null;
    }
    return (data as { error: string }).error || 'Ошибка создания';
  }, [refreshUsers]);

  const updateUserPassword = useCallback(async (id: string, payload: string | { phone?: string; password?: string }) => {
    const data = typeof payload === 'string' ? { password: payload } : payload;
    await apiUpdateUser(id, data);
    await refreshUsers();
  }, [refreshUsers]);

  const removeUser = useCallback(async (id: string) => {
    await apiDeleteUser(id);
    await refreshUsers();
  }, [refreshUsers]);

  const toggleUserActive = useCallback(async (id: string, active: boolean) => {
    await apiUpdateUser(id, { active });
    await refreshUsers();
  }, [refreshUsers]);

  return (
    <AppContext.Provider value={{
      user, authLoading, login, logout,
      clients, clientCards, apiUsers, loadingUsers, loadingClients,
      updateClient, lockClient, unlockClient, syncClientResult,
      refreshUsers, createUser, updateUserPassword, removeUser, toggleUserActive,
      refreshClients,
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