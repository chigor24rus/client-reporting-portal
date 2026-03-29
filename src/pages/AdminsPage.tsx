import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';
import type { ApiUser } from '@/context/AppContext';

export default function AdminsPage() {
  const { user, apiUsers, loadingUsers, refreshUsers, createUser, updateUserPassword, removeUser } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'password'>('add');
  const [form, setForm] = useState({ name: '', phone: '', password: '', confirm: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const admins = apiUsers.filter(u => u.role === 'admin');

  useEffect(() => { refreshUsers(); }, []);

  function formatPhone(val: string) {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    let result = '+7';
    if (digits.length > 1) result += ' (' + digits.slice(1, 4);
    if (digits.length > 4) result += ') ' + digits.slice(4, 7);
    if (digits.length > 7) result += '-' + digits.slice(7, 9);
    if (digits.length > 9) result += '-' + digits.slice(9, 11);
    return result;
  }

  function resetForm() {
    setForm({ name: '', phone: '', password: '', confirm: '' });
    setError('');
    setEditId(null);
    setShowForm(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Введите Ф.И.О.');
    if (form.phone.replace(/\D/g, '').length < 11) return setError('Введите корректный номер телефона');
    if (form.password.length < 4) return setError('Пароль должен быть не менее 4 символов');
    if (form.password !== form.confirm) return setError('Пароли не совпадают');

    const err = await createUser({ name: form.name.trim(), phone: form.phone, password: form.password, role: 'admin' });
    if (err) return setError(err);

    setSuccess('Администратор успешно добавлен');
    resetForm();
    setTimeout(() => setSuccess(''), 3000);
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (form.password.length < 4) return setError('Пароль должен быть не менее 4 символов');
    if (form.password !== form.confirm) return setError('Пароли не совпадают');
    if (!editId) return;
    await updateUserPassword(editId, form.password);
    setSuccess('Пароль успешно изменён');
    resetForm();
    setTimeout(() => setSuccess(''), 3000);
  }

  function openPasswordEdit(id: string) {
    setEditId(id);
    setFormMode('password');
    setForm({ name: '', phone: '', password: '', confirm: '' });
    setError('');
    setShowForm(true);
  }

  function openAdd() {
    setFormMode('add');
    setForm({ name: '', phone: '', password: '', confirm: '' });
    setError('');
    setEditId(null);
    setShowForm(true);
  }

  const isSelf = (id: string) => id === user?.id;

  if (loadingUsers && admins.length === 0) {
    return (
      <div className="p-6 flex items-center gap-3 text-muted-foreground">
        <Icon name="Loader2" size={18} className="animate-spin" />
        Загрузка...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Администраторы</h1>
          <p className="text-sm text-muted-foreground">{admins.length} учётных записей</p>
        </div>
        <button
          onClick={showForm ? resetForm : openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-all"
        >
          <Icon name={showForm ? 'X' : 'UserPlus'} size={16} />
          {showForm ? 'Отмена' : 'Добавить администратора'}
        </button>
      </div>

      {success && (
        <div className="flex items-center gap-2 text-success text-sm bg-success/10 border border-success/20 rounded-xl px-4 py-3 animate-fade-in">
          <Icon name="CheckCircle2" size={16} />
          {success}
        </div>
      )}

      {showForm && (
        <div className="bg-card border border-primary/30 rounded-xl p-5 animate-fade-in">
          <p className="text-sm font-semibold text-foreground mb-4">
            {formMode === 'add' ? 'Новый администратор' : 'Изменить пароль'}
          </p>
          <form onSubmit={formMode === 'add' ? handleAdd : handlePasswordChange} className="space-y-3">
            {formMode === 'add' && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Ф.И.О.</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Иванов Иван Иванович"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Номер телефона</label>
                  <div className="relative">
                    <Icon name="Phone" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: formatPhone(e.target.value) }))} placeholder="+7 (___) ___-__-__"
                      className="w-full bg-input border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {formMode === 'add' ? 'Пароль' : 'Новый пароль'}
                </label>
                <div className="relative">
                  <Icon name="Lock" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Мин. 4 символа"
                    className="w-full bg-input border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Подтверждение</label>
                <div className="relative">
                  <Icon name="Lock" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="password" value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))} placeholder="Повторите пароль"
                    className="w-full bg-input border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <Icon name="AlertCircle" size={14} />{error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={resetForm} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors">Отмена</button>
              <button type="submit" className="px-4 py-2 text-sm bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all">
                {formMode === 'add' ? 'Добавить' : 'Сохранить пароль'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {admins.map((admin: ApiUser) => (
          <div key={admin.id} className={`bg-card border rounded-xl p-5 transition-all ${isSelf(admin.id) ? 'border-primary/40' : 'border-border'}`}>
            <div className="flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${isSelf(admin.id) ? 'bg-primary/10 border border-primary/30' : 'bg-secondary border border-border'}`}>
                <Icon name="ShieldCheck" size={20} className={isSelf(admin.id) ? 'text-primary' : 'text-muted-foreground'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-foreground">{admin.name}</p>
                  {isSelf(admin.id) && <span className="text-xs px-2 py-0.5 rounded bg-primary/15 text-primary font-medium">Это вы</span>}
                  {!admin.active && <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">Отключён</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">{admin.phone}</span>
                  {admin.createdAt && <><span>·</span><span>Добавлен {new Date(admin.createdAt).toLocaleDateString('ru-RU')}</span></>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => openPasswordEdit(admin.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:border-primary/50 transition-all">
                  <Icon name="KeyRound" size={13} />Пароль
                </button>
                {!isSelf(admin.id) && (
                  deleteId === admin.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => { removeUser(admin.id); setDeleteId(null); }}
                        className="p-1.5 rounded-lg border border-destructive/50 text-destructive hover:bg-destructive/10 transition-all">
                        <Icon name="Check" size={14} />
                      </button>
                      <button onClick={() => setDeleteId(null)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-all">
                        <Icon name="X" size={14} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteId(admin.id)}
                      className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all">
                      <Icon name="Trash2" size={14} />
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        ))}

        {admins.length === 0 && !loadingUsers && (
          <div className="text-center py-10 text-muted-foreground">
            <Icon name="ShieldOff" size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Нет администраторов</p>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
        <Icon name="Info" size={15} className="text-info mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          Администраторы имеют полный доступ ко всем разделам портала. Себя удалить нельзя.
        </p>
      </div>
    </div>
  );
}
