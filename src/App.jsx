import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { ShieldProvider } from "@/features/shield/ShieldProvider";
import { DownloadsProvider } from "@/features/downloads/DownloadsProvider";
import { LibraryProvider } from "@/features/library/LibraryProvider";
import { AccountProvider } from "@/features/account/AccountProvider";
import { AppShell } from "@/components/layout/AppShell";
import { Splash } from "@/components/layout/Splash";

// Each page's code downloads only when it's first opened (faster first load on phones).
const page = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const AuthPage = page(() => import("@/features/auth/AuthPage"), "AuthPage");
const HomePage = page(() => import("@/features/home/HomePage"), "HomePage");
const LivePage = page(() => import("@/features/live/LivePage"), "LivePage");
const SportsPage = page(() => import("@/features/sports/SportsPage"), "SportsPage");
const LibraryPage = page(() => import("@/features/library/LibraryPage"), "LibraryPage");
const SitesPage = page(() => import("@/features/sites/SitesPage"), "SitesPage");
const ProfilePage = page(() => import("@/features/profile/ProfilePage"), "ProfilePage");
const AdminPage = page(() => import("@/features/admin/AdminPage"), "AdminPage");
const SharePage = page(() => import("@/features/account/SharePage"), "SharePage");

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AccountProvider>
          <ShieldProvider>
            <LibraryProvider>
              <DownloadsProvider>
                <Suspense fallback={<Splash />}>
                  <Routes>
                    <Route path="/auth" element={<AuthPage />} />
                    <Route element={<ProtectedRoute />}>
                      <Route path="share" element={<SharePage />} />
                      <Route element={<AppShell />}>
                        <Route index element={<HomePage />} />
                        <Route path="live" element={<LivePage />} />
                        <Route path="sports" element={<SportsPage />} />
                        <Route path="library" element={<LibraryPage />} />
                        <Route path="sites" element={<SitesPage />} />
                        <Route path="profile" element={<ProfilePage />} />
                        <Route path="admin" element={<AdminPage />} />
                      </Route>
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </DownloadsProvider>
            </LibraryProvider>
          </ShieldProvider>
        </AccountProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
