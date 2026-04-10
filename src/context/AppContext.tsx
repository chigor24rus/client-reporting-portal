import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  apiLogin, apiLogout, apiGetMe,
  apiGetUsers, apiCreateUser, apiUpdateUser, apiDeleteUser,
  apiGetClients, apiLockClient, apiUnlockClient, apiUpdateClient,
  apiImpersonate,
  getToken,
} from '@/lib/api';
import { MOCK_CLIENTS } from '@/data/mockData';
import type { Client } from '@/data/mockData';

export type WorkItem = {
  id: string;
  vin: string;
  work: string;
  workDate: string | null;
  mileage: number | null;
  orderNumber: string | null;
  status: 'pending' | 'done';
  result: string | null;
  resultNote: string | null;
  callbackDate: string | null;
  isUpcoming: boolean;
  isNoData?: boolean;
  urgencySeconds: number;
  ageMonths: number;
  nextServiceDate: string | null;
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
  isImpersonated?: boolean;
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
  loginAs: (userId: string, masterPassword: string) => Promise<string | null>;
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

function mapApiUser(u: ApiUser & { is_impersonated?: boolean }): User {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    masterId: u.masterId || undefined,
    isImpersonated: u.is_impersonated || false,
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
      const u = (data as { user: ApiUser & { is_impersonated?: boolean } }).user;
      setUser(mapApiUser(u));
      setCurrentPage(u.role === 'admin' ? 'statistics' : 'dashboard');
      return null;
    }
    return (data as { error: string }).error || 'Ошибка входа';
  }, []);

  const loginAs = useCallback(async (userId: string, masterPassword: string): Promise<string | null> => {
    const { status, data } = await apiImpersonate(userId, masterPassword);
    if (status === 200) {
      const u = (data as { user: ApiUser & { is_impersonated?: boolean } }).user;
      setUser(mapApiUser(u));
      setClients([]);
      setClientCards([]);
      setCurrentPage('dashboard');
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
    // Админ не грузит весь список — поиск идёт через отдельный API
    if (user?.role === 'admin') {
      setClients([]);
      setClientCards([]);
      setLoadingClients(false);
      return;
    }
    const params = user?.id ? { user_id: user.id } : undefined;
    let { status, data } = await apiGetClients(params);
    if (status !== 200) {
      await new Promise(r => setTimeout(r, 2000));
      ({ status, data } = await apiGetClients(params));
    }
    if (status === 200) {
      const raw = (data as { clients: Record<string, unknown>[] }).clients;
      if (raw.length > 0) {
        setClientCards(raw as unknown as ClientCard[]);
        setClients([]);
      } else {
        setClientCards([]);
        setClients([]);
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
      // Обновляем плоский список (для админа)
      setClients(prev => prev.map(c => c.id === id ? {
        ...c,
        result,
        resultNote: note,
        callbackDate: callbackDate || null,
        status: 'done',
        isExcluded: ['3', '4'].includes(result),
      } : c));

      // Обновляем карточки мастера без перезагрузки страницы
      const PENDING_RESULTS = new Set(['7', '5']);
      const newStatus = !result || PENDING_RESULTS.has(result) ? 'pending' : 'done';
      const isDeferred = result === '5' && !!callbackDate;
      const today = new Date().toISOString().slice(0, 10);

      setClientCards(prev => {
        return prev
          .map(card => {
            const hasWork = card.works.some(w => w.id === id);
            if (!hasWork) return card;

            const updatedWorks = card.works.map(w =>
              w.id === id
                ? { ...w, result, resultNote: note, callbackDate: callbackDate || null, status: newStatus as 'pending' | 'done' }
                : w
            );

            // Если результат '1' — закрываем все остальные активные работы
            const finalWorks = result === '1'
              ? updatedWorks.map(w => w.id === id ? w : (!w.isUpcoming && w.status === 'pending' ? { ...w, result: '1', status: 'done' as const } : w))
              : updatedWorks;

            const activeWorks = finalWorks.filter(w => !w.isUpcoming);
            const cardStatus = activeWorks.length > 0 && activeWorks.every(w => w.status === 'done') ? 'done' : 'pending';

            return { ...card, works: finalWorks, status: cardStatus };
          })
          // Убираем из списка клиентов у которых все активные работы закрыты
          // и они не отложены (result=5 с будущей датой)
          .filter(card => {
            const activeWorks = card.works.filter(w => !w.isUpcoming);
            const allDone = activeWorks.length > 0 && activeWorks.every(w => w.status === 'done');
            if (!allDone) return true;
            // Оставляем отложенных с будущей датой созвона
            const hasDeferred = activeWorks.some(w => w.result === '5' && w.callbackDate && w.callbackDate > today);
            return hasDeferred;
          });
      });
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
      user, authLoading, login, loginAs, logout,
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