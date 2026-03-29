import { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import { CALL_RESULTS, WORK_INTERVALS } from '@/data/mockData';
import type { Client } from '@/data/mockData';
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

const STATUS_COLORS: Record<string, string> = {
  '1': 'bg-success/15 text-success border-success/30',
  '2_oil': 'bg-info/15 text-info border-info/30',
  '2_brake': 'bg-info/15 text-info border-info/30',
  '2_gearbox': 'bg-info/15 text-info border-info/30',
  '2_coolant': 'bg-info/15 text-info border-info/30',
  '3': 'bg-destructive/15 text-destructive border-destructive/30',
  '4': 'bg-destructive/15 text-destructive border-destructive/30',
  '5': 'bg-warning/15 text-warning border-warning/30',
  '6': 'bg-muted text-muted-foreground border-border',
  '7': 'bg-muted text-muted-foreground border-border',
};

function ClientRow({ client, onSync }: {
  client: Client;
  onSync: (id: string, result: string, note: string, callbackDate: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState(client.result || '');
  const [note, setNote] = useState(client.resultNote || '');
  const [callbackDate, setCallbackDate] = useState(client.callbackDate || '');
  const [saving, setSaving] = useState(false);

  function handleExpand() {
    setExpanded(prev => !prev);
  }

  const workLabel = WORK_INTERVALS[client.work]?.label || client.work;
  const resultLabel = CALL_RESULTS.find(r => r.value === client.result)?.label;

  async function handleSave() {
    setSaving(true);
    await onSync(client.id, result, note, callbackDate);
    setSaving(false);
    setExpanded(false);
    // блокировка снимается на бэкенде при PATCH
  }

  const needsNote = ['3', '5', '6'].includes(result);
  const needsCallback = result === '5';

  return (
    <div className={`border border-border rounded-xl overflow-hidden transition-all duration-200 ${expanded ? 'shadow-lg shadow-black/20' : ''}`}>
      <div
        className={`flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors ${client.status === 'done' ? 'bg-success/5' : 'bg-card'}`}
        onClick={handleExpand}
      >
        <div className="flex-1 min-w-0 grid grid-cols-[1fr_120px_140px_120px_100px] gap-4 items-center">
          <div>
            <p className="text-sm font-semibold text-foreground truncate">{client.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{client.phone}</p>
          </div>
          <div>
            <p className="text-xs font-mono text-muted-foreground truncate">{client.vin}</p>
          </div>
          <div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-secondary text-foreground border border-border">
              {workLabel}
            </span>
          </div>
          <div>
            <p className="text-xs text-foreground">{new Date(client.workDate).toLocaleDateString('ru-RU')}</p>
            <p className="text-xs text-muted-foreground">{client.mileage.toLocaleString()} км</p>
          </div>
          <div>
            {client.result ? (
              <span className={`status-badge border ${STATUS_COLORS[client.result] || 'bg-muted text-muted-foreground border-border'}`}>
                {client.result === '7' ? 'Нет ответа' : client.result.startsWith('2') ? 'Записан' : client.result === '1' ? 'Все работы' : resultLabel?.slice(0, 12)}
              </span>
            ) : (
              <span className="status-badge bg-warning/10 text-warning border border-warning/30">
                Не обработан
              </span>
            )}
          </div>
        </div>
        <Icon
          name={expanded ? 'ChevronUp' : 'ChevronDown'}
          size={16}
          className="text-muted-foreground flex-shrink-0 transition-transform"
        />
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-3 bg-secondary/20 border-t border-border animate-fade-in">
          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            <div>
              <span className="text-muted-foreground">Заказ-наряд:</span>{' '}
              <span className="font-mono text-foreground">{client.orderNumber}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Выполненная работа:</span>{' '}
              <span className="text-foreground">{client.work}</span>
            </div>
          </div>

          <div className="space-y-3">
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
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {result === '6' ? 'Причина смены сервиса / готовность вернуться' : 'Причина / комментарий'}
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Введите комментарий..."
                  rows={2}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            )}

            {needsCallback && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Дата повторного созвона
                </label>
                <input
                  type="date"
                  value={callbackDate}
                  onChange={e => setCallbackDate(e.target.value)}
                  className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setExpanded(false)}
                className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !result || (needsNote && !note) || (needsCallback && !callbackDate)}
                className="px-4 py-1.5 text-sm bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user, clients, apiUsers, syncClientResult, loadingClients } = useApp();
  const [chartPeriod, setChartPeriod] = useState<'month' | 'quarter'>('month');
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');

  const masters = apiUsers.filter(u => u.role === 'master' && u.active);

  const myClients = useMemo(() => {
    // Мастер видит всех незаблокированных + тех, что заблокировал сам (бэкенд уже фильтрует)
    // Здесь просто исключаем обработанных
    return clients.filter(c => !c.isExcluded);
  }, [clients]);

  const filtered = useMemo(() => {
    if (filter === 'all') return myClients;
    return myClients.filter(c => c.status === filter);
  }, [myClients, filter]);

  const pending = myClients.filter(c => c.status === 'pending').length;
  const done = myClients.filter(c => c.status === 'done').length;
  const total = myClients.length;

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
                <Tooltip
                  contentStyle={{ background: 'hsl(220 14% 11%)', border: '1px solid hsl(220 12% 18%)', borderRadius: '8px', fontSize: 12 }}
                  labelStyle={{ color: 'hsl(210 20% 88%)' }}
                />
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
            {masterStats.map((m, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-foreground">{m.name}</span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {m.done}/{m.total} — <span className="text-foreground font-semibold">{m.rate}%</span>
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${m.rate}%`,
                      background: m.rate >= 70 ? 'hsl(142 72% 42%)' : m.rate >= 40 ? 'hsl(38 92% 52%)' : 'hsl(0 70% 50%)',
                    }}
                  />
                </div>
              </div>
            ))}
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
              <p className="text-lg font-bold text-primary">
                {total ? Math.round((done / total) * 100) : 0}%
              </p>
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

        <div className="hidden md:grid grid-cols-[1fr_120px_140px_120px_100px_16px] gap-4 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border mb-2">
          <span>Клиент / телефон</span>
          <span>VIN</span>
          <span>Работа</span>
          <span>Дата / пробег</span>
          <span>Статус</span>
          <span />
        </div>

        <div className="space-y-2">
          {loadingClients && filtered.length === 0 && (
            <div className="flex items-center gap-3 text-muted-foreground py-8 justify-center">
              <Icon name="Loader2" size={18} className="animate-spin" />
              <span className="text-sm">Загрузка клиентов...</span>
            </div>
          )}
          {filtered.map(client => (
            <ClientRow key={client.id} client={client} onSync={syncClientResult} />
          ))}
          {filtered.length === 0 && (
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