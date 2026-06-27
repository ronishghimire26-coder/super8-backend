import React from "react";

export function BrandLogo({ compact = false, dark = false }) {
  return (
    <div className="flex items-center gap-3" data-testid="brand-logo">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#CC0000] shadow-lg shrink-0">
        <span className="font-display text-lg font-extrabold text-[#FFD700]">S8</span>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className={`font-display text-base font-bold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>
            Super 8 <span className="text-[#CC0000]">by Wyndham</span>
          </div>
          <div className={`text-[11px] font-medium ${dark ? "text-zinc-400" : "text-slate-500"}`}>
            50th North Pub &amp; Eatery
          </div>
        </div>
      )}
    </div>
  );
}
