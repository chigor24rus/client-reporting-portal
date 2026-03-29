import { useState } from 'react';
import Icon from '@/components/ui/icon';
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

type MasterStat = {
  name: string;
  total: number;
  done: number;
  rate: number;
};

type Props = {
  pending: number;
  done: number;
  total: number;
  birthdayCount: number;
  masterStats: MasterStat[];
};

export default function DashboardStats({ pending, done, total, birthdayCount, masterStats }: Props) {
  const [chartPeriod, setChartPeriod] = useState<'month' | 'quarter'>('month');

  return (
    <>
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
          {birthdayCount > 0 && (
            <div className="metric-card !p-3 !rounded-lg flex items-center gap-2.5 border-pink-500/20">
              <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center flex-shrink-0 text-base">🎂</div>
              <div>
                <p className="text-lg font-bold text-pink-400 leading-tight">{birthdayCount}</p>
                <p className="text-xs text-muted-foreground">Именинники</p>
              </div>
            </div>
          )}
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
                <button key={p} onClick={() => setChartPeriod(p)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${chartPeriod === p ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>
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
            )) : <p className="text-sm text-muted-foreground">Нет данных</p>}
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
    </>
  );
}
