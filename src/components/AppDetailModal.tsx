import React, { useState } from 'react';
import {
  Star,
  Download,
  Heart,
  Shield,
  Calendar,
  Layers,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  ChevronRight,
  ExternalLink,
  Smartphone,
  Lock,
  Tag
} from 'lucide-react';
import { AppListing, Review } from '../types';
import { api } from '../api/client';

interface AppDetailModalProps {
  app: AppListing;
  isOpen: boolean;
  onClose: () => void;
  onDownloadClick: (app: AppListing) => void;
  isFavorite: boolean;
  onToggleFavorite: (appId: string) => void;
  onReviewAdded?: (newReview: Review) => void;
}

export const AppDetailModal: React.FC<AppDetailModalProps> = ({
  app,
  isOpen,
  onClose,
  onDownloadClick,
  isFavorite,
  onToggleFavorite,
  onReviewAdded,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'permissions' | 'versions' | 'reviews'>('overview');
  const [newRating, setNewRating] = useState(5);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  if (!isOpen) return null;

  const latest = app.latestVersion;
  const reviews = app.reviews || [];

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newBody.trim()) return;

    setIsSubmittingReview(true);
    try {
      const added = await api.postReview(app.id, {
        rating: newRating,
        title: newTitle,
        body: newBody,
      });
      setReviewSuccess(true);
      setNewTitle('');
      setNewBody('');
      if (onReviewAdded) onReviewAdded(added);
      setTimeout(() => setReviewSuccess(false), 3000);
    } catch (err: any) {
      alert(`Failed to post review: ${err.message}`);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full my-8 shadow-2xl border border-slate-200 overflow-hidden relative max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-gradient-to-b from-slate-50 to-white">
          <div className="flex items-start gap-4">
            <img
              src={app.iconUrl}
              alt={app.name}
              className="w-20 h-20 rounded-2xl object-cover border border-slate-200 shadow-sm shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">{app.name}</h2>
                <span className="text-[11px] font-medium text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Verified APK
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400 mt-0.5">{app.packageName}</p>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                <span className="font-medium text-slate-700">{app.developerName}</span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1 text-amber-600 font-semibold">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {app.averageRating.toFixed(1)} ({app.reviewCount} reviews)
                </span>
                <span aria-hidden="true">·</span>
                <span>{app.downloadCount.toLocaleString()} downloads</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Primary CTA Action Row */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDownloadClick(app)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-xl transition-all shadow-sm shadow-emerald-600/20 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download APK ({latest ? (latest.fileSizeBytes / (1024 * 1024)).toFixed(1) + ' MB' : 'Release'})
            </button>
            <button
              onClick={() => onToggleFavorite(app.id)}
              className={`p-2.5 rounded-xl border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                isFavorite
                  ? 'bg-rose-50 border-rose-200 text-rose-600'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Heart className={`w-4 h-4 ${isFavorite ? 'fill-rose-500' : ''}`} />
              {isFavorite ? 'Saved' : 'Favorite'}
            </button>
          </div>

          <div className="text-right text-[11px] text-slate-500">
            <span>Target SDK: </span>
            <span className="font-semibold text-slate-700">Android {latest?.targetSdkVersion || 34}</span>
            <span className="mx-1">·</span>
            <span>Min SDK: </span>
            <span className="font-semibold text-slate-700">API {latest?.minSdkVersion || 24}</span>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="px-6 border-b border-slate-200 flex items-center gap-4 text-xs font-medium text-slate-600">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Overview & Media
          </button>
          <button
            onClick={() => setActiveTab('permissions')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'permissions'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Permissions & Security ({latest?.permissions.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('versions')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'versions'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Version History
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'reviews'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Reviews & Ratings ({reviews.length})
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'overview' && (
            <>
              {/* Screenshots Carousel */}
              {app.screenshots.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2">
                    Screenshots
                  </h4>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                    {app.screenshots.map((s, idx) => (
                      <img
                        key={s.id || idx}
                        src={s.url}
                        alt={`Screenshot ${idx + 1}`}
                        className="w-44 h-80 object-cover rounded-xl border border-slate-200 shrink-0 shadow-sm"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Tagline & Description */}
              <div>
                <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-1">
                  About this app
                </h4>
                <p className="text-sm font-medium text-slate-800">{app.tagline}</p>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed whitespace-pre-line">
                  {app.description}
                </p>
              </div>

              {/* Latest Release Changelog */}
              {latest && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-900">
                      What's New in Version {latest.versionName}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">Build {latest.versionCode}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{latest.releaseNotes}</p>
                </div>
              )}
            </>
          )}

          {activeTab === 'permissions' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-3">
                <Shield className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-emerald-900">Transparent Permission Auditing</p>
                  <p className="text-emerald-700 mt-0.5">
                    Smile Store inspects every uploaded APK binary's <code className="font-mono bg-emerald-100/50 px-1 py-0.2 rounded">AndroidManifest.xml</code> to guarantee developers only request stated capabilities.
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-2">Declared Android Permissions</h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {latest?.permissions.map((perm) => (
                    <div key={perm} className="p-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono text-slate-800">{perm}</span>
                      </div>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                        Standard
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-1">Developer Keystore Fingerprint</h4>
                <div className="p-3 bg-slate-900 text-slate-200 rounded-xl text-[11px] font-mono break-all">
                  {latest?.signingCertFingerprint || 'SHA256:7B:3E:99:81:4A:2D:10:7F:C2:54:99:A1:02:88:9C:12:44:EE:A0:71'}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2">
                Release History & Binary Signatures
              </h4>
              <div className="space-y-3">
                {(app.versions || [latest]).filter(Boolean).map((ver) => (
                  <div
                    key={ver!.id}
                    className="p-4 bg-white rounded-xl border border-slate-200 space-y-2 hover:border-emerald-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">v{ver!.versionName}</span>
                        <span className="text-xs text-slate-500 font-mono">(Code {ver!.versionCode})</span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium">
                          {ver!.status}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {ver!.publishedAt ? new Date(ver!.publishedAt).toLocaleDateString() : 'Active'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{ver!.releaseNotes}</p>
                    <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono">SHA-256: {ver!.sha256Hash.substring(0, 24)}...</span>
                      <span>{(ver!.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="space-y-6">
              {/* Submission Box */}
              <form onSubmit={handleReviewSubmit} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                <h4 className="text-xs font-semibold text-slate-900">Write an honest community review</h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">Your rating:</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setNewRating(s)}
                        className="p-1 focus:outline-none"
                      >
                        <Star
                          className={`w-5 h-5 ${
                            s <= newRating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-300 hover:text-amber-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Review title (e.g., Clean interface, fast performance)"
                  required
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                />

                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Describe your user experience on Android..."
                  rows={3}
                  required
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                />

                <div className="flex items-center justify-between">
                  {reviewSuccess && (
                    <span className="text-xs text-emerald-600 font-medium">Review posted!</span>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmittingReview}
                    className="ml-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    {isSubmittingReview ? 'Submitting...' : 'Post Review'}
                  </button>
                </div>
              </form>

              {/* Reviews List */}
              <div className="space-y-3">
                {reviews.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No reviews yet. Be the first to review!</p>
                ) : (
                  reviews.map((r) => (
                    <div key={r.id} className="p-3 bg-white rounded-xl border border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{r.username}</span>
                          <div className="flex items-center text-amber-400">
                            {[...Array(r.rating)].map((_, i) => (
                              <Star key={i} className="w-3 h-3 fill-amber-400" />
                            ))}
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs font-medium text-slate-800">{r.title}</p>
                      <p className="text-xs text-slate-600 leading-relaxed">{r.body}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
