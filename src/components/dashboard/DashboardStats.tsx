import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

type MasterStat = { userId: string; name: string; total: number; done: number; contacted: number; rate: number; callback?: number };
type PersonalStat = { result: string; label: string; count: number; color: string };

type Props = {
  pending: number;
  done: number;
  total: number;
  birthdayCount: number;
  currentUserId?: string;
  mastersStats: MasterStat[];
  myStat?: MasterStat;
  personalMonthStats: PersonalStat[];
  personalQuarterStats: { name: string; done: number; pending: number }[];
};


export default function DashboardStats({ pending, done, total, birthdayCount, currentUserId, mastersStats, myStat, personalMonthStats: _personalMonthStats, personalQuarterStats: _personalQuarterStats }: Props) {
  const [rightPeriod, setRightPeriod] = useState<'month' | 'quarter'>('month');

  const monthMasters = mastersStats;
  const quarterMasters = [...mastersStats].sort((a, b) => b.rate - a.rate);

  const teamStats = rightPeriod === 'month' ? monthMasters : quarterMasters;

  const teamTotal = mastersStats.reduce((s, m) => s + m.total, 0);
  const teamDone = mastersStats.reduce((s, m) => s + m.done, 0);

  // Личная статистика — берём из myStat (данные с сервера)
  const myTotal = myStat?.total ?? 0;
  const myDone = myStat?.done ?? 0;
  const myCallback = myStat?.callback ?? 0;
  const myRate = myTotal ? Math.round((myDone / myTotal) * 100) : 0;

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
              <p className="text-lg font-bold text-success leading-tight">{teamDone}</p>
              <p className="text-xs text-muted-foreground">Записаны</p>
            </div>
          </div>
          <div className="metric-card !p-3 !rounded-lg flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon name="PhoneCall" size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold text-primary leading-tight">{teamTotal}</p>
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
        {/* Левый блок — персональная статистика */}
        <div className="metric-card">
          <div className="mb-4">
            <p className="text-sm font-semibold text-foreground">Моя статистика</p>
            <p className="text-xs text-muted-foreground">За всё время работы</p>
          </div>

          {myTotal > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-secondary/50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-foreground">{myTotal}</p>
                  <p className="text-xs text-muted-foreground mt-1">Обработано</p>
                </div>
                <div className="bg-success/10 rounded-xl p-3">
                  <p className="text-2xl font-bold text-success">{myDone}</p>
                  <p className="text-xs text-muted-foreground mt-1">Записано</p>
                </div>
                <div className="bg-warning/10 rounded-xl p-3">
                  <p className="text-2xl font-bold text-warning">{myCallback}</p>
                  <p className="text-xs text-muted-foreground mt-1">Повт. созвон</p>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Конверсия</span>
                  <span className={`font-semibold ${myRate >= 70 ? 'text-success' : myRate >= 40 ? 'text-warning' : 'text-destructive'}`}>{myRate}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${myRate}%`,
                      background: myRate >= 70 ? 'hsl(142 72% 42%)' : myRate >= 40 ? 'hsl(38 92% 52%)' : 'hsl(0 70% 50%)',
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Icon name="PhoneCall" size={32} className="opacity-20" />
              <p className="text-sm">Нет обработанных клиентов</p>
            </div>
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

        </div>
      </div>
    </>
  );
}