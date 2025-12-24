import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Loader2 } from 'lucide-react';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Layout = lazy(() => import('./components/Layout'));
const NewRequest = lazy(() => import('./pages/NewRequest'));
const RequestsList = lazy(() => import('./pages/RequestsList'));
const RequestDetail = lazy(() => import('./pages/RequestDetail'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Profile = lazy(() => import('./pages/Profile'));
const Notifications = lazy(() => import('./pages/Notifications'));
const DocumentsPortal = lazy(() => import('./pages/DocumentsPortal'));
const PredictedGradesPortal = lazy(() => import('./pages/PredictedGradesPortal'));
const SportsCaptainPortal = lazy(() => import('./pages/SportsCaptainPortal'));
const SportsCaptainApplicationForm = lazy(() => import('./pages/SportsCaptainApplicationForm'));
const RecommendationLetterPortal = lazy(() => import('./pages/RecommendationLetterPortal'));
const SportsRecommendationPortal = lazy(() => import('./pages/SportsRecommendationPortal'));
const FacilitiesWrapper = lazy(() => import('./pages/FacilitiesWrapper'));
const Approvals = lazy(() => import('./pages/Approvals'));
const AllRequests = lazy(() => import('./pages/AllRequests'));

const PageLoader = () => (
  <div className="min-h-screen bg-[#070708] flex items-center justify-center">
    <Loader2 className="w-10 h-10 animate-spin text-brand-500" />
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const AppRoutes = () => {
  return (
    <Suspense fallback={<PageLoader />}>
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

        <Route path="/all-requests" element={
          <ProtectedRoute>
            <Layout><AllRequests /></Layout>
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

        <Route path="/sports-captain" element={
          <ProtectedRoute>
            <Layout><SportsCaptainPortal /></Layout>
          </ProtectedRoute>
        } />

        <Route path="/sports-captain/apply" element={
          <ProtectedRoute>
            <Layout><SportsCaptainApplicationForm /></Layout>
          </ProtectedRoute>
        } />

        <Route path="/recommendation-letter" element={
          <ProtectedRoute>
            <Layout><RecommendationLetterPortal /></Layout>
          </ProtectedRoute>
        } />

        <Route path="/sports-recommendation" element={
          <ProtectedRoute>
            <Layout><SportsRecommendationPortal /></Layout>
          </ProtectedRoute>
        } />

        <Route path="/facilities-booking" element={
          <ProtectedRoute>
            <Layout><FacilitiesWrapper /></Layout>
          </ProtectedRoute>
        } />

        <Route path="/approvals" element={
          <ProtectedRoute>
            <Layout><Approvals /></Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </Suspense>
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