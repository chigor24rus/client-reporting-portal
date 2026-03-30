import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { CALL_RESULTS } from '@/data/mockData';

type MasterStat = { userId: string; name: string; total: number; done: number; rate: number };
type PersonalStat = { result: string; label: string; count: number; color: string };

type Props = {
  pending: number;
  done: number;
  total: number;
  birthdayCount: number;
  currentUserId?: string;
  mastersStats: MasterStat[];
  personalMonthStats: PersonalStat[];
  personalQuarterStats: { name: string; done: number; pending: number }[];
};

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
  '9': 'hsl(142 50% 55%)',
  '7': 'hsl(215 12% 52%)',
  '8': 'hsl(215 12% 38%)',
  'gift_ok': 'hsl(320 70% 50%)',
  'gift_no': 'hsl(320 50% 40%)',
};

export default function DashboardStats({ pending, done, total, birthdayCount, currentUserId, mastersStats, personalMonthStats, personalQuarterStats }: Props) {
  const [leftPeriod, setLeftPeriod] = useState<'month' | 'quarter'>('month');
  const [rightPeriod, setRightPeriod] = useState<'month' | 'quarter'>('month');

  const monthMasters = mastersStats;
  const quarterMasters = [...mastersStats].sort((a, b) => b.rate - a.rate);

  const teamStats = rightPeriod === 'month' ? monthMasters : quarterMasters;

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
        {/* Левый блок — персональная динамика */}
        <div className="metric-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Моя статистика</p>
              <p className="text-xs text-muted-foreground">
                {leftPeriod === 'month' ? 'За текущий месяц' : 'За текущий квартал'}
              </p>
            </div>
            <div className="flex gap-1 bg-secondary rounded-lg p-1">
              {(['month', 'quarter'] as const).map(p => (
                <button key={p} onClick={() => setLeftPeriod(p)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${leftPeriod === p ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>
                  {p === 'month' ? 'Месяц' : 'Квартал'}
                </button>
              ))}
            </div>
          </div>

          {leftPeriod === 'month' ? (
            personalMonthStats.length > 0 ? (
              <div className="flex gap-4 items-center">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={personalMonthStats} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={2} dataKey="count">
                      {personalMonthStats.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(220 14% 11%)', border: '1px solid hsl(220 12% 18%)', borderRadius: '8px', fontSize: 11 }}
                      formatter={(value: number, name: string) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {personalMonthStats.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        <span className="text-muted-foreground truncate max-w-[120px]">{s.label}</span>
                      </div>
                      <span className="font-semibold text-foreground ml-2">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Нет обработанных клиентов</div>
            )
          ) : (
            personalQuarterStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={personalQuarterStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
                  <XAxis dataKey="name" tick={{ fill: 'hsl(215 12% 52%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(215 12% 52%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'hsl(220 14% 11%)', border: '1px solid hsl(220 12% 18%)', borderRadius: '8px', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="done" name="Обработано" fill="hsl(142 72% 42%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="pending" name="Ожидают" fill="hsl(38 92% 52%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Нет данных</div>
            )
          )}
        </div>

        {/* Правый блок — эффективность команды */}
        <div className="metric-card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-foreground">Эффективность команды</p>
            <div className="flex gap-1 bg-secondary rounded-lg p-1">
              {(['month', 'quarter'] as const).map(p => (
                <button key={p} onClick={() => setRightPeriod(p)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${rightPeriod === p ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>
                  {p === 'month' ? 'Месяц' : 'Квартал'}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2.5">
            {teamStats.length > 0 ? teamStats.map((m, i) => {
              const isMe = currentUserId === m.userId;
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
              return (
                <div key={m.userId} className={`rounded-lg px-3 py-2 transition-all ${isMe ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/30 border border-transparent'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {medal && <span className="text-sm">{medal}</span>}
                      <span className={`text-xs font-medium ${isMe ? 'text-primary' : 'text-foreground'}`}>
                        {m.name}{isMe && <span className="ml-1 text-primary/60">(вы)</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{m.done}/{m.total}</span>
                      <span className={`text-xs font-bold ${m.rate >= 70 ? 'text-success' : m.rate >= 40 ? 'text-warning' : 'text-destructive'}`}>{m.rate}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${m.rate}%`, background: m.rate >= 70 ? 'hsl(142 72% 42%)' : m.rate >= 40 ? 'hsl(38 92% 52%)' : 'hsl(0 70% 50%)' }} />
                  </div>
                </div>
              );
            }) : <p className="text-sm text-muted-foreground">Нет данных</p>}
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
