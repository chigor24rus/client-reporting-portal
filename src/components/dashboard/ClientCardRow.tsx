import { useState, useEffect, useRef } from 'react';
import type { ClientCard, WorkItem } from '@/context/AppContext';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import { CALL_RESULTS, WORK_INTERVALS, WORK_RESULT_MAP } from '@/data/mockData';
import { formatBirthDate } from './ClientBirthdayRow';

type SyncFn = (id: string, result: string, note: string, callbackDate: string) => Promise<void>;

function getWorkResults(workType: string, totalActiveWorks: number) {
  const thisWorkValue = WORK_RESULT_MAP[workType];
  const allWorkValues = new Set(Object.values(WORK_RESULT_MAP));
  return CALL_RESULTS.filter(r => {
    if (r.group === 'birthday') return false;
    if (r.value === '1') return totalActiveWorks > 1;
    if (r.group === 'work' && allWorkValues.has(r.value)) {
      return r.value === thisWorkValue;
    }
    return true;
  });
}

function WorkRow({
  work,
  onSync,
  totalActiveWorks,
}: {
  work: WorkItem;
  isBirthday?: boolean;
  onSync: SyncFn;
  totalActiveWorks: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState(work.result || '');
  const [note, setNote] = useState(work.resultNote || '');
  const [callbackDate, setCallbackDate] = useState(work.callbackDate || '');
  const [saving, setSaving] = useState(false);

  const workLabel = WORK_INTERVALS[work.work]?.label || work.work;
  const resultLabel = CALL_RESULTS.find(r => r.value === work.result)?.label;
  const needsNote = ['3', '5', '6'].includes(result);
  const needsCallback = result === '5';

  async function handleSave() {
    setSaving(true);
    await onSync(work.id, result, note, callbackDate);
    setSaving(false);
    setExpanded(false);
  }

  if (work.isNoData && work.status !== 'done' && !expanded) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-destructive/5 border border-dashed border-destructive/30 cursor-pointer hover:bg-destructive/10 transition-colors"
        onClick={() => setExpanded(true)}
      >
        <Icon name="AlertCircle" size={14} className="text-destructive flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-foreground">{workLabel}</span>
          <span className="ml-2 text-xs text-muted-foreground font-mono">{work.vin}</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 flex-shrink-0">Нет данных — предложите!</span>
        <Icon name="ChevronDown" size={14} className="text-muted-foreground flex-shrink-0" />
      </div>
    );
  }

  if (work.isUpcoming && work.status !== 'done' && !expanded) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/40 border border-dashed border-border cursor-pointer hover:bg-secondary/60 transition-colors"
        onClick={() => setExpanded(true)}
      >
        <Icon name="Clock" size={14} className="text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-foreground">{workLabel}</span>
          <span className="ml-2 text-xs text-muted-foreground font-mono">{work.vin}</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20 flex-shrink-0">Предстоящие</span>
        <span className="text-xs text-muted-foreground flex-shrink-0">{work.workDate && work.workDate !== '0' ? new Date(work.workDate + 'T00:00:00').toLocaleDateString('ru-RU') : ''}</span>
        <Icon name="ChevronDown" size={14} className="text-muted-foreground flex-shrink-0" />
      </div>
    );
  }

  return (
    <div className={`rounded-lg border transition-all duration-200 ${expanded ? 'border-primary/40 shadow-sm shadow-primary/10' : 'border-border'}`}>
      <div
        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-secondary/30 rounded-lg transition-colors ${work.status === 'done' ? 'bg-success/5' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0 grid grid-cols-[140px_1fr_110px_100px] gap-3 items-center">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-secondary text-foreground border border-border w-fit">{workLabel}</span>
          <span className="text-xs font-mono text-muted-foreground truncate">{work.vin}</span>
          <div>
            {work.isNoData ? (
              <span className="text-xs text-destructive font-medium">Нет данных</span>
            ) : (
              <>
                <p className="text-xs text-foreground">{work.workDate && work.workDate !== '0' ? new Date(work.workDate + 'T00:00:00').toLocaleDateString('ru-RU') : '—'}</p>
                <p className="text-xs text-muted-foreground">{work.mileage?.toLocaleString()} км</p>
              </>
            )}
          </div>
          <div>
            {work.result && work.status === 'done' ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">{resultLabel?.slice(0, 14) || work.result}</span>
            ) : work.result && work.status === 'pending' ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">{resultLabel?.slice(0, 14) || work.result}</span>
            ) : work.isNoData ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">Предложите!</span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">Не обработан</span>
            )}
          </div>
        </div>
        <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-muted-foreground flex-shrink-0" />
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-border space-y-3 animate-fade-in">
          {work.isNoData ? (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20">
              <Icon name="Info" size={14} className="text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">Данные об этой замене отсутствуют в загруженных отчётах. Уточните у клиента и предложите записаться.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div>Заказ-наряд: <span className="text-foreground font-mono">{work.orderNumber}</span></div>
              <div>Просрочено: <span className="text-foreground">{Math.max(0, Math.floor(work.ageMonths - (WORK_INTERVALS[work.work]?.min || 0)))} мес.</span></div>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Результат обработки</label>
            <select
              value={result}
              onChange={e => setResult(e.target.value)}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Выберите результат —</option>
              {getWorkResults(work.work, totalActiveWorks).map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          {needsNote && (
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={result === '6' ? 'Причина смены сервиса...' : 'Комментарий...'}
              rows={2}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          )}
          {needsCallback && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Дата повторного созвона
              </label>
              <input
                type="date"
                value={callbackDate}
                onChange={e => setCallbackDate(e.target.value)}
                className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setExpanded(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors">Отмена</button>
            <button
              onClick={handleSave}
              disabled={saving || !result || (needsNote && !note) || (needsCallback && !callbackDate)}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-1.5"
            >
              {saving && <Icon name="Loader2" size={12} className="animate-spin" />}
              Сохранить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type CardProps = {
  card: ClientCard;
  onSync: SyncFn;
};

export default function ClientCardRow({ card, onSync }: CardProps) {
  const { lockClient, unlockClient, user } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [locking, setLocking] = useState(false);
  const activeWorks = card.works.filter(w => !w.isUpcoming);
  const upcomingWorks = card.works.filter(w => w.isUpcoming);
  const allDone = card.works.length > 0 && (
    activeWorks.length > 0
      ? activeWorks.every(w => w.status === 'done')
      : card.works.every(w => w.status === 'done')
  );

  // Карточка заблокирована другим пользователем
  const isLockedByOther = !!card.lockedBy && card.lockedBy !== user?.id;

  const deferredLabel = card.cardCallbackDate
    ? new Date(card.cardCallbackDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    : null;

  const firstWorkId = card.works[0]?.id;
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevLockedByOther = useRef(isLockedByOther);
  const [justLocked, setJustLocked] = useState(false);

  // Визуальная вспышка когда карточка только что заблокировалась другим
  useEffect(() => {
    if (!prevLockedByOther.current && isLockedByOther) {
      setJustLocked(true);
      const t = setTimeout(() => setJustLocked(false), 2000);
      return () => clearTimeout(t);
    }
    prevLockedByOther.current = isLockedByOther;
  }, [isLockedByOther]);

  // Heartbeat: продлеваем блокировку каждые 60 сек пока карточка открыта
  useEffect(() => {
    if (expanded && firstWorkId) {
      heartbeatRef.current = setInterval(() => {
        lockClient(firstWorkId);
      }, 60_000);
    }
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [expanded, firstWorkId, lockClient]);

  // Снимаем блокировку при размонтировании (закрытие вкладки / переход по страницам)
  useEffect(() => {
    return () => {
      if (expanded && firstWorkId) {
        unlockClient(firstWorkId);
      }
    };
  }, []);

  async function handleToggle() {
    if (isLockedByOther || !firstWorkId) return;
    if (!expanded) {
      setLocking(true);
      const ok = await lockClient(firstWorkId);
      setLocking(false);
      if (ok) setExpanded(true);
    } else {
      setExpanded(false);
      await unlockClient(firstWorkId);
    }
  }

  return (
    <div className={`border rounded-xl overflow-hidden transition-all duration-500 ${justLocked ? 'border-orange-400 shadow-lg shadow-orange-500/30 scale-[1.01]' : isLockedByOther ? 'border-orange-500/40 opacity-60' : card.isDeferred ? 'border-blue-500/30' : card.isBirthday ? 'border-pink-500/30' : 'border-border'} ${expanded ? 'shadow-lg shadow-black/20' : ''}`}>
      <div
        className={`flex items-center gap-4 px-4 py-3 transition-colors ${isLockedByOther ? 'cursor-not-allowed bg-orange-500/5' : 'cursor-pointer hover:bg-secondary/30'} ${allDone ? 'bg-success/5' : card.isDeferred ? 'bg-blue-500/5' : card.isBirthday ? 'bg-pink-500/5' : 'bg-card'}`}
        onClick={handleToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">{card.name}</p>
            {card.isBirthday && card.birthDate && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400 border border-pink-500/20 font-medium">
                🎂 {formatBirthDate(card.birthDate)}
              </span>
            )}
            {card.isDeferred && deferredLabel && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 font-medium">
                📅 Созвон {deferredLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono">{card.phone}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {activeWorks.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {activeWorks.length} {activeWorks.length === 1 ? 'работа' : 'работ'}
            </span>
          )}
          {upcomingWorks.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
              +{upcomingWorks.length} предст.
            </span>
          )}
          {allDone ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">Обработан</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">Не обработан</span>
          )}
        </div>
        {isLockedByOther ? (
          <Icon name="Lock" size={16} className="text-orange-400 flex-shrink-0" />
        ) : locking ? (
          <Icon name="Loader2" size={16} className="text-muted-foreground flex-shrink-0 animate-spin" />
        ) : (
          <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={16} className="text-muted-foreground flex-shrink-0" />
        )}
      </div>
      {isLockedByOther && (
        <div className="px-4 py-1.5 bg-orange-500/10 border-t border-orange-500/20 text-xs text-orange-400 flex items-center gap-1.5">
          <Icon name="Lock" size={11} />
          Открыта: {card.lockedByName
            ? (() => { const parts = card.lockedByName.split(' '); return parts[0] + (parts[1] ? ' ' + parts[1][0] + '.' : ''); })()
            : 'другой мастер'}
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4 pt-3 bg-secondary/10 border-t border-border animate-fade-in space-y-2">
          {(() => {
            const totalActive = card.works.filter(x => x.isUpcoming !== true).length;
            return card.works.map(w => (
              <WorkRow
                key={w.id}
                work={w}
                isBirthday={card.isBirthday}
                onSync={onSync}
                totalActiveWorks={totalActive}
              />
            ));
          })()}
        </div>
      )}
    </div>
  );
}