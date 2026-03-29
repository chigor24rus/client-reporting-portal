import { useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import { CALL_RESULTS, WORK_INTERVALS } from '@/data/mockData';

type ReportTab = 'followup' | 'summary' | 'excluded';

import { useState } from 'react';

const FOLLOWUP_RESULTS = ['2_oil', '2_brake', '2_gearbox', '2_coolant', '5', '6', '7'];
const SUMMARY_RESULTS = ['1', '2_oil', '2_brake', '2_gearbox', '2_coolant', '7'];
const EXCLUDE_RESULTS = ['3', '4'];

export default function ReportsPage() {
  const { clients, apiUsers } = useApp();
  const [tab, setTab] = useState<ReportTab>('followup');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

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

  function getMasterName(masterId: string) {
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

      <div className="flex gap-2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t.id ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}
          >
            <Icon name={t.icon} size={14} fallback="Circle" />
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${tab === t.id ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
              {t.count}
            </span>
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

      {current.length === 0 ? (
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
      )}
    </div>
  );
}