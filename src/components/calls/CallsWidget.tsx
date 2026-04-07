import { useState, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { apiGetCallsStats } from '@/lib/api';

type CallsStat = { master: string; incoming: number; outgoing: number; missed: number; month: string };
type CallsData = { stats: CallsStat[]; months: string[]; company_missed: number; last_date: string | null };

interface Props {
  month: string;
}

export default function CallsWidget({ month }: Props) {
  const [callsStats, setCallsStats] = useState<CallsStat[]>([]);
  const [callsMonths, setCallsMonths] = useState<string[]>([]);
  const [companyMissed, setCompanyMissed] = useState(0);
  const [lastDate, setLastDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiGetCallsStats().then(({ status, data }) => {
      if (status === 200) {
        const d = data as CallsData;
        setCallsMonths(d.months);
      }
    });
  }, []);

  useEffect(() => {
    if (!month) {
      setCallsStats([]);
      setCompanyMissed(0);
      setLastDate(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiGetCallsStats(month).then(({ status, data }) => {
      if (status === 200) {
        const d = data as CallsData;
        setCallsStats(d.stats);
        setCompanyMissed(d.company_missed ?? 0);
        setLastDate(d.last_date ?? null);
      }
      setLoading(false);
    });
  }, [month]);

  if (callsMonths.length === 0 && !loading) {
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
      <div className="flex items-start justify-between mb-4">
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
      ) : !callsStats.length ? (
        <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground text-sm">
          <Icon name="PhoneOff" size={18} />
          <span>Нет данных за выбранный месяц</span>
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
