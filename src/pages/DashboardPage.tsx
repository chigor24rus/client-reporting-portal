import { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import type { ClientCard, WorkItem } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import { CALL_RESULTS, WORK_INTERVALS } from '@/data/mockData';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';

const CHART_DATA_MONTH = [
  { name: '01 мар', total: 12, done: 5 },
  { name: '05 мар', total: 18, done: 9 },
  { name: '10 мар', total: 24, done: 14 },
  { name: '15 мар', total: 31, done: 20 },
  { name: '20 мар', total: 38, done: 27 },
  { name: '25 мар', total: 44, done: 33 },
  { name: '29 мар', total: 48, done: 37 },
];

const CHART_DATA_QUARTER = [
  { name: 'Январь', Иванов: 18, Сидорова: 22, Петров: 15 },
  { name: 'Февраль', Иванов: 24, Сидорова: 19, Петров: 21 },
  { name: 'Март', Иванов: 31, Сидорова: 28, Петров: 25 },
];

function WorkRow({
  work,
  onSync,
}: {
  work: WorkItem;
  onSync: (id: string, result: string, note: string, callbackDate: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState(work.result || '');
  const [note, setNote] = useState(work.resultNote || '');
  const [callbackDate, setCallbackDate] = useState(work.callbackDate || '');
  const [saving, setSaving] = useState(false);

  const workLabel = WORK_INTERVALS[work.work]?.label || work.work;
  const resultLabel = CALL_RESULTS.find(r => r.value === work.result)?.label;
  const needsNote = ['3', '5', '6'].includes(result);
  const needsCallback = result === '5';

  async function handleSave() {
    setSaving(true);
    await onSync(work.id, result, note, callbackDate);
    setSaving(false);
    setExpanded(false);
  }

  if (work.isUpcoming) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/40 border border-dashed border-border">
        <Icon name="Clock" size={14} className="text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-foreground">{workLabel}</span>
          <span className="ml-2 text-xs text-muted-foreground font-mono">{work.vin}</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20 flex-shrink-0">
          Предстоящие
        </span>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {new Date(work.workDate).toLocaleDateString('ru-RU')}
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border transition-all duration-200 ${expanded ? 'border-primary/40 shadow-sm shadow-primary/10' : 'border-border'}`}>
      <div
        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-secondary/30 rounded-lg transition-colors ${work.status === 'done' ? 'bg-success/5' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0 grid grid-cols-[140px_1fr_110px_100px] gap-3 items-center">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-secondary text-foreground border border-border w-fit">
            {workLabel}
          </span>
          <span className="text-xs font-mono text-muted-foreground truncate">{work.vin}</span>
          <div>
            <p className="text-xs text-foreground">{new Date(work.workDate).toLocaleDateString('ru-RU')}</p>
            <p className="text-xs text-muted-foreground">{work.mileage?.toLocaleString()} км</p>
          </div>
          <div>
            {work.result ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                {resultLabel?.slice(0, 14) || work.result}
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
                Не обработан
              </span>
            )}
          </div>
        </div>
        <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-muted-foreground flex-shrink-0" />
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-border space-y-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>Заказ-наряд: <span className="text-foreground font-mono">{work.orderNumber}</span></div>
            <div>Просрочено: <span className="text-foreground">{Math.max(0, Math.floor(work.ageMonths - (WORK_INTERVALS[work.work]?.min || 0)))} мес.</span></div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Результат обработки
            </label>
            <select
              value={result}
              onChange={e => setResult(e.target.value)}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Выберите результат —</option>
              {CALL_RESULTS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          {needsNote && (
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={result === '6' ? 'Причина смены сервиса...' : 'Комментарий...'}
              rows={2}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          )}
          {needsCallback && (
            <input
              type="date"
              value={callbackDate}
              onChange={e => setCallbackDate(e.target.value)}
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setExpanded(false)}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !result || (needsNote && !note) || (needsCallback && !callbackDate)}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-1.5"
            >
              {saving && <Icon name="Loader2" size={12} className="animate-spin" />}
              Сохранить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientCardRow({
  card,
  onSync,
}: {
  card: ClientCard;
  onSync: (id: string, result: string, note: string, callbackDate: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeWorks = card.works.filter(w => !w.isUpcoming);
  const upcomingWorks = card.works.filter(w => w.isUpcoming);
  const allDone = activeWorks.length > 0 && activeWorks.every(w => w.status === 'done');

  return (
    <div className={`border border-border rounded-xl overflow-hidden transition-all duration-200 ${expanded ? 'shadow-lg shadow-black/20' : ''}`}>
      <div
        className={`flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors ${allDone ? 'bg-success/5' : 'bg-card'}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <p className="text-sm font-semibold text-foreground">{card.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{card.phone}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {activeWorks.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {activeWorks.length} {activeWorks.length === 1 ? 'работа' : 'работ'}
              </span>
            )}
            {upcomingWorks.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
                +{upcomingWorks.length} предстоящих
              </span>
            )}
            {allDone ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                Обработан
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
                Не обработан
              </span>
            )}
          </div>
        </div>
        <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={16} className="text-muted-foreground flex-shrink-0" />
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-3 bg-secondary/10 border-t border-border animate-fade-in space-y-2">
          {card.works.map(w => (
            <WorkRow key={w.id} work={w} onSync={onSync} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { clientCards, clients, apiUsers, syncClientResult, loadingClients } = useApp();
  const [chartPeriod, setChartPeriod] = useState<'month' | 'quarter'>('month');
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');

  const masters = apiUsers.filter(u => u.role === 'master' && u.active);

  const filtered = useMemo(() => {
    if (filter === 'all') return clientCards;
    if (filter === 'pending') return clientCards.filter(c => c.status !== 'done');
    return clientCards.filter(c => c.status === 'done');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Рабочий стол</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="metric-card !p-3 !rounded-lg flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0">
              <Icon name="Clock" size={16} className="text-warning" />
            </div>
            <div>
              <p className="text-lg font-bold text-warning leading-tight">{pending}</p>
              <p className="text-xs text-muted-foreground">Ожидают</p>
            </div>
          </div>
          <div className="metric-card !p-3 !rounded-lg flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
              <Icon name="CheckCircle2" size={16} className="text-success" />
            </div>
            <div>
              <p className="text-lg font-bold text-success leading-tight">{done}</p>
              <p className="text-xs text-muted-foreground">Обработано</p>
            </div>
          </div>
          <div className="metric-card !p-3 !rounded-lg flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center flex-shrink-0">
              <Icon name="Users" size={16} className="text-info" />
            </div>
            <div>
              <p className="text-lg font-bold text-info leading-tight">{total}</p>
              <p className="text-xs text-muted-foreground">Всего</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="metric-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Динамика обработки</p>
              <p className="text-xs text-muted-foreground">За текущий месяц</p>
            </div>
            <div className="flex gap-1 bg-secondary rounded-lg p-1">
              {(['month', 'quarter'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${chartPeriod === p ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {p === 'month' ? 'Месяц' : 'Квартал'}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            {chartPeriod === 'month' ? (
              <AreaChart data={CHART_DATA_MONTH}>
                <defs>
                  <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(200 80% 48%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(200 80% 48%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142 72% 42%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142 72% 42%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
                <XAxis dataKey="name" tick={{ fill: 'hsl(215 12% 52%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(215 12% 52%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(220 14% 11%)', border: '1px solid hsl(220 12% 18%)', borderRadius: '8px', fontSize: 12 }} labelStyle={{ color: 'hsl(210 20% 88%)' }} />
                <Area type="monotone" dataKey="total" stroke="hsl(200 80% 48%)" fill="url(#gTotal)" strokeWidth={2} name="Всего" />
                <Area type="monotone" dataKey="done" stroke="hsl(142 72% 42%)" fill="url(#gDone)" strokeWidth={2} name="Обработано" />
              </AreaChart>
            ) : (
              <BarChart data={CHART_DATA_QUARTER}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
                <XAxis dataKey="name" tick={{ fill: 'hsl(215 12% 52%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(215 12% 52%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(220 14% 11%)', border: '1px solid hsl(220 12% 18%)', borderRadius: '8px', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Иванов" fill="hsl(38 92% 52%)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Сидорова" fill="hsl(200 80% 48%)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Петров" fill="hsl(142 72% 42%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        <div className="metric-card">
          <p className="text-sm font-semibold text-foreground mb-4">Эффективность мастеров</p>
          <div className="space-y-3">
            {masterStats.length > 0 ? masterStats.map((m, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-foreground">{m.name}</span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {m.done}/{m.total} — <span className="text-foreground font-semibold">{m.rate}%</span>
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${m.rate}%`, background: m.rate >= 70 ? 'hsl(142 72% 42%)' : m.rate >= 40 ? 'hsl(38 92% 52%)' : 'hsl(0 70% 50%)' }} />
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">Нет данных</p>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-foreground">{total}</p>
              <p className="text-xs text-muted-foreground">Клиентов</p>
            </div>
            <div>
              <p className="text-lg font-bold text-success">{done}</p>
              <p className="text-xs text-muted-foreground">Обработано</p>
            </div>
            <div>
              <p className="text-lg font-bold text-primary">{total ? Math.round((done / total) * 100) : 0}%</p>
              <p className="text-xs text-muted-foreground">Готовность</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">
            Список клиентов
            <span className="ml-2 text-xs font-normal text-muted-foreground">({filtered.length} записей)</span>
          </h2>
          <div className="flex gap-1 bg-secondary rounded-lg p-1">
            {([['all', 'Все'], ['pending', 'Ожидают'], ['done', 'Обработаны']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${filter === val ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
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
            <ClientCardRow key={`${card.phone}-${i}`} card={card} onSync={syncClientResult} />
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
