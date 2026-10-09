import React from 'react';
import {
  Download,
  Search,
  Sparkles,
  ShoppingBag,
  ShieldCheck,
  Package,
  Layers,
  ArrowRight,
  Heart
} from 'lucide-react';
import { AppListing, Category } from '../types';

interface StoreViewProps {
  apps: AppListing[];
  categories: Category[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  onOpenAppDetail: (app: AppListing) => void;
  onDownloadClick: (app: AppListing) => void;
  favoritesSet: Set<string>;
  onToggleFavorite: (appId: string) => void;
  searchQuery: string;
}

export const StoreView: React.FC<StoreViewProps> = ({
  apps,
  categories,
  selectedCategory,
  onSelectCategory,
  onOpenAppDetail,
  onDownloadClick,
  favoritesSet,
  onToggleFavorite,
  searchQuery,
}) => {
  const publishedApps = apps.filter((a) => a.status === 'PUBLISHED');
  const featuredApps = publishedApps.filter((a) => a.isFeatured);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Category Filter Chips Bar (Google Play Store Inspired) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-200/80 pt-1">
        <button
          onClick={() => onSelectCategory(null)}
          className={`px-4 py-2 text-xs font-medium rounded-full whitespace-nowrap transition-all ${
            selectedCategory === null
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          For you
        </button>
        <button
          onClick={() => onSelectCategory(null)}
          className={`px-4 py-2 text-xs font-medium rounded-full whitespace-nowrap transition-all ${
            selectedCategory === null
              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          Top charts
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelectCategory(c.id)}
            className={`px-4 py-2 text-xs font-medium rounded-full whitespace-nowrap transition-all ${
              selectedCategory === c.id
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* When Catalog is Empty */}
      {publishedApps.length === 0 ? (
        <div className="py-16 sm:py-24 px-4 text-center max-w-xl mx-auto space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-100 via-teal-50 to-emerald-200 flex items-center justify-center mx-auto text-emerald-600 shadow-sm border border-emerald-200/60">
            <ShoppingBag className="w-9 h-9 stroke-[1.8]" />
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Welcome to Smile Store!
            </h2>
            <p className="text-base text-slate-600 leading-relaxed font-normal">
              New apps will appear here when they become available.
            </p>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-slate-200 text-left space-y-3 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Independent & Verified Android Delivery</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Smile Store provides direct, transparent APK distribution backed by Cloudflare R2 object storage with \$0 egress. All applications are validated by authorized administrators before being published to the store.
            </p>
          </div>
        </div>
      ) : (
        /* When Real Published Apps Exist */
        <div className="space-y-8">
          {/* Featured Hero if apps are featured */}
          {featuredApps.length > 0 && !selectedCategory && !searchQuery && (
            <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-6 sm:p-8 shadow-md">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-4">
                <Sparkles className="w-4 h-4" />
                <span>FEATURED RELEASE</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <img
                    src={featuredApps[0].iconUrl || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=160&q=80'}
                    alt={featuredApps[0].name}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-white/20 shrink-0"
                  />
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold">{featuredApps[0].name}</h3>
                    <p className="text-xs text-slate-300 font-mono mt-0.5">{featuredApps[0].packageName}</p>
                    <p className="text-xs text-slate-300 mt-2 line-clamp-2 max-w-lg">{featuredApps[0].tagline}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => onDownloadClick(featuredApps[0])}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-colors shadow-sm flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Install APK
                  </button>
                  <button
                    onClick={() => onOpenAppDetail(featuredApps[0])}
                    className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium text-xs rounded-xl transition-colors"
                  >
                    Details
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Grid of Published Applications */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              {selectedCategory
                ? categories.find((c) => c.id === selectedCategory)?.name || 'Category'
                : searchQuery
                ? `Results for "${searchQuery}"`
                : 'Available Applications'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {publishedApps.map((app) => (
                <div
                  key={app.id}
                  onClick={() => onOpenAppDetail(app)}
                  className="bg-white rounded-2xl p-4 border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={app.iconUrl || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=160&q=80'}
                          alt={app.name}
                          className="w-14 h-14 rounded-2xl object-cover border border-slate-100 shrink-0"
                        />
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 leading-snug">{app.name}</h4>
                          <p className="text-xs text-slate-500">{app.developerName}</p>
                          <p className="text-[11px] font-mono text-slate-400 truncate max-w-[170px] mt-0.5">{app.packageName}</p>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(app.id);
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${
                          favoritesSet.has(app.id) ? 'text-rose-500 bg-rose-50' : 'text-slate-300 hover:text-rose-500'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${favoritesSet.has(app.id) ? 'fill-rose-500' : ''}`} />
                      </button>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{app.tagline}</p>
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <span>{app.categoryName}</span>
                      {app.latestVersion && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-[11px]">v{app.latestVersion.versionName}</span>
                        </>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDownloadClick(app);
                      }}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 font-semibold rounded-lg transition-colors flex items-center gap-1.5 text-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Get
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
