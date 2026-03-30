import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/icon';

const MASTER_NAV = [
  { id: 'dashboard', label: 'Мой список', icon: 'ClipboardList' },
];

const ADMIN_NAV = [
  { id: 'upload', label: 'Загрузка отчётов', icon: 'Upload' },
  { id: 'masters', label: 'Мастера', icon: 'Users' },
  { id: 'statistics', label: 'Статистика', icon: 'BarChart3' },
  { id: 'reports', label: 'Отчёты', icon: 'FileText' },
  { id: 'admins', label: 'Администраторы', icon: 'ShieldCheck' },
  { id: 'integration', label: 'Интеграция 1С', icon: 'Link2' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, currentPage, setCurrentPage } = useApp();

  const navItems = user?.role === 'admin' ? ADMIN_NAV : MASTER_NAV;

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      <aside className="w-56 flex-shrink-0 border-r border-border bg-sidebar flex flex-col h-screen sticky top-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <img
              src="https://cdn.poehali.dev/projects/505db067-f0f2-478b-8276-f5f75d273563/bucket/c3bac887-a637-4c12-bfbf-380b7032582d.png"
              alt="HEVSR logo"
              className="w-9 h-9 flex-shrink-0 object-contain"
            />
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">HEVSR</p>
              <p className="text-xs text-muted-foreground">Портал</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2 mt-1">
            {user?.role === 'admin' ? 'Администрирование' : 'Рабочий стол'}
          </p>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`nav-item w-full ${currentPage === item.id ? 'active' : 'text-muted-foreground'}`}
            >
              <Icon name={item.icon} size={16} fallback="Circle" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center flex-shrink-0">
              <Icon name="User" size={14} className="text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.role === 'admin' ? 'Администратор' : 'Мастер'}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="nav-item w-full text-muted-foreground hover:text-destructive"
          >
            <Icon name="LogOut" size={16} />
            Выйти
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}