import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import { CALL_RESULTS, WORK_INTERVALS } from '@/data/mockData';

type ReportTab = 'followup' | 'summary' | 'excluded' | 'search';

const FOLLOWUP_RESULTS = ['2_oil', '2_brake', '2_gearbox', '2_coolant', '5', '6', '7'];
const SUMMARY_RESULTS = ['1', '2_oil', '2_brake', '2_gearbox', '2_coolant', '7'];
const EXCLUDE_RESULTS = ['3', '4'];
const UPCOMING_MONTHS = 3;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function getClientVisibility(workDate: string, work: string, status: string, isExcluded: boolean) {
  const interval = WORK_INTERVALS[work];
  if (!interval) return { label: 'Неизвестно', color: 'text-muted-foreground', icon: 'HelpCircle', detail: '' };

  if (isExcluded) return { label: 'Архив', color: 'text-muted-foreground', icon: 'Archive', detail: 'Исключён из обработки' };
  if (status === 'done') return { label: 'Обработан', color: 'text-success', icon: 'CheckCircle2', detail: '' };

  const today = new Date();
  const lastWork = new Date(workDate);
  const diffMonths = (today.getFullYear() - lastWork.getFullYear()) * 12 + (today.getMonth() - lastWork.getMonth());
  const upcomingMin = Math.max(0, interval.min - UPCOMING_MONTHS);

  if (diffMonths >= upcomingMin && diffMonths < interval.max) {
    return {
      label: 'У мастеров',
      color: 'text-success',
      icon: 'UserCheck',
      detail: 'Сейчас в очереди у мастеров-консультантов',
    };
  }

  if (diffMonths < upcomingMin) {
    const showDate = addMonths(lastWork, upcomingMin);
    return {
      label: 'Ещё рано',
      color: 'text-info',
      icon: 'CalendarClock',
      detail: `Появится у мастеров с ${showDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    };
  }

  return {
    label: 'Просрочен',
    color: 'text-destructive',
    icon: 'AlertTriangle',
    detail: 'Окно обслуживания истекло, клиент не попадёт в список',
  };
}

export default function ReportsPage() {
  const { clients, apiUsers } = useApp();
  const [tab, setTab] = useState<ReportTab>('followup');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const followup = useMemo(() =>
    clients.filter(c => !c.isExcluded && c.result && FOLLOWUP_RESULTS.includes(c.result)),
    [clients]
  );

  const summary = useMemo(() =>
    clients.filter(c => !c.isExcluded && c.result && SUMMARY_RESULTS.includes(c.result)),
    [clients]
  );

  const excluded = useMemo(() =>
    clients.filter(c => c.isExcluded || (c.result && EXCLUDE_RESULTS.includes(c.result))),
    [clients]
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.vin && c.vin.toLowerCase().includes(q))
    );
  }, [clients, searchQuery]);

  function getMasterName(masterId: string | null) {
    if (!masterId) return '—';
    return apiUsers.find(m => m.id === masterId)?.name || 'Не назначен';
  }

  function getResultLabel(result: string | null) {
    if (!result) return '—';
    return CALL_RESULTS.find(r => r.value === result)?.label || result;
  }

  function getWorkLabel(work: string) {
    return WORK_INTERVALS[work]?.label || work;
  }

  function handleSendMax() {
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    }, 1500);
  }

  const tabs = [
    { id: 'followup' as ReportTab, label: 'Повторная обработка', count: followup.length, icon: 'RefreshCcw' },
    { id: 'summary' as ReportTab, label: 'Сводный отчёт', count: summary.length, icon: 'ClipboardCheck' },
    { id: 'excluded' as ReportTab, label: 'Архив', count: excluded.length, icon: 'Archive' },
    { id: 'search' as ReportTab, label: 'Поиск клиента', count: null, icon: 'Search' },
  ];

  const current = tab === 'followup' ? followup : tab === 'summary' ? summary : excluded;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Отчёты</h1>
          <p className="text-sm text-muted-foreground">Управление результатами обработки клиентов</p>
        </div>
        {tab === 'summary' && (
          <button
            onClick={handleSendMax}
            disabled={sending || sent || summary.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-all"
          >
            {sending ? (
              <><Icon name="Loader2" size={16} className="animate-spin" /> Отправка...</>
            ) : sent ? (
              <><Icon name="CheckCircle2" size={16} /> Отправлено в MAX!</>
            ) : (
              <><Icon name="Send" size={16} /> Отправить в MAX</>
            )}
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t.id ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}
          >
            <Icon name={t.icon} size={14} fallback="Circle" />
            {t.label}
            {t.count !== null && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${tab === t.id ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'followup' && (
        <div className="bg-card border border-border rounded-xl p-4 text-sm text-muted-foreground">
          <Icon name="Info" size={14} className="inline mr-2 text-info" />
          Клиенты с результатами «Записан на одну работу», «Повторный созвон», «Другой сервис», «Нет ответа» — требуют дополнительной обработки в следующем периоде.
        </div>
      )}

      {tab === 'summary' && (
        <div className="bg-card border border-border rounded-xl p-4 text-sm text-muted-foreground flex items-start gap-2">
          <Icon name="Send" size={14} className="text-primary mt-0.5 flex-shrink-0" />
          <span>
            Сводный отчёт по результатам работы мастеров для руководителя. Включает записанных клиентов и клиентов без ответа. Отправка через мессенджер <b className="text-foreground">MAX</b>.
          </span>
        </div>
      )}

      {tab === 'excluded' && (
        <div className="bg-card border border-border rounded-xl p-4 text-sm text-muted-foreground flex items-start gap-2">
          <Icon name="AlertCircle" size={14} className="text-warning mt-0.5 flex-shrink-0" />
          <span>
            Архив — клиенты, исключённые из дальнейших отчётов (отказались / продали авто). При поступлении авто с тем же VIN с новым владельцем — запись автоматически восстанавливается.
          </span>
        </div>
      )}

      {tab === 'search' && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 text-sm text-muted-foreground flex items-start gap-2">
            <Icon name="Search" size={14} className="text-primary mt-0.5 flex-shrink-0" />
            <span>
              Поиск по всей базе — по <b className="text-foreground">Ф.И.О.</b> или <b className="text-foreground">VIN-номеру</b>. Показывает все записи клиента, дату работы и когда он появится в очереди у мастеров.
            </span>
          </div>

          <div className="relative">
            <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Введите Ф.И.О. или VIN..."
              className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 text-foreground placeholder:text-muted-foreground"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Icon name="X" size={14} />
              </button>
            )}
          </div>

          {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
            <p className="text-sm text-muted-foreground text-center py-4">Введите минимум 2 символа</p>
          )}

          {searchQuery.trim().length >= 2 && searchResults.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Icon name="UserX" size={36} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Клиент не найден в базе данных</p>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th>Клиент</th>
                    <th>Телефон</th>
                    <th>VIN</th>
                    <th>Работа</th>
                    <th>Дата работы</th>
                    <th>Мастер</th>
                    <th>Видимость</th>
                    <th>Результат</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map(c => {
                    const vis = getClientVisibility(c.workDate, c.work, c.status, c.isExcluded);
                    return (
                      <tr key={c.id}>
                        <td className="text-foreground font-medium">{c.name}</td>
                        <td className="font-mono text-xs">{c.phone}</td>
                        <td className="font-mono text-xs">{c.vin}</td>
                        <td>
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-secondary text-xs text-foreground border border-border">
                            {getWorkLabel(c.work)}
                          </span>
                        </td>
                        <td className="text-xs text-muted-foreground font-mono">
                          {c.workDate ? new Date(c.workDate).toLocaleDateString('ru-RU') : '—'}
                        </td>
                        <td className="text-sm">{getMasterName(c.masterId)}</td>
                        <td>
                          <div className="flex flex-col gap-0.5">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${vis.color}`}>
                              <Icon name={vis.icon} size={12} fallback="Circle" />
                              {vis.label}
                            </span>
                            {vis.detail && (
                              <span className="text-xs text-muted-foreground">{vis.detail}</span>
                            )}
                          </div>
                        </td>
                        <td className="text-xs text-muted-foreground">{getResultLabel(c.result)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2 px-1">
                Найдено записей: {searchResults.length}
              </p>
            </div>
          )}
        </div>
      )}

      {tab !== 'search' && (
        current.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Icon name="Inbox" size={36} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Нет данных в этом разделе</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>Телефон</th>
                  <th>VIN</th>
                  <th>Работа</th>
                  <th>Мастер</th>
                  <th>Результат</th>
                  {tab === 'followup' && <th>Комментарий</th>}
                  {tab === 'summary' && <th>Дата созвона</th>}
                </tr>
              </thead>
              <tbody>
                {current.map(c => (
                  <tr key={c.id}>
                    <td className="text-foreground font-medium">{c.name}</td>
                    <td className="font-mono text-xs">{c.phone}</td>
                    <td className="font-mono text-xs">{c.vin}</td>
                    <td>
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-secondary text-xs text-foreground border border-border">
                        {getWorkLabel(c.work)}
                      </span>
                    </td>
                    <td className="text-sm">{getMasterName(c.masterId)}</td>
                    <td>
                      <span className="text-xs text-muted-foreground">{getResultLabel(c.result)}</span>
                    </td>
                    {tab === 'followup' && (
                      <td className="text-xs text-muted-foreground max-w-[160px] truncate">{c.resultNote || '—'}</td>
                    )}
                    {tab === 'summary' && (
                      <td className="text-xs text-muted-foreground">{c.callbackDate || '—'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
