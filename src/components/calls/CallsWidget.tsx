import { useState, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { apiGetCallsStats } from '@/lib/api';

type CallsStat = { master: string; incoming: number; outgoing: number; missed: number; month: string };
type CallsData = { stats: CallsStat[]; months: string[]; company_missed: number; last_date: string | null };

function formatMonthLabel(val: string) {
  const [year, month] = val.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  const label = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function CallsWidget() {
  const [allStats, setAllStats] = useState<CallsStat[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [totalMissed, setTotalMissed] = useState(0);
  const [lastDate, setLastDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  useEffect(() => {
    setLoading(true);
    apiGetCallsStats().then(({ status, data }) => {
      if (status === 200) {
        const d = data as CallsData;
        setAllStats(d.stats);
        setMonths(d.months);
        setTotalMissed(d.company_missed ?? 0);
        setLastDate(d.last_date ?? null);
      }
      setLoading(false);
    });
  }, []);

  const displayStats = (() => {
    const source = selectedMonth === 'all'
      ? allStats
      : allStats.filter(s => s.month === selectedMonth);
    const totals: Record<string, { incoming: number; outgoing: number; missed: number }> = {};
    for (const s of source) {
      if (!totals[s.master]) totals[s.master] = { incoming: 0, outgoing: 0, missed: 0 };
      totals[s.master].incoming += s.incoming;
      totals[s.master].outgoing += s.outgoing;
      totals[s.master].missed += s.missed;
    }
    return Object.entries(totals)
      .map(([master, v]) => ({ master, ...v }))
      .sort((a, b) => a.master.localeCompare(b.master, 'ru'));
  })();

  const companyMissed = selectedMonth === 'all'
    ? totalMissed
    : allStats.filter(s => s.month === selectedMonth).reduce((sum, s) => sum + (s.missed ?? 0), 0);

  if (months.length === 0 && !loading) {
    return (
      <div className="metric-card">
        <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground text-sm">
          <Icon name="PhoneOff" size={18} />
          <span>Нет данных по звонкам</span>
        </div>
      </div>
    );
  }

  return (
    <div className="metric-card">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-foreground">Звонки мастеров</p>
          <p className="text-xs text-muted-foreground">Уникальные звонки по данным IP-телефонии</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastDate && selectedMonth === 'all' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-secondary rounded-lg">
              <Icon name="CalendarCheck" size={13} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">по <span className="text-foreground font-semibold">{lastDate}</span></span>
            </div>
          )}
          {months.length > 0 && (
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 flex-wrap">
              <button
                onClick={() => setSelectedMonth('all')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${selectedMonth === 'all' ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Всё время
              </button>
              {months.map(m => (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(m)}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all whitespace-nowrap ${selectedMonth === m ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {formatMonthLabel(m)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Icon name="Loader2" size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : !displayStats.length ? (
        <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground text-sm">
          <Icon name="PhoneOff" size={18} />
          <span>Нет данных за выбранный период</span>
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
              {displayStats.map((s, i) => (
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
                <td className="text-center font-semibold text-info">{displayStats.reduce((s, r) => s + r.incoming, 0)}</td>
                <td className="text-center font-semibold text-primary">{displayStats.reduce((s, r) => s + r.outgoing, 0)}</td>
                <td className="text-center font-bold text-foreground">{displayStats.reduce((s, r) => s + r.incoming + r.outgoing, 0)}</td>
              </tr>
            </tbody>
          </table>
          {companyMissed > 0 && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-xl">
              <Icon name="PhoneMissed" size={18} className="text-destructive flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Пропущенные по компании: <span className="text-destructive">{companyMissed}</span>
                </p>
                <p className="text-xs text-muted-foreground">Входящие на общую линию, которым не перезвонили в тот же день</p>
              </div>
            </div>
          )}
          {companyMissed === 0 && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-success/10 border border-success/20 rounded-xl">
              <Icon name="PhoneCheck" size={18} className="text-success flex-shrink-0" />
              <p className="text-sm font-semibold text-success">Все входящие обработаны — пропущенных без перезвона нет</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
