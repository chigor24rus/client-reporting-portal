import { AppProvider, useApp } from '@/context/AppContext';
import LoginPage from '@/pages/LoginPage';
import Layout from '@/components/Layout';
import DashboardPage from '@/pages/DashboardPage';
import UploadPage from '@/pages/UploadPage';
import MastersPage from '@/pages/MastersPage';
import StatisticsPage from '@/pages/StatisticsPage';
import ReportsPage from '@/pages/ReportsPage';
import IntegrationPage from '@/pages/IntegrationPage';
import AdminsPage from '@/pages/AdminsPage';

function AppContent() {
  const { user, authLoading, currentPage } = useApp();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Загрузка...</span>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const renderPage = () => {
    if (user.role === 'master') return <DashboardPage />;
    switch (currentPage) {
      case 'upload': return <UploadPage />;
      case 'masters': return <MastersPage />;
      case 'statistics': return <StatisticsPage />;
      case 'reports': return <ReportsPage />;
      case 'admins': return <AdminsPage />;
      case 'integration': return <IntegrationPage />;
      default: return <UploadPage />;
    }
  };

  return (
    <Layout>
      <div className="animate-fade-in">
        {renderPage()}
      </div>
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}