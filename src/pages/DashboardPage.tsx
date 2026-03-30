import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import DashboardStats from '@/components/dashboard/DashboardStats';
import ClientCardRow from '@/components/dashboard/ClientCardRow';
import ClientBirthdayRow from '@/components/dashboard/ClientBirthdayRow';

export default function DashboardPage() {
  const { clientCards, clients, apiUsers, syncClientResult, loadingClients } = useApp();
  const [filter, setFilter] = useState<'all' | 'pending' | 'done' | 'birthday' | 'search'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const masters = apiUsers.filter(u => u.role === 'master' && u.active);

  const birthdayCount = useMemo(() => clientCards.filter(c => c.isBirthday).length, [clientCards]);

  const filtered = useMemo(() => {
    if (filter === 'birthday') return clientCards.filter(c => c.isBirthday);
    if (filter === 'pending') return clientCards.filter(c => c.status !== 'done');
    if (filter === 'done') return clientCards.filter(c => c.status === 'done');
    // «Все» — не показываем отложенных, они только в «Ожидают»
    return clientCards.filter(c => !c.isDeferred);
  }, [clientCards, filter]);

  const pending = clientCards.filter(c => c.status !== 'done').length;
  const done = clientCards.filter(c => c.status === 'done').length;
  const total = clientCards.length;

  const masterStats = useMemo(() => {
    return masters.map(m => {
      const mClients = clients.filter(c => c.masterId === (m.masterId || m.id) && !c.isExcluded);
      const mDone = mClients.filter(c => c.status === 'done').length;
      return {
        name: m.name.split(' ')[0] + ' ' + (m.name.split(' ')[1]?.[0] || '') + '.',
        total: mClients.length,
        done: mDone,
        rate: mClients.length ? Math.round((mDone / mClients.length) * 100) : 0,
      };
    });
  }, [masters, clients]);

  return (
    <div className="p-6 space-y-6">
      <DashboardStats
        pending={pending}
        done={done}
        total={total}
        birthdayCount={birthdayCount}
        masterStats={masterStats}
      />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">
            Список клиентов
            <span className="ml-2 text-xs font-normal text-muted-foreground">({filtered.length} записей)</span>
          </h2>
          <div className="flex gap-1 bg-secondary rounded-lg p-1">
            {([
              ['all', 'Все'],
              ['pending', 'Ожидают'],
              ['done', 'Обработаны'],
              ['birthday', '🎂 Именинники'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${filter === val ? (val === 'birthday' ? 'bg-pink-500/20 text-pink-300 shadow' : 'bg-card text-foreground shadow') : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

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
      </div>
    </div>
  );
}