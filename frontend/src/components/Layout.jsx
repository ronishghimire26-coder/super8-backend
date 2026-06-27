import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, CalendarCheck, BedDouble, Users, Wallet, FileBarChart, Wine, Settings, LogOut } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { BrandLogo } from "./BrandLogo";
import { useAuth } from "../lib/auth";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "manager", "front_desk", "bar_staff"], testId: "sidebar-nav-dashboard" },
  { to: "/reservations", label: "Reservations", icon: CalendarCheck, roles: ["admin", "manager", "front_desk"], testId: "sidebar-nav-reservations" },
  { to: "/housekeeping", label: "Housekeeping", icon: BedDouble, roles: ["admin", "manager", "front_desk"], testId: "sidebar-nav-housekeeping" },
  { to: "/guests", label: "Guests", icon: Users, roles: ["admin", "manager", "front_desk"], testId: "sidebar-nav-guests" },
  { to: "/cash", label: "Cash & Log", icon: Wallet, roles: ["admin", "manager", "front_desk"], testId: "sidebar-nav-cash" },
  { to: "/bar", label: "Bar", icon: Wine, roles: ["admin", "manager", "bar_staff"], testId: "sidebar-nav-bar" },
  { to: "/reports", label: "Reports", icon: FileBarChart, roles: ["admin", "manager", "front_desk", "bar_staff"], testId: "sidebar-nav-reports" },
  { to: "/admin", label: "Admin Settings", icon: Settings, roles: ["admin", "manager"], testId: "sidebar-nav-admin" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const items = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-[72px] flex-col items-center bg-slate-900 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#CC0000] shadow-lg">
          <span className="font-display text-lg font-extrabold text-[#FFD700]">S8</span>
        </div>
        <nav className="mt-8 flex flex-1 flex-col items-center gap-2">
          <TooltipProvider delayDuration={100}>
            {items.map((n) => (
              <Tooltip key={n.to}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={n.to}
                    data-testid={n.testId}
                    className={({ isActive }) =>
                      `flex h-11 w-11 items-center justify-center rounded-xl transition-all ${
                        isActive ? "bg-[#CC0000] text-white shadow-lg" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                      }`
                    }
                  >
                    <n.icon className="h-5 w-5" />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">{n.label}</TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </nav>
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                data-testid="sidebar-logout"
                onClick={() => { logout(); navigate("/login"); }}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-slate-800 hover:text-white"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Log out</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </aside>

      {/* Main */}
      <div className="pl-[72px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur">
          <BrandLogo />
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-900" data-testid="header-user-name">{user.name}</div>
              <div className="text-xs capitalize text-slate-500">{user.role.replace("_", " ")}</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#CC0000] text-sm font-bold text-white">
              {user.name?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
