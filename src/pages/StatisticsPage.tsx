import { useMemo, useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import { apiGetPendingCount, apiGetDailyStats, apiGetMastersStats, apiGetCallsStats, apiGetResultsStats, apiGetSummaryStats } from '@/lib/api';
import { CALL_RESULTS, WORK_INTERVALS } from '@/data/mockData';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
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
  '10': 'hsl(142 60% 35%)',
  '7': 'hsl(215 12% 52%)',
  '8': 'hsl(215 12% 38%)',
};

export default function StatisticsPage() {
  const { apiUsers = [] } = useApp();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  type DailyStat = { day: string; userId: string; name: string; contacted: number; booked: number };
  type MasterStat = { userId: string; masterId: string; name: string; total: number; done: number; callback: number; contacted: number; rate: number };
  type CallsStat = { master: string; incoming: number; outgoing: number; month: string };
  type SummaryStats = { total: number; excluded: number; birthdays: number };

  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [mastersStats, setMastersStats] = useState<MasterStat[]>([]);
  const [callsStats, setCallsStats] = useState<CallsStat[]>([]);
  const [callsMonths, setCallsMonths] = useState<string[]>([]);
  const [resultsStats, setResultsStats] = useState<{ byResult: Record<string, number>; byWork: Record<string, { total: number; done: number }> } | null>(null);
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [globalMonth, setGlobalMonth] = useState(currentMonth);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    return { val, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });

  const selectedMonthLabel = globalMonth
    ? (monthOptions.find(o => o.val === globalMonth)?.label ?? globalMonth)
    : 'Все время';

  useEffect(() => {
    apiGetPendingCount().then(({ status, data }) => {
      if (status === 200) setPendingCount((data as { pending: number }).pending);
    });
    apiGetCallsStats().then(({ status, data }) => {
      if (status === 200) {
        const d = data as { stats: CallsStat[]; months: string[] };
        setCallsMonths(d.months);
      }
    });
    apiGetSummaryStats().then(({ status, data }) => {
      if (status === 200) setSummaryStats(data as SummaryStats);
    });
  }, []);

  useEffect(() => {
    apiGetMastersStats(globalMonth || undefined).then(({ status, data }) => {
      if (status === 200) setMastersStats((data as { stats: MasterStat[] }).stats);
    });
    apiGetDailyStats(globalMonth || currentMonth).then(({ status, data }) => {
      if (status === 200) setDailyStats((data as { stats: DailyStat[] }).stats);
    });
    apiGetResultsStats(globalMonth || undefined).then(({ status, data }) => {
      if (status === 200) setResultsStats(data as { byResult: Record<string, number>; byWork: Record<string, { total: number; done: number }> });
    });
    if (globalMonth) {
      apiGetCallsStats(globalMonth).then(({ status, data }) => {
        if (status === 200) setCallsStats((data as { stats: CallsStat[]; months: string[] }).stats);
      });
    } else {
      setCallsStats([]);
    }
  }, [globalMonth]);

  const summary = {
    total: summaryStats?.total ?? 0,
    excluded: summaryStats?.excluded ?? 0,
    birthdays: summaryStats?.birthdays ?? 0,
  };

  const byResult = useMemo(() => {
    if (!resultsStats) return [];
    return CALL_RESULTS.map(r => ({
      name: r.label,
      value: resultsStats.byResult[r.value] ?? 0,
      color: RESULT_COLORS[r.value] || 'hsl(215 12% 52%)',
    })).filter(r => r.value > 0);
  }, [resultsStats]);

  const byWork = useMemo(() => {
    if (!resultsStats) return [];
    return Object.entries(WORK_INTERVALS).map(([work, meta]) => ({
      name: meta.label,
      total: resultsStats.byWork[work]?.total ?? 0,
      done: resultsStats.byWork[work]?.done ?? 0,
    }));
  }, [resultsStats]);

  const byMaster = useMemo(() => {
    return mastersStats.map(m => ({
      name: m.name,
      total: m.total,
      booked: m.done,
      callback: m.callback,
      rate: m.total ? Math.round((m.done / m.total) * 100) : 0,
    })).sort((a, b) => b.rate - a.rate || b.booked - a.booked);
  }, [mastersStats]);

  const metrics = [
    { label: 'Всего клиентов', value: summary.total, icon: 'Users', color: 'text-info', bg: 'bg-info/10' },
    { label: 'Обработано', value: mastersStats.reduce((s, m) => s + m.total, 0), icon: 'PhoneCall', color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Записаны', value: mastersStats.reduce((s, m) => s + m.done, 0), icon: 'CheckCircle2', color: 'text-success', bg: 'bg-success/10' },
    { label: 'Ожидают', value: pendingCount ?? 0, icon: 'Clock', color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'В архиве', value: summary.excluded, icon: 'Archive', color: 'text-muted-foreground', bg: 'bg-secondary' },
    { label: 'Именинники', value: summary.birthdays, icon: 'Cake', color: 'text-pink-400', bg: 'bg-pink-500/10' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Статистика</h1>
          <p className="text-sm text-muted-foreground">
            {globalMonth ? `Данные за: ${selectedMonthLabel}` : 'Данные за все время'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Icon name="Calendar" size={16} className="text-muted-foreground" />
          <select
            value={globalMonth}
            onChange={e => setGlobalMonth(e.target.value)}
            className="bg-secondary border border-border text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 font-medium"
          >
            <option value="">Все время</option>
            {monthOptions.map(o => (
              <option key={o.val} value={o.val}>{o.label}</option>
            ))}
          </select>
        </div>
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
          {byResult.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={byResult} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                    {byResult.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'hsl(220 14% 11%)', border: '1px solid hsl(220 12% 18%)', borderRadius: '8px', fontSize: 12, color: '#fff' }}
                    labelStyle={{ color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {byResult.map((r, i) => (
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
            <BarChart data={byWork} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
              <XAxis type="number" tick={{ fill: 'hsl(215 12% 52%)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(215 12% 52%)', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
              <Tooltip contentStyle={{ background: 'hsl(220 14% 11%)', border: '1px solid hsl(220 12% 18%)', borderRadius: '8px', fontSize: 12 }} />
              <Bar dataKey="total" name="Всего" fill="hsl(200 80% 48%)" radius={[0, 3, 3, 0]} />
              <Bar dataKey="done" name="Записано" fill="hsl(142 72% 42%)" radius={[0, 3, 3, 0]} />
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
              {byMaster.map((m, i) => (
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

      <div className="metric-card">
        <div className="mb-4">
          <p className="text-sm font-semibold text-foreground">Звонки мастеров</p>
          <p className="text-xs text-muted-foreground">Уникальные звонки по документам из 1С</p>
        </div>
        {callsMonths.length === 0 ? (
          <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground text-sm">
            <Icon name="PhoneOff" size={18} />
            <span>Нет данных. Загрузите отчёт по звонкам из 1С в разделе «Загрузка»</span>
          </div>
        ) : !globalMonth ? (
          <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground text-sm">
            <Icon name="Calendar" size={18} />
            <span>Выберите конкретный месяц вверху страницы для просмотра звонков</span>
          </div>
        ) : !callsStats.length ? (
          <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground text-sm">
            <Icon name="PhoneOff" size={18} />
            <span>Нет данных по звонкам за {selectedMonthLabel}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Мастер</th>
                  <th className="text-center">Входящие</th>
                  <th className="text-center">Исходящие</th>
                  <th className="text-center">Всего</th>
                </tr>
              </thead>
              <tbody>
                {callsStats.map((s, i) => (
                  <tr key={i}>
                    <td className="text-foreground font-medium">{s.master}</td>
                    <td className="text-center">
                      <span className="inline-flex items-center gap-1 text-info font-semibold">
                        <Icon name="PhoneIncoming" size={13} />
                        {s.incoming}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="inline-flex items-center gap-1 text-primary font-semibold">
                        <Icon name="PhoneOutgoing" size={13} />
                        {s.outgoing}
                      </span>
                    </td>
                    <td className="text-center font-bold text-foreground">{s.incoming + s.outgoing}</td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="font-semibold text-foreground">Итого</td>
                  <td className="text-center font-semibold text-info">{callsStats.reduce((s, r) => s + r.incoming, 0)}</td>
                  <td className="text-center font-semibold text-primary">{callsStats.reduce((s, r) => s + r.outgoing, 0)}</td>
                  <td className="text-center font-bold text-foreground">{callsStats.reduce((s, r) => s + r.incoming + r.outgoing, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(() => {
        const days = [...new Set(dailyStats.map(s => s.day))].sort((a, b) => a.localeCompare(b));
        const masters = [...new Map(dailyStats.map(s => [s.userId, s.name])).entries()].map(([userId, name]) => ({ userId, name }));
        const map: Record<string, Record<string, { contacted: number; booked: number }>> = {};
        dailyStats.forEach(s => {
          if (!map[s.day]) map[s.day] = {};
          map[s.day][s.userId] = { contacted: s.contacted, booked: s.booked };
        });
        const monthTotal = dailyStats.reduce((s, x) => s + x.contacted, 0);
        return (
          <div className="metric-card">
            <div className="mb-4">
              <p className="text-sm font-semibold text-foreground">Активность по дням</p>
              <p className="text-xs text-muted-foreground">Всего обработано: {monthTotal}</p>
            </div>
            {days.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full data-table">
                  <thead>
                    <tr>
                      <th className="text-left">Мастер</th>
                      {days.map(day => (
                        <th key={day} className="text-center whitespace-nowrap" colSpan={2}>
                          {new Date(day + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' })}
                        </th>
                      ))}
                      <th className="text-center" colSpan={2}>Итого</th>
                    </tr>
                    <tr>
                      <th></th>
                      {days.map(day => (
                        <>
                          <th key={day + '_c'} className="text-center text-xs font-normal text-muted-foreground pb-1">Обраб.</th>
                          <th key={day + '_b'} className="text-center text-xs font-normal text-success pb-1">Запис.</th>
                        </>
                      ))}
                      <th className="text-center text-xs font-normal text-muted-foreground pb-1">Обраб.</th>
                      <th className="text-center text-xs font-normal text-success pb-1">Запис.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masters.map(m => {
                      const tc = dailyStats.filter(s => s.userId === m.userId).reduce((s, x) => s + x.contacted, 0);
                      const tb = dailyStats.filter(s => s.userId === m.userId).reduce((s, x) => s + x.booked, 0);
                      return (
                        <tr key={m.userId}>
                          <td className="font-medium text-foreground whitespace-nowrap">{m.name}</td>
                          {days.map(day => {
                            const val = map[day]?.[m.userId];
                            return (
                              <>
                                <td key={day + '_c'} className="text-center text-foreground">{val ? val.contacted : <span className="text-muted-foreground/30">—</span>}</td>
                                <td key={day + '_b'} className="text-center text-success font-semibold">{val?.booked ? val.booked : <span className="text-muted-foreground/30">—</span>}</td>
                              </>
                            );
                          })}
                          <td className="text-center font-semibold text-foreground">{tc || '—'}</td>
                          <td className="text-center font-semibold text-success">{tb || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">Нет данных за выбранный период</div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

