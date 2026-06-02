import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

import Dashboard from './pages/Dashboard';
import Stock from './pages/Stock';
import RecordSale from './pages/RecordSale';
import SalesHistory from './pages/SalesHistory';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Insights from './pages/Insights';
import Profile from './pages/Profile';
import Staff from './pages/Staff';

/*Sends authenticated cashiers to /sales/new and admins to /dashboard.*/
function HomeRedirect() {
  const { isAuthenticated, isCashier, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={isCashier ? '/sales/new' : '/dashboard'} replace />;
}

/**
 * Sends authenticated users away from public auth pages.
 */
function PublicOnly({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login"           element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register"        element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      {/* Authenticated app */}
      <Route element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      }>
        <Route path="/dashboard"     element={<Dashboard />} />
        <Route path="/stock"         element={<Stock />} />
        <Route path="/sales/new"     element={<RecordSale />} />
        <Route path="/sales/history" element={<SalesHistory />} />
        <Route path="/expenses"      element={<Expenses />} />
        <Route path="/reports"       element={<Reports />} />
        <Route path="/insights"      element={<Insights />} />
        <Route path="/profile"       element={<Profile />} />
        <Route path="/staff"         element={<Staff />} />
      </Route>

      {/* Default redirect */}
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
