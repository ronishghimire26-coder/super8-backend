import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Reservations from "./pages/Reservations";
import Housekeeping from "./pages/Housekeeping";
import Guests from "./pages/Guests";
import CashLog from "./pages/CashLog";
import Reports from "./pages/Reports";
import BarModule from "./pages/BarModule";
import AdminSettings from "./pages/AdminSettings";
import BarApp from "./bar/BarApp";
import OwnerApp from "./owner/OwnerApp";
import { Loader2 } from "lucide-react";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null)
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#CC0000]" />
      </div>
    );
  if (user === false) return <Navigate to="/login" replace />;
  if (user.role === "owner") return <Navigate to="/owner-app" replace />;
  return children;
}

function MainApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/bar-app" element={<BarApp />} />
        <Route path="/owner-app" element={<OwnerApp />} />
        <Route
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/reservations" element={<Reservations />} />
          <Route path="/housekeeping" element={<Housekeeping />} />
          <Route path="/guests" element={<Guests />} />
          <Route path="/cash" element={<CashLog />} />
          <Route path="/bar" element={<BarModule />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/admin" element={<AdminSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}
