import { useState } from 'react';
import type { ClientCard, WorkItem } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import { CALL_RESULTS, WORK_INTERVALS } from '@/data/mockData';
import { formatBirthDate } from './ClientBirthdayRow';

const WORK_RESULTS = CALL_RESULTS.filter(r => r.group !== 'birthday');

type SyncFn = (id: string, result: string, note: string, callbackDate: string) => Promise<void>;

function WorkRow({
  work,
  onSync,
}: {
  work: WorkItem;
  isBirthday?: boolean;
  onSync: SyncFn;
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

  if (work.isUpcoming) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/40 border border-dashed border-border">
        <Icon name="Clock" size={14} className="text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-foreground">{workLabel}</span>
          <span className="ml-2 text-xs text-muted-foreground font-mono">{work.vin}</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20 flex-shrink-0">Предстоящие</span>
        <span className="text-xs text-muted-foreground flex-shrink-0">{new Date(work.workDate).toLocaleDateString('ru-RU')}</span>
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
            <p className="text-xs text-foreground">{new Date(work.workDate).toLocaleDateString('ru-RU')}</p>
            <p className="text-xs text-muted-foreground">{work.mileage?.toLocaleString()} км</p>
          </div>
          <div>
            {work.result && work.status === 'done' ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">{resultLabel?.slice(0, 14) || work.result}</span>
            ) : work.result && work.status === 'pending' ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">{resultLabel?.slice(0, 14) || work.result}</span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">Не обработан</span>
            )}
          </div>
        </div>
        <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-muted-foreground flex-shrink-0" />
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-border space-y-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>Заказ-наряд: <span className="text-foreground font-mono">{work.orderNumber}</span></div>
            <div>Просрочено: <span className="text-foreground">{Math.max(0, Math.floor(work.ageMonths - (WORK_INTERVALS[work.work]?.min || 0)))} мес.</span></div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Результат обработки</label>
            <select
              value={result}
              onChange={e => setResult(e.target.value)}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Выберите результат —</option>
              {WORK_RESULTS.map(r => (
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
            <input
              type="date"
              value={callbackDate}
              onChange={e => setCallbackDate(e.target.value)}
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
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
  const [expanded, setExpanded] = useState(false);
  const activeWorks = card.works.filter(w => !w.isUpcoming);
  const upcomingWorks = card.works.filter(w => w.isUpcoming);
  const allDone = activeWorks.length > 0 && activeWorks.every(w => w.status === 'done');

  return (
    <div className={`border rounded-xl overflow-hidden transition-all duration-200 ${card.isBirthday ? 'border-pink-500/30' : 'border-border'} ${expanded ? 'shadow-lg shadow-black/20' : ''}`}>
      <div
        className={`flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors ${allDone ? 'bg-success/5' : card.isBirthday ? 'bg-pink-500/5' : 'bg-card'}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">{card.name}</p>
            {card.isBirthday && card.birthDate && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400 border border-pink-500/20 font-medium">
                🎂 {formatBirthDate(card.birthDate)}
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
        <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={16} className="text-muted-foreground flex-shrink-0" />
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-3 bg-secondary/10 border-t border-border animate-fade-in space-y-2">
          {card.works.map(w => (
            <WorkRow key={w.id} work={w} isBirthday={card.isBirthday} onSync={onSync} />
          ))}
        </div>
      )}
    </div>
  );
}