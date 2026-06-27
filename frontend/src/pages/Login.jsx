import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { BrandLogo } from "../components/BrandLogo";
import { useAuth } from "../lib/auth";
import { apiError } from "../lib/api";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login(email, password);
      if (u.role === "owner") {
        setError("Owner accounts must use the Owner app at /owner-app.");
        setLoading(false);
        return;
      }
      navigate("/dashboard");
    } catch (err) {
      setError(apiError(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-slate-900 p-12 lg:flex">
        <BrandLogo dark />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <h1 className="font-display text-5xl font-extrabold leading-tight tracking-tight text-white">
            Unified Hotel &amp; Bar<br />Management System
          </h1>
          <p className="mt-4 max-w-md text-lg text-slate-400">
            Front desk, housekeeping, and the pub — one clean platform built for the property.
          </p>
          <div className="mt-8 flex gap-2">
            <span className="h-1.5 w-16 rounded-full bg-[#CC0000]" />
            <span className="h-1.5 w-8 rounded-full bg-[#FFD700]" />
          </div>
        </motion.div>
        <p className="text-xs text-slate-600">Private internal system · Super 8 by Wyndham</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><BrandLogo /></div>
          <h2 className="font-display text-2xl font-bold text-slate-900">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to the main system</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" data-testid="login-email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-11" placeholder="you@super8.com" required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" data-testid="login-password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-11" placeholder="••••••••" required />
            </div>
            {error && <div data-testid="login-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div>}
            <Button data-testid="login-submit" type="submit" disabled={loading}
              className="h-11 w-full bg-[#CC0000] text-base font-semibold hover:bg-[#A30000]">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign In"}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-slate-400">
            Bar staff: <a href="/bar-app" className="font-semibold text-[#CC0000]">/bar-app</a> · Owner: <a href="/owner-app" className="font-semibold text-[#CC0000]">/owner-app</a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
