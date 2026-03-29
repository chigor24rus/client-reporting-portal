import { useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import { CALL_RESULTS, WORK_INTERVALS } from '@/data/mockData';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';

const RESULT_COLORS: Record<string, string> = {
  '1': 'hsl(142 72% 42%)',
  '2_oil': 'hsl(200 80% 48%)',
  '2_brake': 'hsl(200 80% 55%)',
  '2_gearbox': 'hsl(200 80% 62%)',
  '2_coolant': 'hsl(200 80% 68%)',
  '3': 'hsl(0 70% 50%)',
  '4': 'hsl(0 70% 40%)',
  '5': 'hsl(38 92% 52%)',
  '6': 'hsl(38 80% 60%)',
  '7': 'hsl(215 12% 52%)',
};

export default function StatisticsPage() {
  const { clients = [], apiUsers = [] } = useApp();

  const summary = useMemo(() => {
    const all = (clients ?? []).filter(c => !c.isExcluded);
    const total = all.length;
    const done = all.filter(c => c.result !== null).length;
    const pending = all.filter(c => c.result === null).length;
    const excluded = clients.filter(c => c.isExcluded).length;

    const byResult = CALL_RESULTS.map(r => ({
      name: r.label,
      value: all.filter(c => c.result === r.value).length,
      color: RESULT_COLORS[r.value] || 'hsl(215 12% 52%)',
    })).filter(r => r.value > 0);

    const byWork = Object.entries(WORK_INTERVALS).map(([work, meta]) => ({
      name: meta.label,
      total: all.filter(c => c.work === work).length,
      done: all.filter(c => c.work === work && c.status === 'done').length,
    }));

    const masters = apiUsers.filter(u => u.role === 'master' && u.active);
    const byMaster = masters.map(m => {
      const mc = all.filter(c => c.masterId === (m.masterId || m.id));
      const md = mc.filter(c => c.result !== null).length;
      return {
        name: m.name.split(' ').slice(0, 2).join(' '),
        total: mc.length,
        done: md,
        pending: mc.filter(c => c.result === null).length,
        rate: mc.length ? Math.round((md / mc.length) * 100) : 0,
      };
    });

    return { total, done, pending, excluded, byResult, byWork, byMaster };
  }, [clients, masters]);

  const metrics = [
    { label: 'Всего клиентов', value: summary.total, icon: 'Users', color: 'text-info', bg: 'bg-info/10' },
    { label: 'Обработано', value: summary.done, icon: 'CheckCircle2', color: 'text-success', bg: 'bg-success/10' },
    { label: 'Ожидают', value: summary.pending, icon: 'Clock', color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'В архиве', value: summary.excluded, icon: 'Archive', color: 'text-muted-foreground', bg: 'bg-secondary' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Статистика</h1>
        <p className="text-sm text-muted-foreground">Сводные данные за текущий период</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {metrics.map(m => (
          <div key={m.label} className="metric-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{m.label}</p>
                <p className={`text-3xl font-bold ${m.color}`}>{m.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl ${m.bg} flex items-center justify-center`}>
                <Icon name={m.icon} size={20} className={m.color} />
              </div>
            </div>
            <div className="mt-3 h-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${summary.total ? Math.round((m.value / summary.total) * 100) : 0}%`,
                  background: 'hsl(var(--primary))',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="metric-card">
          <p className="text-sm font-semibold text-foreground mb-4">Распределение по результатам</p>
          {summary.byResult.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={summary.byResult} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                    {summary.byResult.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'hsl(220 14% 11%)', border: '1px solid hsl(220 12% 18%)', borderRadius: '8px', fontSize: 12 }}
                    labelStyle={{ color: 'hsl(210 20% 88%)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {summary.byResult.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                      <span className="text-muted-foreground truncate max-w-[200px]">{r.name}</span>
                    </div>
                    <span className="font-semibold text-foreground">{r.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              Нет данных об обработке
            </div>
          )}
        </div>

        <div className="metric-card">
          <p className="text-sm font-semibold text-foreground mb-4">По типам работ</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={summary.byWork} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
              <XAxis type="number" tick={{ fill: 'hsl(215 12% 52%)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(215 12% 52%)', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
              <Tooltip contentStyle={{ background: 'hsl(220 14% 11%)', border: '1px solid hsl(220 12% 18%)', borderRadius: '8px', fontSize: 12 }} />
              <Bar dataKey="total" name="Всего" fill="hsl(200 80% 48%)" radius={[0, 3, 3, 0]} />
              <Bar dataKey="done" name="Обработано" fill="hsl(142 72% 42%)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="metric-card">
        <p className="text-sm font-semibold text-foreground mb-4">Показатели мастеров</p>
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Мастер</th>
                <th className="text-center">Всего</th>
                <th className="text-center">Обработано</th>
                <th className="text-center">Ожидают</th>
                <th className="text-center">Готовность</th>
                <th className="w-40">Прогресс</th>
              </tr>
            </thead>
            <tbody>
              {summary.byMaster.map((m, i) => (
                <tr key={i}>
                  <td className="text-foreground font-medium">{m.name}</td>
                  <td className="text-center text-foreground">{m.total}</td>
                  <td className="text-center text-success font-semibold">{m.done}</td>
                  <td className="text-center text-warning">{m.pending}</td>
                  <td className="text-center">
                    <span className={`font-bold text-sm ${m.rate >= 70 ? 'text-success' : m.rate >= 40 ? 'text-warning' : 'text-destructive'}`}>
                      {m.rate}%
                    </span>
                  </td>
                  <td>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${m.rate}%`,
                          background: m.rate >= 70 ? 'hsl(142 72% 42%)' : m.rate >= 40 ? 'hsl(38 92% 52%)' : 'hsl(0 70% 50%)',
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}