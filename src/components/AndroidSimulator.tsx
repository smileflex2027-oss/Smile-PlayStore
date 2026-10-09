import React, { useState } from 'react';
import {
  Smartphone,
  RefreshCw,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  PackageCheck
} from 'lucide-react';
import { api } from '../api/client';

export const AndroidSimulator: React.FC = () => {
  const [packagesInput, setPackagesInput] = useState('com.smilelabs.tasksflow:101,io.aurasystems.devhttp:40');
  const [updates, setUpdates] = useState<any[]>([]);
  const [checking, setChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const handleCheckUpdates = async () => {
    setChecking(true);
    setHasChecked(true);
    try {
      const res = await api.checkUpdates(packagesInput);
      setUpdates(res.updates || []);
    } catch (err: any) {
      alert(`Update check failed: ${err.message}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="p-6 bg-slate-900 text-white rounded-3xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold tracking-tight">Android Client & Update Simulator</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Simulate native Android Jetpack Compose client operations, update checks, and safe installation flows.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
          <span className="text-emerald-400">● OS:</span> Android 14 (API 34)
        </div>
      </div>

      {/* Simulator Interface */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Device Packages Input */}
        <div className="p-6 bg-white rounded-3xl border border-slate-200 space-y-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-emerald-600" />
            1. Installed Device Packages Input
          </h3>
          <p className="text-xs text-slate-500">
            Specify currently installed Android package names and version codes in the format <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">packageName:versionCode</code> (comma separated).
          </p>

          <textarea
            value={packagesInput}
            onChange={(e) => setPackagesInput(e.target.value)}
            rows={3}
            className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
          />

          <button
            onClick={handleCheckUpdates}
            disabled={checking}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            Query /api/v1/updates/check
          </button>

          <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-600 space-y-1">
            <span className="font-semibold text-slate-800 block">Available Sample Test Values:</span>
            <p>• <code>com.smilelabs.tasksflow:101</code> (Has published version 102 available)</p>
            <p>• <code>io.aurasystems.devhttp:40</code> (Has published version 42 available)</p>
          </div>
        </div>

        {/* Update Check Results */}
        <div className="p-6 bg-white rounded-3xl border border-slate-200 space-y-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            2. Available Updates Detected
          </h3>

          {!hasChecked ? (
            <div className="p-10 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
              <RefreshCw className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs">Click "Query /api/v1/updates/check" to compare versions with PostgreSQL database.</p>
            </div>
          ) : updates.length === 0 ? (
            <div className="p-10 text-center bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="text-xs font-semibold text-emerald-900">All applications are up to date!</p>
              <p className="text-[11px] text-emerald-700">No newer published version codes found on the server.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {updates.map((up) => (
                <div
                  key={up.packageName}
                  className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-slate-900 block truncate max-w-[200px]">
                        {up.packageName}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Installed: Build {up.installedVersionCode} → New: <strong>v{up.versionName} (Build {up.latestVersionCode})</strong>
                      </span>
                    </div>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                      Update Ready
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 bg-white p-2 rounded-lg border border-slate-100">
                    {up.releaseNotes}
                  </p>

                  <div className="text-[10px] font-mono text-slate-500 truncate">
                    Expected SHA-256: {up.sha256}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Protocol Architecture Guide */}
      <div className="p-6 bg-slate-900 text-slate-200 rounded-3xl border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Android Native Package Installation Safeguards (Architectural Guarantee)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-300">
          <div className="p-3 bg-slate-800/80 rounded-xl space-y-1">
            <span className="font-semibold text-white block">1. Unknown Sources</span>
            <p className="text-slate-400 text-[11px]">
              Smile Store checks <code className="text-emerald-300">canRequestPackageInstalls()</code> and guides the user to grant explicit per-app permission in Android Settings.
            </p>
          </div>
          <div className="p-3 bg-slate-800/80 rounded-xl space-y-1">
            <span className="font-semibold text-white block">2. SHA-256 Digest Check</span>
            <p className="text-slate-400 text-[11px]">
              The OkHttp download stream computes SHA-256 locally on device before passing the file to the OS, preventing man-in-the-middle binary tampering.
            </p>
          </div>
          <div className="p-3 bg-slate-800/80 rounded-xl space-y-1">
            <span className="font-semibold text-white block">3. System PackageInstaller</span>
            <p className="text-slate-400 text-[11px]">
              Dispatches standard system intent <code className="text-emerald-300">ACTION_VIEW</code> with content URI via FileProvider for OS-level signature validation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
