import { useMemo, useState, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import { CALL_RESULTS, WORK_INTERVALS, WORK_RESULT_MAP } from '@/data/mockData';
import { apiResetClient } from '@/lib/api';

type ReportTab = 'followup' | 'summary' | 'excluded' | 'search';

const FOLLOWUP_RESULTS = ['2_oil', '2_brake', '2_gearbox', '2_coolant', '5', '6', '7'];
// 2_* попадают в повторную обработку только если статус pending (частичная запись с датой созвона)
const SUMMARY_RESULTS = ['1', '2_oil', '2_brake', '2_gearbox', '2_coolant', '7', '9', '10'];
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

function getAdminWorkResults(workType: string) {
  const thisWorkValue = WORK_RESULT_MAP[workType];
  const allWorkValues = new Set(Object.values(WORK_RESULT_MAP));
  return CALL_RESULTS.filter(r => {
    if (r.group === 'birthday') return false;
    if (r.value === '1') return false;
    if (r.group === 'work' && allWorkValues.has(r.value)) {
      return r.value === thisWorkValue;
    }
    return true;
  });
}

export default function ReportsPage() {
  const { clients, apiUsers, refreshClients, syncClientResult } = useApp();
  const [tab, setTab] = useState<ReportTab>('followup');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [resetting, setResetting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editResult, setEditResult] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editCallback, setEditCallback] = useState('');
  const [saving, setSaving] = useState(false);

  const handleReset = useCallback(async (id: string) => {
    setResetting(id);
    await apiResetClient(id);
    await refreshClients();
    setResetting(null);
  }, [refreshClients]);

  const handleExpandRow = useCallback((id: string, currentResult: string | null) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      setEditResult(currentResult || '');
      setEditNote('');
      setEditCallback('');
    }
  }, [expandedId]);

  const handleSaveResult = useCallback(async (id: string) => {
    setSaving(true);
    await syncClientResult(id, editResult, editNote, editCallback);
    await refreshClients();
    setSaving(false);
    setExpandedId(null);
  }, [syncClientResult, refreshClients, editResult, editNote, editCallback]);

  const followup = useMemo(() =>
    clients.filter(c => {
      if (c.isExcluded || !c.result) return false;
      if (!FOLLOWUP_RESULTS.includes(c.result)) return false;
      // 2_* только если pending (частичная запись с датой созвона)
      if (c.result.startsWith('2_')) return c.status === 'pending';
      return true;
    }),
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

    const matched = clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.vin && c.vin.toLowerCase().includes(q))
    );

    // Оставляем только самую свежую запись по каждой связке (vin + work)
    const latestMap = new Map<string, typeof matched[0]>();
    for (const c of matched) {
      const key = `${c.vin}__${c.work}`;
      const existing = latestMap.get(key);
      if (!existing || (c.workDate && c.workDate > existing.workDate)) {
        latestMap.set(key, c);
      }
    }
    return Array.from(latestMap.values());
  }, [clients, searchQuery]);

  function getMasterName(masterId: string | null) {
    if (!masterId) return '—';
    return apiUsers.find(m => m.masterId === masterId)?.name || 'Не назначен';
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map(c => {
                    const vis = getClientVisibility(c.workDate, c.work, c.status, c.isExcluded);
                    const isExpanded = expandedId === c.id;
                    const needsNote = ['3', '5', '6'].includes(editResult);
                    const needsCallback = editResult === '5';
                    const canSave = !!editResult && (!needsNote || !!editNote) && (!needsCallback || !!editCallback);
                    const workResults = getAdminWorkResults(c.work);
                    return (
                      <>
                        <tr
                          key={c.id}
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-primary/5' : 'hover:bg-secondary/40'}`}
                          onClick={() => handleExpandRow(c.id, c.result)}
                        >
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
                          <td onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleExpandRow(c.id, c.result)}
                                title="Обработать клиента"
                                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-lg transition-colors ${isExpanded ? 'text-primary border-primary/40 bg-primary/10' : 'text-muted-foreground hover:text-primary hover:border-primary/40 border-border'}`}
                              >
                                <Icon name="PhoneCall" size={12} />
                                Обработать
                              </button>
                              {c.result && (
                                <button
                                  onClick={() => handleReset(c.id)}
                                  disabled={resetting === c.id}
                                  title="Вернуть в работу"
                                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-warning hover:border-warning/40 border border-border rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {resetting === c.id
                                    ? <Icon name="Loader2" size={12} className="animate-spin" />
                                    : <Icon name="RotateCcw" size={12} />
                                  }
                                  Вернуть
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${c.id}_expand`} className="bg-primary/5">
                            <td colSpan={9} className="p-0">
                              <div className="px-4 py-3 border-t border-primary/20 space-y-3">
                                <p className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                                  <Icon name="PhoneCall" size={12} />
                                  Обработка клиента администратором
                                </p>
                                <div className="flex flex-wrap gap-3 items-start">
                                  <div className="flex-1 min-w-[220px]">
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Результат</label>
                                    <select
                                      value={editResult}
                                      onChange={e => setEditResult(e.target.value)}
                                      className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    >
                                      <option value="">— Выберите результат —</option>
                                      {workResults.map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  {needsNote && (
                                    <div className="flex-1 min-w-[220px]">
                                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Комментарий</label>
                                      <input
                                        type="text"
                                        value={editNote}
                                        onChange={e => setEditNote(e.target.value)}
                                        placeholder="Укажите причину..."
                                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                      />
                                    </div>
                                  )}
                                  {needsCallback && (
                                    <div>
                                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Дата созвона</label>
                                      <input
                                        type="date"
                                        value={editCallback}
                                        onChange={e => setEditCallback(e.target.value)}
                                        className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                      />
                                    </div>
                                  )}
                                  <div className="flex items-end gap-2 pt-5">
                                    <button
                                      onClick={() => setExpandedId(null)}
                                      className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
                                    >
                                      Отмена
                                    </button>
                                    <button
                                      onClick={() => handleSaveResult(c.id)}
                                      disabled={saving || !canSave}
                                      className="flex items-center gap-1.5 px-4 py-2 text-xs bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all"
                                    >
                                      {saving && <Icon name="Loader2" size={12} className="animate-spin" />}
                                      Сохранить
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
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
                  {tab === 'excluded' && <th>Комментарий</th>}
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
                    {tab === 'excluded' && (
                      <td className="text-xs text-muted-foreground max-w-[160px] truncate">{c.resultNote || '—'}</td>
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