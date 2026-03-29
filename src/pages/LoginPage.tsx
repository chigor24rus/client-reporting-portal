import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';

export default function LoginPage() {
  const { login } = useApp();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setTimeout(() => {
      const ok = login(phone, password);
      if (!ok) setError('Неверный номер телефона или пароль');
      setLoading(false);
    }, 600);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 grid-noise opacity-30" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-3xl" />

      <div className="relative w-full max-w-sm mx-4 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 mb-4">
            <Icon name="Wrench" size={26} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">АвтоСервис</h1>
          <p className="text-muted-foreground text-sm mt-1">Портал мастеров-консультантов</p>
        </div>

        <div className="glass rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Номер телефона
              </label>
              <div className="relative">
                <Icon name="Phone" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(formatPhone(e.target.value))}
                  placeholder="+7 (___) ___-__-__"
                  className="w-full bg-input border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Пароль
              </label>
              <div className="relative">
                <Icon name="Lock" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  className="w-full bg-input border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <Icon name="AlertCircle" size={14} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground font-semibold rounded-lg py-2.5 text-sm hover:bg-primary/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Icon name="Loader2" size={16} className="animate-spin" />
              ) : (
                <Icon name="LogIn" size={16} />
              )}
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground text-center mb-3">Демо-доступ</p>
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-muted-foreground">
                <span>Администратор:</span>
                <span className="text-foreground">+7 900 000-00-01 / 1234</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Мастер:</span>
                <span className="text-foreground">+7 901 234-56-78 / 1234</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
