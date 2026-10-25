import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';

// ── Global Styles ──────────────────────────────────────────────────────────
import './styles/globals.css';

// ── Auth ───────────────────────────────────────────────────────────────────
import useAuthStore from './auth/useAuthStore';
import ProtectedRoute from './auth/ProtectedRoute';
import RoleGuard from './auth/RoleGuard';
import SuperAdminGuard from './auth/SuperAdminGuard';
import PermissionGuard from './auth/PermissionGuard';

// ── Landing Page Components ────────────────────────────────────────────────
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import AuthModal from './components/AuthModal';
import ProductPreview from './components/ProductPreview';
import FeaturesShowcase from './components/FeaturesShowcase';
import MissionVision from './components/MissionVision';
import MacSection from './components/MacSection';
import PlatformSection from './components/PlatformSection';
import CTESection from './components/CTESection';
import CTASection from './components/CTASection';
import Footer from './components/Footer';

// ── Admin Pages ────────────────────────────────────────────────────────────
// Naka-alias ang ModulesPage dahil may kaparehong export ang Instructor.
import {
  AdminLayout,
  AdminDashboard,
  UserPage,
  ExamConfigPage,
  AccessControlPage,
  ReportsPage,
  SettingsPage,
  ModulesPage as AdminModulesPage,
} from './pages/admin';
// Direkta ang import para hindi na kailangang galawin ang pages/admin/index.js
import ActivityLogPage from './pages/admin/ActivityLogPage';

// ── Instructor Pages ───────────────────────────────────────────────────────
import {
  InstructorLayout,
  InstructorDashboard,
  ExamBuilderPage,
  QuestionBankPage,
  StudentMonitorPage,
  AnnouncementsPage,
  ModulesPage as InstructorModulesPage,
} from './pages/instructor';

// ── User / Student Pages ───────────────────────────────────────────────────
import {
  UserLayout,
  UserDashboard,
  UserAssessmentsPage,
  ResultsPage,
  ExamPage,
  ExamSelectionPage,
  ReviewModulesPage,
} from './pages/user/user_index';
// Direkta ang import para hindi na kailangang galawin ang user_index.js
import UserAnnouncementsPage from './pages/user/UserAnnouncementsPage';

// ── Scroll to top on route change ──────────────────────────────────────────
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// ── Public Landing Page ────────────────────────────────────────────────────
function PublicSite() {
  return (
    <div className="public-site-wrapper">
      <Navbar />
      <main>
        <Hero />
        <AuthModal />
        <ProductPreview />
        <FeaturesShowcase />
        <MissionVision />
        <MacSection />
        <PlatformSection />
        <CTESection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const initAuth = useAuthStore((state) => state.initAuth);

  // Validate token on every app boot
  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>

        {/* ── Public Landing Page ── */}
        <Route path="/" element={<PublicSite />} />

        {/* ── Admin Routes ── */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <RoleGuard role="admin">
                <AdminLayout />
              </RoleGuard>
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<UserPage />} />
          <Route path="exams" element={<SuperAdminGuard><ExamConfigPage /></SuperAdminGuard>} />
          {/* Super admin: global + CIT/CTE. Department admin: sariling department lang (hinahandle ng page + backend). */}
          <Route path="access" element={<AccessControlPage />} />
          <Route path="activity" element={<SuperAdminGuard><ActivityLogPage /></SuperAdminGuard>} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SuperAdminGuard><SettingsPage /></SuperAdminGuard>} />
          <Route path="modules" element={<AdminModulesPage />} />
        </Route>

        {/* ── Instructor Routes ── */}
        <Route
          path="/instructor"
          element={
            <ProtectedRoute>
              <RoleGuard role="instructor">
                <InstructorLayout />
              </RoleGuard>
            </ProtectedRoute>
          }
        >
          <Route index element={<InstructorDashboard />} />
          <Route path="exams" element={<ExamBuilderPage />} />
          <Route path="questions" element={<QuestionBankPage />} />
          <Route path="monitor" element={<StudentMonitorPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="modules" element={<InstructorModulesPage />} />
        </Route>

        {/* ── User / Student Routes ── */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <RoleGuard role="user">
                <UserLayout />
              </RoleGuard>
            </ProtectedRoute>
          }
        >
          <Route index element={<PermissionGuard permission="viewDashboard"><UserDashboard /></PermissionGuard>} />
          <Route path="selection" element={<PermissionGuard permission="takeExams"><ExamSelectionPage /></PermissionGuard>} />
          <Route path="exam" element={<PermissionGuard permission="takeExams"><ExamPage /></PermissionGuard>} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="results/:attemptId" element={<ResultsPage />} />
          <Route path="history" element={<UserAssessmentsPage />} />
          <Route path="scores" element={<UserAssessmentsPage />} />
          <Route path="review" element={<PermissionGuard permission="viewReviewModules"><ReviewModulesPage /></PermissionGuard>} />
          <Route path="announcements" element={<UserAnnouncementsPage />} />
        </Route>

        {/* ── 404 Fallback ── */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}