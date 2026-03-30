import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import type { ApiUser } from '@/context/AppContext';

export default function MastersPage() {
  const { apiUsers, loadingUsers, refreshUsers, clients, createUser, removeUser, toggleUserActive, updateUserPassword } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', password: '' });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editMaster, setEditMaster] = useState<ApiUser | null>(null);
  const [editForm, setEditForm] = useState({ phone: '', password: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const masters = apiUsers.filter(u => u.role === 'master');

  useEffect(() => { refreshUsers(); }, []);

  function getStats(masterId: string) {
    const mc = clients.filter(c => c.masterId === masterId && !c.isExcluded);
    const done = mc.filter(c => c.status === 'done').length;
    return { total: mc.length, done, rate: mc.length ? Math.round((done / mc.length) * 100) : 0 };
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.phone.trim()) return setError('Заполните Ф.И.О. и телефон');
    if (!form.password || form.password.length < 4) return setError('Пароль не менее 4 символов');

    const err = await createUser({ name: form.name.trim(), phone: form.phone, password: form.password, role: 'master' });
    if (err) return setError(err);

    setSuccess('Мастер успешно добавлен');
    setForm({ name: '', phone: '', password: '' });
    setShowForm(false);
    setTimeout(() => setSuccess(''), 3000);
  }

  function openEdit(master: ApiUser) {
    setEditMaster(master);
    setEditForm({ phone: master.phone, password: '' });
    setEditError('');
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editMaster) return;
    setEditError('');
    if (editForm.password && editForm.password.length < 4) return setEditError('Пароль не менее 4 символов');
    setEditSaving(true);
    const payload: { phone?: string; password?: string } = {};
    if (editForm.phone.trim() && editForm.phone.trim() !== editMaster.phone) payload.phone = editForm.phone.trim();
    if (editForm.password) payload.password = editForm.password;
    if (Object.keys(payload).length === 0) { setEditMaster(null); setEditSaving(false); return; }
    await updateUserPassword(editMaster.id, payload as Parameters<typeof updateUserPassword>[1]);
    await refreshUsers();
    setEditSaving(false);
    setEditMaster(null);
    setSuccess('Данные мастера обновлены');
    setTimeout(() => setSuccess(''), 3000);
  }

  if (loadingUsers && masters.length === 0) {
    return (
      <div className="p-6 flex items-center gap-3 text-muted-foreground">
        <Icon name="Loader2" size={18} className="animate-spin" />
        Загрузка...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Мастера-консультанты</h1>
          <p className="text-sm text-muted-foreground">{masters.length} сотрудников</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(''); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-all"
        >
          <Icon name={showForm ? 'X' : 'UserPlus'} size={16} />
          {showForm ? 'Отмена' : 'Добавить мастера'}
        </button>
      </div>

      {success && (
        <div className="flex items-center gap-2 text-success text-sm bg-success/10 border border-success/20 rounded-xl px-4 py-3 animate-fade-in">
          <Icon name="CheckCircle2" size={16} />{success}
        </div>
      )}

      {showForm && (
        <div className="bg-card border border-primary/30 rounded-xl p-5 animate-fade-in">
          <p className="text-sm font-semibold text-foreground mb-4">Новый мастер-консультант</p>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Ф.И.О.</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Иванов Иван Иванович"
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Номер телефона (логин)</label>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+7 (9XX) XXX-XX-XX"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Пароль</label>
                <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Мин. 4 символа"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <Icon name="AlertCircle" size={14} />{error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors">Отмена</button>
              <button type="submit" className="px-4 py-2 text-sm bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all">Добавить</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {masters.map((master: ApiUser) => {
          const stats = getStats(master.masterId || master.id);
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
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${stats.rate}%`,
                          background: stats.rate >= 70 ? 'hsl(142 72% 42%)' : stats.rate >= 40 ? 'hsl(38 92% 52%)' : 'hsl(0 70% 50%)',
                        }} />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openEdit(master)}
                    className="p-2 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-all"
                    title="Редактировать"
                  >
                    <Icon name="Pencil" size={15} />
                  </button>
                  <button
                    onClick={() => toggleUserActive(master.id, !master.active)}
                    className={`p-2 rounded-lg border transition-all ${master.active ? 'border-border text-muted-foreground hover:text-warning hover:border-warning/50' : 'border-success/30 text-success hover:bg-success/10'}`}
                    title={master.active ? 'Отключить' : 'Включить'}
                  >
                    <Icon name={master.active ? 'Pause' : 'Play'} size={14} />
                  </button>
                  {deleteId === master.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => { removeUser(master.id); setDeleteId(null); }}
                        className="p-2 rounded-lg border border-destructive/50 text-destructive hover:bg-destructive/10 transition-all">
                        <Icon name="Check" size={14} />
                      </button>
                      <button onClick={() => setDeleteId(null)} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-all">
                        <Icon name="X" size={14} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteId(master.id)}
                      className="p-2 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all">
                      <Icon name="Trash2" size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {masters.length === 0 && !loadingUsers && (
          <div className="text-center py-10 text-muted-foreground">
            <Icon name="Users" size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Нет мастеров-консультантов</p>
          </div>
        )}
      </div>

      {editMaster && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditMaster(null)}>
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-sm font-bold text-foreground">Редактировать мастера</p>
                <p className="text-xs text-muted-foreground mt-0.5">{editMaster.name}</p>
              </div>
              <button onClick={() => setEditMaster(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                <Icon name="X" size={18} />
              </button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Номер телефона (логин)</label>
                <input
                  value={editForm.phone}
                  onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+7 (9XX) XXX-XX-XX"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Новый пароль <span className="normal-case font-normal">(оставьте пустым, если не меняете)</span></label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="Мин. 4 символа"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {editError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <Icon name="AlertCircle" size={14} />{editError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditMaster(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors">Отмена</button>
                <button type="submit" disabled={editSaving} className="px-4 py-2 text-sm bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-2">
                  {editSaving && <Icon name="Loader2" size={14} className="animate-spin" />}
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}