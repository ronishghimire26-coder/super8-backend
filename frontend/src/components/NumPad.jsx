import React, { useState } from "react";
import { Delete, Check } from "lucide-react";

// Touch-friendly number pad input for the Bar Staff PWA.
export function NumPadInput({ value, onChange, label, allowNegative = false, allowDecimal = true, testId, unit }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  function start() {
    setDraft(value === "" || value === null || value === undefined ? "" : String(value));
    setOpen(true);
  }
  function press(k) {
    setDraft((d) => {
      if (k === "back") return d.slice(0, -1);
      if (k === "neg") return d.startsWith("-") ? d.slice(1) : "-" + d;
      if (k === "." ) return d.includes(".") ? d : (d === "" || d === "-" ? d + "0." : d + ".");
      return d + k;
    });
  }
  function done() {
    const n = draft === "" || draft === "-" ? "" : Number(draft);
    onChange(n);
    setOpen(false);
  }

  const display = value === "" || value === null || value === undefined ? "—" : value;

  return (
    <>
      <button
        type="button"
        onClick={start}
        data-testid={testId}
        className="flex h-14 w-full items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900 px-4 active:bg-zinc-800"
      >
        <span className="text-sm text-zinc-400">{label}</span>
        <span className="font-mono text-2xl font-bold text-white">{display}{unit && value !== "" ? ` ${unit}` : ""}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={() => setOpen(false)}>
          <div className="rounded-t-3xl bg-zinc-900 p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-center">
              <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
              <div className="mt-1 font-mono text-4xl font-extrabold text-white" data-testid="numpad-display">{draft || "0"}</div>
            </div>
            <div className="mx-auto grid max-w-sm grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                <button key={k} onClick={() => press(k)} data-testid={`numpad-${k}`}
                  className="flex h-16 items-center justify-center rounded-2xl border border-zinc-700/50 bg-zinc-800 text-3xl font-bold text-white shadow active:scale-95 active:bg-zinc-700">{k}</button>
              ))}
              <button onClick={() => press(allowNegative ? "neg" : ".")} className="flex h-16 items-center justify-center rounded-2xl border border-zinc-700/50 bg-zinc-800 text-3xl font-bold text-white active:scale-95">
                {allowNegative ? "±" : (allowDecimal ? "." : "")}
              </button>
              <button onClick={() => press("0")} data-testid="numpad-0" className="flex h-16 items-center justify-center rounded-2xl border border-zinc-700/50 bg-zinc-800 text-3xl font-bold text-white active:scale-95 active:bg-zinc-700">0</button>
              <button onClick={() => press("back")} className="flex h-16 items-center justify-center rounded-2xl border border-zinc-700/50 bg-zinc-800 text-white active:scale-95"><Delete className="h-6 w-6" /></button>
            </div>
            <button onClick={done} data-testid="numpad-done"
              className="mt-4 flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-[#CC0000] text-xl font-bold text-white shadow-[0_0_15px_rgba(204,0,0,0.4)] active:scale-[0.99]">
              <Check className="h-6 w-6" /> Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
