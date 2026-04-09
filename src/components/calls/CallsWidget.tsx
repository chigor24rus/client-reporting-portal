import { useState, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { apiGetCallsStats, apiGetMissedPhones } from '@/lib/api';

type CallsStat = { master: string; incoming: number; outgoing: number; missed: number; month: string };
type CallsData = { stats: CallsStat[]; months: string[]; company_missed: number; missed_by_month: Record<string, number>; last_date: string | null };


interface Props {
  month?: string; // '' или undefined = все время, 'YYYY-MM' = конкретный месяц
}

export default function CallsWidget({ month: externalMonth }: Props) {
  const [allStats, setAllStats] = useState<CallsStat[]>([]);
  const [hasData, setHasData] = useState(false);
  const [totalMissed, setTotalMissed] = useState(0);
  const [missedByMonth, setMissedByMonth] = useState<Record<string, number>>({});
  const [lastDate, setLastDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMissed, setShowMissed] = useState(false);
  const [missedPhones, setMissedPhones] = useState<{ phone: string; date: string }[]>([]);
  const [missedLoading, setMissedLoading] = useState(false);

  const selectedMonth = externalMonth || 'all';

  useEffect(() => {
    setLoading(true);
    apiGetCallsStats().then(({ status, data }) => {
      if (status === 200) {
        const d = data as CallsData;
        setAllStats(d.stats);
        setHasData((d.months ?? []).length > 0);
        setTotalMissed(d.company_missed ?? 0);
        setMissedByMonth(d.missed_by_month ?? {});
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
    : (missedByMonth[selectedMonth] ?? 0);

  async function handleShowMissed() {
    if (showMissed) { setShowMissed(false); return; }
    setShowMissed(true);
    if (missedPhones.length > 0) return;
    setMissedLoading(true);
    const { status, data } = await apiGetMissedPhones();
    if (status === 200) {
      setMissedPhones((data as { missed: { phone: string; date: string }[] }).missed);
    }
    setMissedLoading(false);
  }

  if (!hasData && !loading) {
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
        {lastDate && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-secondary rounded-lg">
            <Icon name="CalendarCheck" size={13} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">по <span className="text-foreground font-semibold">{lastDate}</span></span>
          </div>
        )}
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
            <div className="mt-4 bg-destructive/10 border border-destructive/20 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <Icon name="PhoneMissed" size={18} className="text-destructive flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    Пропущенные по компании: <span className="text-destructive">{companyMissed}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Входящие на общую линию, которым не перезвонили в тот же день</p>
                </div>
                <button
                  onClick={handleShowMissed}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-destructive/20 hover:bg-destructive/30 text-destructive font-medium transition-colors flex-shrink-0"
                >
                  <Icon name={showMissed ? 'ChevronUp' : 'ChevronDown'} size={13} />
                  {showMissed ? 'Скрыть' : 'Номера'}
                </button>
              </div>
              {showMissed && (
                <div className="border-t border-destructive/20 px-4 py-3">
                  {missedLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Icon name="Loader2" size={13} className="animate-spin" />
                      Загрузка...
                    </div>
                  ) : missedPhones.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">Нет данных — загрузите отчёт по звонкам</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 max-h-48 overflow-y-auto">
                      {missedPhones.map((m, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 py-0.5">
                          <span className="text-xs font-mono text-foreground">+{m.phone.replace(/^7/, '')}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">{m.date}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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