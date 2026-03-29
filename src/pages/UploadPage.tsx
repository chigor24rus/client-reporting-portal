import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { apiUploadTxt } from '@/lib/api';

type UploadStatus = 'idle' | 'dragging' | 'processing' | 'done' | 'error';

interface FileResult {
  filename: string;
  format: 'orders' | 'summary' | '';
  added: number;
  updated: number;
  total: number;
  matched?: number;
  unmatched?: number;
  error?: string;
}

export default function UploadPage() {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<FileResult[]>([]);

  function filterTxt(list: File[]) {
    return list.filter(f => f.name.endsWith('.txt'));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setStatus('idle');
    const dropped = filterTxt(Array.from(e.dataTransfer.files));
    if (dropped.length) setFiles(prev => [...prev, ...dropped]);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = filterTxt(Array.from(e.target.files || []));
    if (selected.length) setFiles(prev => [...prev, ...selected]);
    e.target.value = '';
  }

  function removeFile(i: number) {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleProcess() {
    if (!files.length) return;
    setStatus('processing');
    setResults([]);

    const fileResults: FileResult[] = [];

    for (const file of files) {
      const reader = new FileReader();
      const content: string = await new Promise(resolve => {
        reader.onload = () => {
          const arr = new Uint8Array(reader.result as ArrayBuffer);
          let binary = '';
          arr.forEach(b => { binary += String.fromCharCode(b); });
          resolve(btoa(binary));
        };
        reader.readAsArrayBuffer(file);
      });

      const { status: httpStatus, data } = await apiUploadTxt(file.name, content);
      const d = data as Record<string, unknown>;

      if (httpStatus === 200 && d.ok) {
        fileResults.push({
          filename: file.name,
          format: (d.format as 'orders' | 'summary') || '',
          added: (d.added as number) || 0,
          updated: (d.updated as number) || 0,
          total: d.total as number,
          matched: (d.matched as number) || 0,
          unmatched: (d.unmatched as number) || 0,
        });
      } else {
        fileResults.push({
          filename: file.name,
          format: '',
          added: 0,
          updated: 0,
          total: 0,
          error: (d.error as string) || 'Неизвестная ошибка',
        });
      }

      setResults([...fileResults]);
    }

    const hasError = fileResults.some(r => r.error);
    setStatus(hasError ? 'error' : 'done');
  }

  const totalAdded = results.reduce((s, r) => s + r.added, 0);
  const totalUpdated = results.reduce((s, r) => s + r.updated, 0);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">Загрузка отчётов</h1>
        <p className="text-sm text-muted-foreground">Загрузите текстовые файлы из 1С для формирования списка клиентов</p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setStatus('dragging'); }}
        onDragLeave={() => setStatus('idle')}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-200 ${
          status === 'dragging'
            ? 'border-primary bg-primary/5'
            : 'border-border bg-card hover:border-primary/50'
        }`}
      >
        <div className="w-14 h-14 rounded-2xl bg-secondary mx-auto mb-4 flex items-center justify-center">
          <Icon name="FileText" size={26} className="text-muted-foreground" />
        </div>
        <p className="text-base font-semibold text-foreground mb-1">
          {status === 'dragging' ? 'Отпустите файлы' : 'Перетащите файлы сюда'}
        </p>
        <p className="text-sm text-muted-foreground mb-4">или выберите вручную (.txt из 1С)</p>
        <label className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold cursor-pointer hover:bg-primary/90 transition-all">
          <Icon name="Upload" size={16} />
          Выбрать файлы
          <input type="file" multiple accept=".txt" className="hidden" onChange={handleFile} />
        </label>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Выбранные файлы ({files.length})
          </p>
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
              <Icon name="FileText" size={18} className="text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                <p className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} КБ</p>
              </div>
              {status !== 'processing' && (
                <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Icon name="X" size={16} />
                </button>
              )}
            </div>
          ))}

          {status !== 'done' && (
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
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Результат загрузки</p>
          {results.map((r, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${r.error ? 'bg-destructive/10' : 'bg-secondary'}`}>
              <Icon
                name={r.error ? 'AlertCircle' : 'CheckCircle2'}
                size={16}
                className={`mt-0.5 flex-shrink-0 ${r.error ? 'text-destructive' : 'text-success'}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{r.filename}</p>
                {r.error ? (
                  <p className="text-xs text-destructive mt-0.5">{r.error}</p>
                ) : r.format === 'summary' ? (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-xs text-muted-foreground">
                      Тип: <span className="text-foreground font-medium">Сводный отчёт (дата рожд. + сумма)</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Всего в файле: <span className="text-foreground font-medium">{r.total}</span>
                      {' '}• Совмещено: <span className="text-success font-medium">{r.matched}</span>
                      {' '}• Не найдено: <span className={r.unmatched ? 'text-warning font-medium' : 'text-muted-foreground'}>{r.unmatched}</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Всего: {r.total} • Добавлено: {r.added} • Обновлено: {r.updated}
                  </p>
                )}
              </div>
            </div>
          ))}
          {status === 'done' && results.every(r => !r.error) && (() => {
            const summaryFiles = results.filter(r => r.format === 'summary');
            const ordersFiles = results.filter(r => r.format === 'orders');
            const totalMatched = summaryFiles.reduce((s, r) => s + (r.matched || 0), 0);
            const totalUnmatched = summaryFiles.reduce((s, r) => s + (r.unmatched || 0), 0);
            return (
              <div className="pt-2 border-t border-border space-y-1">
                {ordersFiles.length > 0 && (
                  <div className="flex items-center gap-2 text-success text-sm">
                    <Icon name="CheckCircle2" size={16} />
                    <span className="font-semibold">Добавлено {totalAdded}, обновлено {totalUpdated} записей</span>
                  </div>
                )}
                {summaryFiles.length > 0 && (
                  <div className="flex items-center gap-2 text-success text-sm">
                    <Icon name="CheckCircle2" size={16} />
                    <span className="font-semibold">
                      Совмещено {totalMatched} клиентов
                      {totalUnmatched > 0 ? `, ${totalUnmatched} не найдено в базе` : ''}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Поддерживаемые форматы</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Заказ-наряды (с VIN)</p>
            <div className="space-y-2">
              {[
                ['Ф.И.О. клиента', 'Обязательное поле'],
                ['№ телефона', 'Формат: +7 (9XX) XXX-XX-XX'],
                ['VIN автомобиля', 'До 17 символов'],
                ['Заказ-наряд', 'Номер и дата выполнения'],
                ['Пробег', 'Числовое значение (км)'],
              ].map(([field, hint]) => (
                <div key={field} className="flex items-start gap-2">
                  <Icon name="Check" size={13} className="text-success mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-foreground font-medium text-xs">{field}</p>
                    <p className="text-muted-foreground text-xs">{hint}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Сводный отчёт (дата рожд. + сумма)</p>
            <div className="space-y-2">
              {[
                ['Ф.И.О. клиента', 'Обязательное поле'],
                ['№ телефона', 'Формат: +7 (9XX) XXX-XX-XX'],
                ['Дата рождения', 'ДД.ММ.ГГГГ — может отсутствовать'],
                ['Сумма', 'Итого по заказ-нарядам (руб.)'],
                ['Совмещение', 'По телефону, затем по Ф.И.О.'],
              ].map(([field, hint]) => (
                <div key={field} className="flex items-start gap-2">
                  <Icon name="Check" size={13} className="text-success mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-foreground font-medium text-xs">{field}</p>
                    <p className="text-muted-foreground text-xs">{hint}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}