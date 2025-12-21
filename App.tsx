import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Layout from './components/Layout';
import NewRequest from './pages/NewRequest';
import RequestsList from './pages/RequestsList';
import RequestDetail from './pages/RequestDetail';
import UserManagement from './pages/UserManagement';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import DocumentsPortal from './pages/DocumentsPortal';
import PredictedGradesPortal from './pages/PredictedGradesPortal';

const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Layout><Dashboard /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/new-request" element={
        <ProtectedRoute>
          <Layout><NewRequest /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/requests" element={
        <ProtectedRoute>
          <Layout><RequestsList /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/my-requests" element={
        <ProtectedRoute>
          <Layout><RequestsList /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/requests/:id" element={
        <ProtectedRoute>
          <Layout><RequestDetail /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/users" element={
        <ProtectedRoute>
          <Layout><UserManagement /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/profile" element={
        <ProtectedRoute>
          <Layout><Profile /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/notifications" element={
        <ProtectedRoute>
          <Layout><Notifications /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/documents" element={
        <ProtectedRoute>
          <Layout><DocumentsPortal /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/predicted-grades" element={
        <ProtectedRoute>
          <Layout><PredictedGradesPortal /></Layout>
        </ProtectedRoute>
      } />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
};

export default App;