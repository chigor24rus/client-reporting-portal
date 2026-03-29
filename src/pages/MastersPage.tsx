import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import type { Master } from '@/data/mockData';

export default function MastersPage() {
  const { masters, addMaster, removeMaster, toggleMaster, clients } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return;
    addMaster({ name: form.name, phone: form.phone, active: true });
    setForm({ name: '', phone: '' });
    setShowForm(false);
  }

  function getStats(masterId: string) {
    const mc = clients.filter(c => c.masterId === masterId && !c.isExcluded);
    const done = mc.filter(c => c.status === 'done').length;
    return { total: mc.length, done, rate: mc.length ? Math.round((done / mc.length) * 100) : 0 };
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Мастера-консультанты</h1>
          <p className="text-sm text-muted-foreground">{masters.length} сотрудников</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-all"
        >
          <Icon name={showForm ? 'X' : 'UserPlus'} size={16} />
          {showForm ? 'Отмена' : 'Добавить мастера'}
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-primary/30 rounded-xl p-5 animate-fade-in">
          <p className="text-sm font-semibold text-foreground mb-4">Новый мастер-консультант</p>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Ф.И.О.
              </label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Иванов Иван Иванович"
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Номер телефона
              </label>
              <input
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="+7 (9XX) XXX-XX-XX"
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors">
                Отмена
              </button>
              <button type="submit" className="px-4 py-2 text-sm bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all">
                Добавить
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {masters.map(master => {
          const stats = getStats(master.id);
          return (
            <div key={master.id} className={`bg-card border rounded-xl p-5 transition-all ${master.active ? 'border-border' : 'border-border opacity-60'}`}>
              <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${master.active ? 'bg-primary/10 border border-primary/30' : 'bg-secondary border border-border'}`}>
                  <Icon name="User" size={20} className={master.active ? 'text-primary' : 'text-muted-foreground'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-foreground">{master.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${master.active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {master.active ? 'Активен' : 'Отключён'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{master.phone}</p>

                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                      <p className="text-base font-bold text-foreground">{stats.total}</p>
                      <p className="text-xs text-muted-foreground">Клиентов</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                      <p className="text-base font-bold text-success">{stats.done}</p>
                      <p className="text-xs text-muted-foreground">Обработано</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                      <p className={`text-base font-bold ${stats.rate >= 70 ? 'text-success' : stats.rate >= 40 ? 'text-warning' : 'text-destructive'}`}>
                        {stats.rate}%
                      </p>
                      <p className="text-xs text-muted-foreground">Готовность</p>
                    </div>
                  </div>

                  {stats.total > 0 && (
                    <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${stats.rate}%`,
                          background: stats.rate >= 70 ? 'hsl(142 72% 42%)' : stats.rate >= 40 ? 'hsl(38 92% 52%)' : 'hsl(0 70% 50%)',
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleMaster(master.id)}
                    className={`p-2 rounded-lg border transition-all text-xs font-medium ${master.active ? 'border-border text-muted-foreground hover:text-warning hover:border-warning/50' : 'border-success/30 text-success hover:bg-success/10'}`}
                    title={master.active ? 'Отключить' : 'Включить'}
                  >
                    <Icon name={master.active ? 'Pause' : 'Play'} size={14} />
                  </button>
                  {deleteId === master.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => removeMaster(master.id)} className="p-2 rounded-lg border border-destructive/50 text-destructive hover:bg-destructive/10 transition-all">
                        <Icon name="Check" size={14} />
                      </button>
                      <button onClick={() => setDeleteId(null)} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-all">
                        <Icon name="X" size={14} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteId(master.id)} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all">
                      <Icon name="Trash2" size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
