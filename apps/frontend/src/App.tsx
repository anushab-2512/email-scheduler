import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ScheduledMailDetailsPage } from './features/scheduled-emails/ScheduledMailDetailsPage';
import { useCurrentUser } from './hooks/useAuth';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ToastProvider } from './components/common/Toast';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data: user, isLoading, isError } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size={36} text="Authenticating session..." />
      </div>
    );
  }

  if (isError || !user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  React.useEffect(() => {
    // Keepalive ping every 4 minutes to prevent Render free tier from sleeping while tab is open
    const interval = setInterval(() => {
      fetch('/api/health').catch(() => {});
    }, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scheduled-mails/:id"
            element={
              <ProtectedRoute>
                <ScheduledMailDetailsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
};
