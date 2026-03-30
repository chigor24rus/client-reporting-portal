import { useState } from 'react';
import type { ClientCard } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import { CALL_RESULTS } from '@/data/mockData';

const BIRTHDAY_ONLY_RESULTS = CALL_RESULTS.filter(r => r.group === 'birthday' || r.value === '5' || r.value === '8');

export function formatBirthDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

type Props = {
  card: ClientCard;
  onSync: (id: string, result: string, note: string, callbackDate: string) => Promise<void>;
};

export default function ClientBirthdayRow({ card, onSync }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState('');
  const [note, setNote] = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  const [saving, setSaving] = useState(false);

  const needsCallback = result === '5';
  const needsNote = ['3', '5', '6'].includes(result);
  const syntheticId = `birthday_${card.phone}`;

  async function handleSave() {
    setSaving(true);
    await onSync(syntheticId, result, note, callbackDate);
    setSaving(false);
    setExpanded(false);
  }

  return (
    <div className={`rounded-xl border transition-all duration-200 overflow-hidden ${expanded ? 'border-pink-500/40 shadow-lg shadow-pink-500/5' : 'border-pink-500/20 bg-pink-500/5'}`}>
      <div
        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-pink-500/10 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-8 h-8 rounded-full bg-pink-500/15 flex items-center justify-center flex-shrink-0">
          <span className="text-base">🎂</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">{card.name}</p>
            {card.birthDate && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400 border border-pink-500/20 font-medium">
                {formatBirthDate(card.birthDate)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono">{card.phone}
            {card.totalSpent ? <span className="ml-2 text-pink-400/70">{card.totalSpent.toLocaleString('ru-RU')} ₽ за всё время</span> : null}
          </p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20 flex-shrink-0">Не обработан</span>
        <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={16} className="text-muted-foreground flex-shrink-0" />
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-3 bg-secondary/10 border-t border-border space-y-3 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Результат обработки
            </label>
            <select
              value={result}
              onChange={e => setResult(e.target.value)}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Выберите результат —</option>
              {BIRTHDAY_ONLY_RESULTS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          {needsNote && (
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Комментарий..."
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
            <button onClick={() => setExpanded(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors">
              Отмена
            </button>
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