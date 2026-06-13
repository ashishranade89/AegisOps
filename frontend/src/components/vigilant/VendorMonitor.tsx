import { VendorHealth } from "../../types/vigilant";
import { ShieldCheck, ShieldAlert, AlertTriangle, RefreshCw } from "lucide-react";

interface VendorMonitorProps {
  vendors: VendorHealth[];
  onRefresh?: () => void;
  isLoading?: boolean;
  isDarkMode?: boolean;
}

export default function VendorMonitor({ vendors, onRefresh, isLoading, isDarkMode = true }: VendorMonitorProps) {
  return (
    <div className={`rounded-xl p-4 border flex flex-col h-full justify-between transition-all ${
      isDarkMode 
        ? "bg-slate-900/40 backdrop-blur-md border-white/5" 
        : "bg-white border-slate-200 shadow-sm"
    }`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col">
            <h3 className={`text-xs font-mono font-bold uppercase tracking-wider ${
              isDarkMode ? "text-slate-400" : "text-slate-500"
            }`}>Vendor Status Feeds</h3>
            <span className={`text-[10px] font-sans ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>External dependencies monitoring</span>
          </div>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className={`p-1.5 rounded-lg border transition-all active:scale-95 disabled:opacity-50 ${
              isDarkMode
                ? "border-white/5 hover:bg-white/5 hover:border-white/10 text-slate-400"
                : "border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-600 shadow-xs"
            }`}
            title="Force status poll"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-blue-500" : ""}`} />
          </button>
        </div>

        {/* Vendor Grid */}
        <div className="flex flex-col gap-3">
          {vendors.map((vendor) => {
            const isOutage = vendor.status === "outage";
            const isDegraded = vendor.status === "degraded";

            let icon = <ShieldCheck className="w-4 h-4 text-emerald-400" />;
            let statusBadge = (
              <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${
                isDarkMode 
                  ? "bg-emerald-990/30 text-emerald-400 border-emerald-900/50" 
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}>
                Healthy
              </span>
            );

            if (isOutage) {
              icon = <ShieldAlert className="w-4 h-4 text-red-500 animate-pulse" />;
              statusBadge = (
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border font-bold animate-pulse ${
                  isDarkMode
                    ? "bg-red-950/40 text-red-400 border-red-900/60"
                    : "bg-red-50 text-red-655 border-red-200"
                }`}>
                  Outage
                </span>
              );
            } else if (isDegraded) {
              icon = <AlertTriangle className="w-4 h-4 text-amber-500" />;
              statusBadge = (
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border font-medium ${
                  isDarkMode
                    ? "bg-amber-950/40 text-amber-400 border-amber-900/60"
                    : "bg-amber-50 text-amber-655 border-amber-200"
                }`}>
                  Degraded
                </span>
              );
            }

            return (
              <div
                key={vendor.name}
                className={`p-2.5 rounded-lg border flex flex-col justify-between transition-colors ${
                  isDarkMode
                    ? "bg-slate-900/50 border-white/5 hover:border-white/10 text-slate-200"
                    : "bg-slate-55 border-slate-100 hover:border-slate-300 text-slate-800 shadow-3xs"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {icon}
                    <span className={`text-xs font-mono font-bold tracking-tight ${
                      isDarkMode ? "text-slate-200" : "text-slate-800"
                    }`}>{vendor.name}</span>
                  </div>
                  {statusBadge}
                </div>

                {/* Outage Metadata Block */}
                {(isOutage || isDegraded) ? (
                  <div className={`mt-1.5 mb-2 text-[10px] font-sans space-y-1 p-2 rounded border ${
                    isDarkMode 
                      ? "bg-red-500/5 border-red-500/10 text-slate-400" 
                      : "bg-red-50 border-red-100 text-slate-700"
                  }`}>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Affected:</span>
                      <span className="font-bold text-rose-500">{isOutage ? "Webhooks, Payments" : "API Gateways"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Started:</span>
                      <span className="font-mono text-[9px]">{isOutage ? "10:12 UTC" : "08:45 UTC"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">AI Confidence:</span>
                      <span className="font-bold text-teal-500">{isOutage ? "98%" : "75%"}</span>
                    </div>
                  </div>
                ) : (
                  <div className={`mt-1.5 mb-2 text-[9.5px] font-sans p-1.5 rounded flex items-center justify-between border ${
                    isDarkMode 
                      ? "bg-emerald-500/5 border-emerald-500/10 text-slate-400" 
                      : "bg-emerald-50 border-emerald-100 text-slate-700"
                  }`}>
                    <span className="text-slate-500">Uptime SLA Check</span>
                    <span className="text-emerald-500 font-bold">99.99%</span>
                  </div>
                )}

                {/* History Sparkline bar charts */}
                <div className="flex items-end gap-1.5 h-4 pt-0.5">
                  {vendor.barValues.map((val, idx) => {
                    let barColor = "bg-blue-500/40";
                    if (val < 30) {
                      barColor = "bg-red-500";
                    } else if (val < 70) {
                      barColor = "bg-amber-500";
                    } else {
                      barColor = isDarkMode ? "bg-emerald-500/65" : "bg-emerald-600/75";
                    }

                    return (
                      <div
                        key={idx}
                        className={`flex-1 w-full rounded-sm relative group cursor-pointer ${
                          isDarkMode ? "bg-slate-800" : "bg-slate-200/80"
                        }`}
                        style={{ height: "100%" }}
                      >
                        <div
                          className={`absolute bottom-0 left-0 right-0 rounded-sm ${barColor} hover:opacity-100 transition-all`}
                          style={{ height: `${val}%` }}
                        />
                        {/* Tooltip on bar hover */}
                        <div className={`opacity-0 group-hover:opacity-100 absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[8px] py-0.5 px-1.5 rounded pointer-events-none transition-all z-40 shadow whitespace-nowrap border ${
                          isDarkMode
                            ? "bg-slate-900 text-white border-white/10"
                            : "bg-white text-slate-800 border-slate-200"
                        }`}>
                          {val === 100 ? "99.99% Node Latency Rate" : `${val}% Capacity`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`mt-4 pt-3 border-t flex justify-between items-center text-[10px] ${
        isDarkMode ? "border-white/5 text-slate-500" : "border-slate-100 text-slate-400"
      }`}>
        <span>SLA Tracking Active</span>
        <span>SSL certs verified</span>
      </div>
    </div>
  );
}
