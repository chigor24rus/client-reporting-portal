import { useMemo, useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import { apiGetPendingCount, apiGetDailyStats } from '@/lib/api';
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
  'gift_ok': 'hsl(320 70% 50%)',
  'gift_no': 'hsl(320 50% 40%)',
  '3': 'hsl(0 70% 50%)',
  '4': 'hsl(0 70% 40%)',
  '5': 'hsl(38 92% 52%)',
  '6': 'hsl(38 80% 60%)',
  '9': 'hsl(142 50% 55%)',
  '7': 'hsl(215 12% 52%)',
  '8': 'hsl(215 12% 38%)',
};

export default function StatisticsPage() {
  const { clients = [], apiUsers = [] } = useApp();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  type DailyStat = { day: string; userId: string; name: string; contacted: number; booked: number };
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  useEffect(() => {
    apiGetPendingCount().then(({ status, data }) => {
      if (status === 200) setPendingCount((data as { pending: number }).pending);
    });
  }, []);

  useEffect(() => {
    apiGetDailyStats(selectedMonth).then(({ status, data }) => {
      if (status === 200) setDailyStats((data as { stats: DailyStat[] }).stats);
    });
  }, [selectedMonth]);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    return { val, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });

  const summary = useMemo(() => {
    const SUCCESS_RESULTS = new Set(['1', '2_oil', '2_brake', '2_gearbox', '2_coolant', 'gift_ok']);
    const all = (clients ?? []).filter(c => !c.isExcluded && !c.isTest);
    const total = all.length;
    const done = all.filter(c => c.result !== null).length;
    const booked = all.filter(c => c.result !== null && SUCCESS_RESULTS.has(c.result)).length;
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

    const masters = apiUsers.filter(u => u.role === 'master' && u.active && !u.isTest);
    const byMaster = masters.map(m => {
      const mc = all.filter(c => c.masterId === m.masterId);
      const contacted = mc.filter(c => c.result !== null).length;
      const booked = mc.filter(c => c.result !== null && SUCCESS_RESULTS.has(c.result)).length;
      const callback = mc.filter(c => c.result === '5').length;
      return {
        name: m.name.split(' ').slice(0, 2).join(' '),
        total: contacted,
        booked,
        callback,
        rate: contacted ? Math.round((booked / contacted) * 100) : 0,
      };
    }).sort((a, b) => b.rate - a.rate || b.booked - a.booked);

    const today = new Date();
    const birthdays = clients.filter(c => {
      if (!c.birthDate) return false;
      const d = new Date(c.birthDate);
      const diff = Math.abs(
        new Date(today.getFullYear(), d.getMonth(), d.getDate()).getTime() - 
        new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
      ) / 86400000;
      return diff <= 7;
    }).length;

    return { total, done, booked, pending, excluded, byResult, byWork, byMaster, birthdays };
  }, [clients, apiUsers]);

  const metrics = [
    { label: 'Всего клиентов', value: summary.total, icon: 'Users', color: 'text-info', bg: 'bg-info/10' },
    { label: 'Обработано', value: summary.done, icon: 'PhoneCall', color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Записаны', value: summary.booked, icon: 'CheckCircle2', color: 'text-success', bg: 'bg-success/10' },
    { label: 'Ожидают', value: pendingCount ?? summary.pending, icon: 'Clock', color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'В архиве', value: summary.excluded, icon: 'Archive', color: 'text-muted-foreground', bg: 'bg-secondary' },
    { label: 'Именинники', value: summary.birthdays, icon: 'Cake', color: 'text-pink-400', bg: 'bg-pink-500/10' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Статистика</h1>
        <p className="text-sm text-muted-foreground">Сводные данные за текущий период</p>
      </div>

      <div className="grid grid-cols-6 gap-4">
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
                <th className="text-center">Обработано</th>
                <th className="text-center">Записано</th>
                <th className="text-center">Повторный созвон</th>
                <th className="text-center">Конверсия</th>
                <th className="w-40">Прогресс</th>
              </tr>
            </thead>
            <tbody>
              {summary.byMaster.map((m, i) => (
                <tr key={i}>
                  <td className="text-foreground font-medium">
                    <span className="mr-1.5">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                    {m.name}
                  </td>
                  <td className="text-center text-foreground">{m.total}</td>
                  <td className="text-center text-success font-semibold">{m.booked}</td>
                  <td className="text-center text-warning">{m.callback}</td>
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

      {(() => {
        const days = [...new Set(dailyStats.map(s => s.day))].sort((a, b) => a.localeCompare(b));
        const masters = [...new Map(dailyStats.map(s => [s.userId, s.name])).entries()].map(([userId, name]) => ({ userId, name }));
        const map: Record<string, Record<string, { contacted: number; booked: number }>> = {};
        dailyStats.forEach(s => {
          if (!map[s.day]) map[s.day] = {};
          map[s.day][s.userId] = { contacted: s.contacted, booked: s.booked };
        });
        const maxVal = Math.max(...dailyStats.map(s => s.contacted), 1);
        const monthTotal = dailyStats.reduce((s, x) => s + x.contacted, 0);
        return (
          <div className="metric-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Активность по дням</p>
                {monthTotal > 0 && <p className="text-xs text-muted-foreground">Всего обработано за месяц: <span className="text-foreground font-semibold">{monthTotal}</span></p>}
              </div>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-secondary border border-border text-foreground text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {monthOptions.map(o => (
                  <option key={o.val} value={o.val}>{o.label}</option>
                ))}
              </select>
            </div>
            {days.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full data-table text-xs">
                  <thead>
                    <tr>
                      <th className="text-left">Дата</th>
                      {masters.map(m => (
                        <th key={m.userId} className="text-center whitespace-nowrap" colSpan={2}>{m.name}</th>
                      ))}
                      <th className="text-center" colSpan={2}>Итого</th>
                    </tr>
                    <tr>
                      <th></th>
                      {masters.map(m => (
                        <>
                          <th key={m.userId + '_c'} className="text-center text-muted-foreground font-normal">Обраб.</th>
                          <th key={m.userId + '_b'} className="text-center text-muted-foreground font-normal">Записано</th>
                        </>
                      ))}
                      <th className="text-center text-muted-foreground font-normal">Обраб.</th>
                      <th className="text-center text-muted-foreground font-normal">Записано</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map(day => {
                      const dayContacted = masters.reduce((s, m) => s + (map[day]?.[m.userId]?.contacted ?? 0), 0);
                      const dayBooked = masters.reduce((s, m) => s + (map[day]?.[m.userId]?.booked ?? 0), 0);
                      return (
                        <tr key={day}>
                          <td className="text-muted-foreground whitespace-nowrap">
                            {new Date(day + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' })}
                          </td>
                          {masters.map(m => {
                            const val = map[day]?.[m.userId];
                            return (
                              <>
                                <td key={m.userId + '_c'} className="text-center text-foreground">{val ? val.contacted : <span className="text-muted-foreground/30">—</span>}</td>
                                <td key={m.userId + '_b'} className="text-center text-success font-semibold">{val ? val.booked : <span className="text-muted-foreground/30">—</span>}</td>
                              </>
                            );
                          })}
                          <td className="text-center font-semibold text-foreground">{dayContacted || <span className="text-muted-foreground/30">—</span>}</td>
                          <td className="text-center font-semibold text-success">{dayBooked || <span className="text-muted-foreground/30">—</span>}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-border">
                      <td className="font-semibold text-foreground">Итого</td>
                      {masters.map(m => {
                        const tc = dailyStats.filter(s => s.userId === m.userId).reduce((s, x) => s + x.contacted, 0);
                        const tb = dailyStats.filter(s => s.userId === m.userId).reduce((s, x) => s + x.booked, 0);
                        return (
                          <>
                            <td key={m.userId + '_c'} className="text-center font-semibold text-foreground">{tc || '—'}</td>
                            <td key={m.userId + '_b'} className="text-center font-semibold text-success">{tb || '—'}</td>
                          </>
                        );
                      })}
                      <td className="text-center font-bold text-primary">{monthTotal}</td>
                      <td className="text-center font-bold text-success">{dailyStats.reduce((s, x) => s + x.booked, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">Нет данных за выбранный месяц</div>
            )}
          </div>
        );
      })()}
    </div>
  );
}