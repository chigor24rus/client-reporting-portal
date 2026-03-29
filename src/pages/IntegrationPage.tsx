import Icon from '@/components/ui/icon';

export default function IntegrationPage() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">Интеграция с 1С</h1>
        <p className="text-sm text-muted-foreground">Планируется в будущих обновлениях</p>
      </div>

      <div className="metric-card text-center py-12">
        <div className="w-16 h-16 rounded-2xl bg-secondary mx-auto mb-4 flex items-center justify-center">
          <Icon name="Link2" size={28} className="text-muted-foreground" />
        </div>
        <p className="text-base font-semibold text-foreground mb-2">Раздел в разработке</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Здесь будет настроена двусторонняя синхронизация с 1С: автоматическая загрузка заказ-нарядов, 
          синхронизация клиентской базы и экспорт результатов обработки.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Запланированные возможности</p>
        {[
          ['Автозагрузка отчётов', 'Выгрузка из 1С по расписанию без ручной загрузки файлов', 'RefreshCcw'],
          ['Синхронизация клиентской базы', 'Актуальные данные клиентов и VIN-номера в реальном времени', 'Database'],
          ['Двусторонний обмен', 'Результаты обработки мастеров передаются обратно в 1С', 'ArrowLeftRight'],
          ['Журнал синхронизации', 'Логирование всех операций обмена данными', 'ScrollText'],
        ].map(([title, desc, icon]) => (
          <div key={title} className="flex items-start gap-4 bg-card border border-border rounded-xl px-4 py-3.5">
            <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
              <Icon name={icon} size={18} className="text-muted-foreground" fallback="Circle" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
            <span className="ml-auto text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded font-medium self-start">Скоро</span>
          </div>
        ))}
      </div>
    </div>
  );
}
