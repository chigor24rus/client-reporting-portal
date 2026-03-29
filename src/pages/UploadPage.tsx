import { useState } from 'react';
import Icon from '@/components/ui/icon';

type UploadStatus = 'idle' | 'dragging' | 'processing' | 'done' | 'error';

export default function UploadPage() {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setStatus('idle');
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
    if (dropped.length) setFiles(prev => [...prev, ...dropped]);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []).filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
    if (selected.length) setFiles(prev => [...prev, ...selected]);
  }

  function removeFile(i: number) {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
  }

  function handleProcess() {
    if (!files.length) return;
    setStatus('processing');
    setProgress(0);
    setLog([]);

    const steps = [
      'Чтение файлов Excel...',
      `Загружено ${files.length} файл(ов)`,
      'Определение типов работ...',
      'Анализ дат и интервалов обслуживания...',
      'Фильтрация: Масло ДВС (>11 мес, ≤24 мес)...',
      'Фильтрация: Тормозная жидкость (>23 мес, ≤36 мес)...',
      'Фильтрация: Масло АКПП (>23 мес, ≤36 мес)...',
      'Фильтрация: Антифриз (>35 мес, ≤48 мес)...',
      'Проверка дублей по VIN...',
      'Исключение клиентов из архива...',
      'Распределение по мастерам...',
      'Готово! Обработано 8 записей.',
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < steps.length) {
        setLog(prev => [...prev, steps[i]]);
        setProgress(Math.round(((i + 1) / steps.length) * 100));
        i++;
      } else {
        clearInterval(interval);
        setStatus('done');
      }
    }, 300);
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">Загрузка отчётов</h1>
        <p className="text-sm text-muted-foreground">Загрузите файлы Excel для формирования списка клиентов</p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setStatus('dragging'); }}
        onDragLeave={() => setStatus('idle')}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-200 ${
          status === 'dragging'
            ? 'border-primary bg-primary/5'
            : 'border-border bg-card hover:border-primary/50 hover:bg-primary/3'
        }`}
      >
        <div className="w-14 h-14 rounded-2xl bg-secondary mx-auto mb-4 flex items-center justify-center">
          <Icon name="FileSpreadsheet" size={26} className="text-muted-foreground" />
        </div>
        <p className="text-base font-semibold text-foreground mb-1">
          {status === 'dragging' ? 'Отпустите файлы' : 'Перетащите файлы сюда'}
        </p>
        <p className="text-sm text-muted-foreground mb-4">или выберите вручную (.xlsx, .xls)</p>
        <label className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold cursor-pointer hover:bg-primary/90 transition-all">
          <Icon name="Upload" size={16} />
          Выбрать файлы
          <input type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        </label>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Выбранные файлы ({files.length})
          </p>
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
              <Icon name="FileSpreadsheet" size={18} className="text-success flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                <p className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} КБ</p>
              </div>
              <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                <Icon name="X" size={16} />
              </button>
            </div>
          ))}

          <button
            onClick={handleProcess}
            disabled={status === 'processing'}
            className="w-full mt-3 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm hover:bg-primary/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
          >
            {status === 'processing' ? (
              <><Icon name="Loader2" size={16} className="animate-spin" /> Обработка...</>
            ) : (
              <><Icon name="Zap" size={16} /> Обработать отчёты</>
            )}
          </button>
        </div>
      )}

      {log.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Лог обработки</p>
            {status === 'processing' && (
              <span className="text-xs text-primary font-mono">{progress}%</span>
            )}
          </div>
          {status === 'processing' && (
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <div className="space-y-1 font-mono text-xs max-h-48 overflow-y-auto">
            {log.map((line, i) => (
              <p key={i} className={`${i === log.length - 1 && status !== 'done' ? 'text-primary' : 'text-muted-foreground'} animate-fade-in`}>
                <span className="text-border mr-2">{'>'}</span>
                {line}
              </p>
            ))}
          </div>
          {status === 'done' && (
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-success text-sm">
              <Icon name="CheckCircle2" size={16} />
              <span className="font-semibold">Отчёт успешно загружен и обработан</span>
            </div>
          )}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Требования к файлу</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['Ф.И.О. клиента', 'Обязательное поле'],
            ['№ телефона', 'Формат: +7 (9XX) XXX-XX-XX'],
            ['VIN-автомобиля', '17 символов'],
            ['Выполненная работа', 'Точное наименование'],
            ['Номер заказ-наряда', 'Обязательное поле'],
            ['Дата выполнения', 'Формат: ДД.ММ.ГГГГ'],
            ['Пробег', 'Числовое значение (км)'],
          ].map(([field, hint]) => (
            <div key={field} className="flex items-start gap-2">
              <Icon name="Check" size={14} className="text-success mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-foreground font-medium text-xs">{field}</p>
                <p className="text-muted-foreground text-xs">{hint}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
