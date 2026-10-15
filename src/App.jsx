import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { ShieldProvider } from "@/features/shield/ShieldProvider";
import { AccountProvider } from "@/features/account/AccountProvider";
import { AppShell } from "@/components/layout/AppShell";
import { Splash } from "@/components/layout/Splash";

// Each page's code downloads only when it's first opened (faster first load on phones).
const page = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const AuthPage = page(() => import("@/features/auth/AuthPage"), "AuthPage");
const LivePage = page(() => import("@/features/live/LivePage"), "LivePage");
const SportsPage = page(() => import("@/features/sports/SportsPage"), "SportsPage");
const SitesPage = page(() => import("@/features/sites/SitesPage"), "SitesPage");
const ProfilePage = page(() => import("@/features/profile/ProfilePage"), "ProfilePage");
const AdminPage = page(() => import("@/features/admin/AdminPage"), "AdminPage");
const SharePage = page(() => import("@/features/account/SharePage"), "SharePage");
const HomeScreen = page(() => import("@/features/start/HomeScreen"), "HomeScreen");

// Games: each page loads when first opened.
const GamesLayout = page(() => import("@/features/games/GamesProvider"), "GamesLayout");
const GamesHub = page(() => import("@/features/games/GamesHub"), "GamesHub");
const QuizGame = page(() => import("@/features/games/QuizGame"), "QuizGame");
const GuessPlayer = page(() => import("@/features/games/GuessPlayer"), "GuessPlayer");
const HigherLower = page(() => import("@/features/games/HigherLower"), "HigherLower");
const Footle = page(() => import("@/features/games/Footle"), "Footle");
const ClubGrid = page(() => import("@/features/games/ClubGrid"), "ClubGrid");
const Keepy = page(() => import("@/features/games/Keepy"), "Keepy");
const Tournaments = page(() => import("@/features/create/Tournaments"), "Tournaments");
const TournamentView = page(() => import("@/features/create/Tournaments"), "TournamentView");
const Lineups = page(() => import("@/features/create/Lineups"), "Lineups");
const LineupEditor = page(() => import("@/features/create/Lineups"), "LineupEditor");
const Predictor = page(() => import("@/features/games/Predictor"), "Predictor");
const BattleLobby = page(() => import("@/features/games/Battle"), "BattleLobby");
const BattleRoom = page(() => import("@/features/games/Battle"), "BattleRoom");
const DailyChallenge = page(() => import("@/features/games/MorePages"), "DailyChallenge");
const Leaderboards = page(() => import("@/features/games/MorePages"), "Leaderboards");
const GameProfile = page(() => import("@/features/games/MorePages"), "GameProfile");
const SubmitQuestion = page(() => import("@/features/games/MorePages"), "SubmitQuestion");
const Moderation = page(() => import("@/features/games/MorePages"), "Moderation");

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AccountProvider>
          <ShieldProvider>
                <Suspense fallback={<Splash />}>
                  <Routes>
                    <Route path="/auth" element={<AuthPage />} />
                    <Route element={<ProtectedRoute />}>
                      <Route path="share" element={<SharePage />} />
                      <Route element={<AppShell />}>
                        <Route index element={<HomeScreen />} />
                        <Route path="live" element={<LivePage />} />
                        <Route path="sports" element={<SportsPage />} />
                        <Route path="games" element={<GamesLayout />}>
                          <Route index element={<GamesHub />} />
                          <Route path="quiz" element={<QuizGame key="quiz" kind="quiz" />} />
                          <Route path="daily" element={<DailyChallenge />} />
                          <Route path="daily-quiz" element={<QuizGame key="daily" kind="daily" />} />
                          <Route path="daily-player" element={<GuessPlayer key="daily-player" daily />} />
                          <Route path="shirt" element={<QuizGame key="shirt" kind="shirt" />} />
                          <Route path="clubs" element={<QuizGame key="clubs" kind="clubs" />} />
                          <Route path="trophy" element={<QuizGame key="trophy" kind="trophy" />} />
                          <Route path="xi" element={<QuizGame key="xi" kind="xi" />} />
                          <Route path="guess" element={<GuessPlayer key="guess" />} />
                          <Route path="career" element={<GuessPlayer key="career" mode="career" />} />
                          <Route path="hilo" element={<HigherLower />} />
                          <Route path="footle" element={<Footle />} />
                          <Route path="grid" element={<ClubGrid />} />
                          <Route path="keepy" element={<Keepy />} />
                          <Route path="tournaments" element={<Tournaments />} />
                          <Route path="tournaments/:id" element={<TournamentView />} />
                          <Route path="lineups" element={<Lineups />} />
                          <Route path="lineups/:id" element={<LineupEditor />} />
                          <Route path="predictor" element={<Predictor />} />
                          <Route path="battle" element={<BattleLobby />} />
                          <Route path="battle/:code" element={<BattleRoom />} />
                          <Route path="leaderboard" element={<Leaderboards />} />
                          <Route path="profile" element={<GameProfile />} />
                          <Route path="submit" element={<SubmitQuestion />} />
                          <Route path="moderate" element={<Moderation />} />
                          <Route path="admin" element={<Navigate to="/admin" replace />} />
                        </Route>
                        <Route path="sites" element={<SitesPage />} />
                        <Route path="profile" element={<ProfilePage />} />
                        <Route path="admin" element={<AdminPage />} />
                      </Route>
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
          </ShieldProvider>
        </AccountProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
