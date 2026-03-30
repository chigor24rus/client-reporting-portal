import { useMemo, useState, useCallback, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import type { ClientCard } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import DashboardStats from '@/components/dashboard/DashboardStats';
import ClientCardRow from '@/components/dashboard/ClientCardRow';
import ClientBirthdayRow from '@/components/dashboard/ClientBirthdayRow';
import { apiSearchClients, apiGetMastersStats } from '@/lib/api';
import { CALL_RESULTS } from '@/data/mockData';

type MasterStat = { userId: string; name: string; total: number; done: number; rate: number };

const RESULT_COLORS: Record<string, string> = {
  '1': 'hsl(142 72% 42%)', '2_oil': 'hsl(200 80% 48%)', '2_brake': 'hsl(200 80% 55%)',
  '2_gearbox': 'hsl(200 80% 62%)', '2_coolant': 'hsl(200 80% 68%)', '3': 'hsl(0 70% 50%)',
  '4': 'hsl(0 70% 40%)', '5': 'hsl(38 92% 52%)', '6': 'hsl(38 80% 60%)',
  '9': 'hsl(142 50% 55%)', '7': 'hsl(215 12% 52%)', '8': 'hsl(215 12% 38%)',
};

export default function DashboardPage() {
  const { clientCards, clients, apiUsers, syncClientResult, loadingClients, user } = useApp();
  const [filter, setFilter] = useState<'all' | 'pending' | 'done' | 'birthday' | 'search'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ClientCard[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [mastersStats, setMastersStats] = useState<MasterStat[]>([]);

  useEffect(() => {
    apiGetMastersStats().then(({ status, data }) => {
      if (status === 200) setMastersStats((data as { stats: MasterStat[] }).stats);
    });
  }, []);

  const masters = apiUsers.filter(u => u.role === 'master' && u.active);

  const birthdayCount = useMemo(() => clientCards.filter(c => c.isBirthday).length, [clientCards]);

  const filtered = useMemo(() => {
    if (filter === 'birthday') return clientCards.filter(c => c.isBirthday);
    if (filter === 'pending') return clientCards.filter(c => c.status !== 'done');
    if (filter === 'done') return clientCards.filter(c => c.status === 'done');
    return clientCards.filter(c => !c.isDeferred);
  }, [clientCards, filter]);

  const pending = clientCards.filter(c => c.status !== 'done').length;
  const done = clientCards.filter(c => c.status === 'done').length;
  const total = clientCards.length;

  const masterStats = useMemo(() => {
    return masters.map(m => {
      const mClients = clients.filter(c => c.masterId === m.masterId && !c.isExcluded);
      const mDone = mClients.filter(c => c.status === 'done').length;
      return {
        name: m.name.split(' ')[0] + ' ' + (m.name.split(' ')[1]?.[0] || '') + '.',
        total: mClients.length,
        done: mDone,
        rate: mClients.length ? Math.round((mDone / mClients.length) * 100) : 0,
      };
    });
  }, [masters, clients]);

  // Персональная статистика мастера
  const now = new Date();
  const personalMonthStats = useMemo(() => {
    const counts: Record<string, number> = {};
    clientCards.flatMap(c => c.works).forEach(w => {
      if (w.result) counts[w.result] = (counts[w.result] || 0) + 1;
    });
    return Object.entries(counts).map(([val, count]) => {
      const r = CALL_RESULTS.find(r => r.value === val);
      return { result: val, label: r?.label || val, count, color: RESULT_COLORS[val] || 'hsl(215 12% 52%)' };
    }).filter(s => s.count > 0).sort((a, b) => b.count - a.count);
  }, [clientCards]);

  const personalQuarterStats = useMemo(() => {
    const months = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const name = d.toLocaleDateString('ru-RU', { month: 'long' });
      months.push({ name: name.charAt(0).toUpperCase() + name.slice(1), done: 0, pending: 0 });
    }
    // Пока данных по датам нет — показываем текущие итоги в последнем месяце
    const totalDone = clientCards.flatMap(c => c.works).filter(w => w.status === 'done').length;
    const totalPending = clientCards.flatMap(c => c.works).filter(w => w.status === 'pending' && !w.isUpcoming).length;
    if (months.length > 0) {
      months[months.length - 1].done = totalDone;
      months[months.length - 1].pending = totalPending;
    }
    return months;
  }, [clientCards]);

  const handleSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      setSearchDone(false);
      return;
    }
    setSearchLoading(true);
    setSearchDone(false);
    const { status, data } = await apiSearchClients(q.trim());
    if (status === 200) {
      setSearchResults((data as { clients: ClientCard[] }).clients);
    }
    setSearchLoading(false);
    setSearchDone(true);
  }, []);

  function onSearchChange(val: string) {
    setSearchQuery(val);
    if (val.trim().length < 2) {
      setSearchResults([]);
      setSearchDone(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <DashboardStats
        pending={pending}
        done={done}
        total={total}
        birthdayCount={birthdayCount}
        currentUserId={user?.id}
        mastersStats={mastersStats}
        personalMonthStats={personalMonthStats}
        personalQuarterStats={personalQuarterStats}
      />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">
            Список клиентов
            {filter !== 'search' && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">({filtered.length} записей)</span>
            )}
          </h2>
          <div className="flex gap-1 bg-secondary rounded-lg p-1 flex-wrap">
            {([
              ['all', 'Все'],
              ['pending', 'Ожидают'],
              ['done', 'Обработаны'],
              ['birthday', '🎂 Именинники'],
              ['search', '🔍 Поиск'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${filter === val
                  ? (val === 'birthday' ? 'bg-pink-500/20 text-pink-300 shadow' : 'bg-card text-foreground shadow')
                  : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filter === 'search' ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => onSearchChange(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch(searchQuery)}
                  placeholder="Ф.И.О., телефон или VIN..."
                  className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 text-foreground placeholder:text-muted-foreground"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchDone(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <Icon name="X" size={14} />
                  </button>
                )}
              </div>
              <button
                onClick={() => handleSearch(searchQuery)}
                disabled={searchQuery.trim().length < 2 || searchLoading}
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl disabled:opacity-50 hover:bg-primary/90 transition-all flex items-center gap-2"
              >
                {searchLoading && <Icon name="Loader2" size={14} className="animate-spin" />}
                Найти
              </button>
            </div>

            {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
              <p className="text-sm text-muted-foreground text-center py-4">Введите минимум 2 символа</p>
            )}

            {searchLoading && (
              <div className="flex items-center gap-3 text-muted-foreground py-8 justify-center">
                <Icon name="Loader2" size={18} className="animate-spin" />
                <span className="text-sm">Поиск...</span>
              </div>
            )}

            {!searchLoading && searchDone && searchResults.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Icon name="UserX" size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Клиент не найден</p>
              </div>
            )}

            {!searchLoading && searchResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground px-1">Найдено: {searchResults.length}</p>
                {searchResults.map((card, i) => (
                  card.isBirthday && card.works.length === 0
                    ? <ClientBirthdayRow key={`${card.phone}-${i}`} card={card} onSync={syncClientResult} />
                    : <ClientCardRow key={`${card.phone}-${i}`} card={card} onSync={syncClientResult} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {loadingClients && filtered.length === 0 && (
              <div className="flex items-center gap-3 text-muted-foreground py-8 justify-center">
                <Icon name="Loader2" size={18} className="animate-spin" />
                <span className="text-sm">Загрузка клиентов...</span>
              </div>
            )}
            {filtered.map((card, i) => (
              card.isBirthday && card.works.length === 0
                ? <ClientBirthdayRow key={`${card.phone}-${i}`} card={card} onSync={syncClientResult} />
                : <ClientCardRow key={`${card.phone}-${i}`} card={card} onSync={syncClientResult} />
            ))}
            {!loadingClients && filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Icon name="Inbox" size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Нет записей</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}