import React, { useState } from 'react';
import { Terminal, Play, Copy, Check, Code, RefreshCw } from 'lucide-react';

interface EndpointPreset {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  description: string;
  body?: string;
}

const PRESETS: EndpointPreset[] = [
  {
    name: 'System Health & R2 Status',
    method: 'GET',
    endpoint: '/api/v1/health',
    description: 'Returns API health, uptime, Cloudflare R2 bucket connectivity, and database stats.',
  },
  {
    name: 'Marketplace Apps Catalog',
    method: 'GET',
    endpoint: '/api/v1/apps',
    description: 'Fetch all published applications with categories, ratings, and download counts.',
  },
  {
    name: 'Categories Taxonomy',
    method: 'GET',
    endpoint: '/api/v1/categories',
    description: 'List categorized taxonomy with sort order and icon names.',
  },
  {
    name: 'Android Update Check',
    method: 'GET',
    endpoint: '/api/v1/updates/check?packages=com.smilelabs.tasksflow:101,io.aurasystems.devhttp:40',
    description: 'Compare installed device package version codes against published releases.',
  },
  {
    name: 'Initiate R2 Presigned Upload',
    method: 'POST',
    endpoint: '/api/v1/uploads/initiate',
    description: 'Developer initiates two-phase upload and obtains 300s presigned S3 upload URL.',
    body: JSON.stringify(
      {
        targetType: 'APK',
        appId: 'app-1',
        expectedBytes: 25000000,
        expectedMime: 'application/vnd.android.package-archive',
        filename: 'release_v1.2.0.apk',
      },
      null,
      2
    ),
  },
  {
    name: 'Admin Moderation Queue',
    method: 'GET',
    endpoint: '/api/v1/admin/queue',
    description: 'Inspect pending app releases awaiting administrative cryptographic approval.',
  },
  {
    name: 'Storage & Financial Metrics',
    method: 'GET',
    endpoint: '/api/v1/admin/metrics',
    description: 'Live Cloudflare R2 storage usage (bytes), Class A/B estimates, and $0 egress savings.',
  },
  {
    name: 'Immutable Audit Trail',
    method: 'GET',
    endpoint: '/api/v1/admin/audit-logs',
    description: 'Append-only ledger of privileged administrative and developer actions.',
  },
];

export const ApiExplorer: React.FC = () => {
  const [selectedPreset, setSelectedPreset] = useState<EndpointPreset>(PRESETS[0]);
  const [method, setMethod] = useState(PRESETS[0].method);
  const [endpoint, setEndpoint] = useState(PRESETS[0].endpoint);
  const [bodyText, setBodyText] = useState(PRESETS[0].body || '');
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseData, setResponseData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const handleSelectPreset = (preset: EndpointPreset) => {
    setSelectedPreset(preset);
    setMethod(preset.method);
    setEndpoint(preset.endpoint);
    setBodyText(preset.body || '');
    setResponseStatus(null);
    setResponseData(null);
  };

  const handleExecute = async () => {
    setIsLoading(true);
    setResponseStatus(null);
    setResponseData(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const options: RequestInit = {
        method,
        headers,
      };

      if (method !== 'GET' && bodyText) {
        options.body = bodyText;
      }

      const res = await fetch(endpoint, options);
      setResponseStatus(res.status);
      const json = await res.json();
      setResponseData(JSON.stringify(json, null, 2));
    } catch (err: any) {
      setResponseStatus(500);
      setResponseData(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  const generateCurl = () => {
    let curl = `curl -X ${method} "http://localhost:3000${endpoint}"`;
    if (method !== 'GET' && bodyText) {
      curl += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${bodyText.replace(/\n/g, '')}'`;
    }
    return curl;
  };

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(generateCurl());
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="p-6 bg-slate-900 text-white rounded-3xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold tracking-tight">API & Cloud Architecture Console</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Test and inspect live Express <code className="text-emerald-400 font-mono">/api/v1</code> endpoints, Cloudflare R2 presigned tokens, and PostgreSQL schema queries.
          </p>
        </div>

        <button
          onClick={handleCopyCurl}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-mono transition-colors flex items-center gap-1.5"
        >
          {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copiedCurl ? 'Copied cURL' : 'Copy cURL Command'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Presets List */}
        <div className="p-4 bg-white rounded-3xl border border-slate-200 space-y-2 shadow-sm">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider px-2 py-1">
            Available REST Endpoints
          </h3>
          <div className="space-y-1">
            {PRESETS.map((p) => {
              const active = selectedPreset.name === p.name;
              return (
                <button
                  key={p.name}
                  onClick={() => handleSelectPreset(p)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition-colors flex items-center justify-between gap-2 ${
                    active
                      ? 'bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      p.method === 'GET'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {p.method}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Request & Response Workbench */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-6 bg-white rounded-3xl border border-slate-200 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">{selectedPreset.name}</span>
              <span className="text-xs text-slate-400">· {selectedPreset.description}</span>
            </div>

            {/* URL Bar */}
            <div className="flex items-center gap-2">
              <span className="px-3 py-2 bg-slate-100 font-mono text-xs font-bold text-slate-800 rounded-xl">
                {method}
              </span>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleExecute}
                disabled={isLoading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5"
              >
                <Play className={`w-3.5 h-3.5 fill-white ${isLoading ? 'animate-pulse' : ''}`} />
                {isLoading ? 'Running...' : 'Send Request'}
              </button>
            </div>

            {/* Body Editor (If POST) */}
            {method !== 'GET' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  JSON Request Body
                </label>
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  rows={5}
                  className="w-full p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-xs focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Response Box */}
          <div className="p-6 bg-slate-950 text-slate-100 rounded-3xl border border-slate-800 space-y-3 font-mono">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-slate-200">Response Payload</span>
              </div>
              {responseStatus !== null && (
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                    responseStatus >= 200 && responseStatus < 300
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/20 text-rose-400'
                  }`}
                >
                  HTTP {responseStatus}
                </span>
              )}
            </div>

            {responseData ? (
              <pre className="text-xs text-emerald-300 overflow-x-auto max-h-96 leading-relaxed select-all">
                {responseData}
              </pre>
            ) : (
              <p className="text-xs text-slate-500 py-6 text-center">
                Click "Send Request" to invoke the live server route and view JSON output.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
