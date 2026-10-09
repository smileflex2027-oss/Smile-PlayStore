import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { StoreView } from './components/StoreView';
import { AppDetailModal } from './components/AppDetailModal';
import { DownloadVerificationModal } from './components/DownloadVerificationModal';
import { AdminCMS } from './components/AdminCMS';
import { AppListing, Category, Review } from './types';
import { api } from './api/client';
import { Cloud, Shield, Heart, ShoppingBag, X } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<'store' | 'admin'>('store');
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<any | null>(null);

  // Search & Category Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Public Catalog State (starts strictly empty from API)
  const [apps, setApps] = useState<AppListing[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [favoritesSet, setFavoritesSet] = useState<Set<string>>(new Set());
  const [favoritesModalOpen, setFavoritesModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Active Modals
  const [activeAppDetail, setActiveAppDetail] = useState<AppListing | null>(null);
  const [downloadModalApp, setDownloadModalApp] = useState<AppListing | null>(null);
  const [downloadData, setDownloadData] = useState<any>(null);

  // Load public catalog data from /api/v1
  const loadMarketplaceData = async () => {
    try {
      const [appsData, catsData] = await Promise.all([
        api.getApps({ category: selectedCategory || undefined, search: searchQuery || undefined }),
        api.getCategories(),
      ]);
      setApps(appsData);
      setCategories(catsData);
    } catch (err) {
      console.error('Failed to load apps from API:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarketplaceData();
  }, [selectedCategory, searchQuery]);

  const handleOpenAppDetail = async (app: AppListing) => {
    try {
      const full = await api.getApp(app.id, adminToken || undefined);
      setActiveAppDetail(full);
    } catch {
      setActiveAppDetail(app);
    }
  };

  const handleDownloadClick = async (app: AppListing) => {
    try {
      const data = await api.getDownloadUrl(app.id, adminToken || undefined);
      setDownloadModalApp(app);
      setDownloadData(data);
    } catch (err: any) {
      alert(`Could not acquire download URL: ${err.message}`);
    }
  };

  const handleToggleFavorite = async (appId: string) => {
    try {
      const res = await api.toggleFavorite(appId, adminToken || undefined);
      setFavoritesSet((prev) => {
        const next = new Set(prev);
        if (res.isFavorite) next.add(appId);
        else next.delete(appId);
        return next;
      });
    } catch {
      setFavoritesSet((prev) => {
        const next = new Set(prev);
        if (next.has(appId)) next.delete(appId);
        else next.add(appId);
        return next;
      });
    }
  };

  const handleReviewAdded = (newReview: Review) => {
    if (activeAppDetail) {
      setActiveAppDetail((prev) => {
        if (!prev) return null;
        const currentReviews = prev.reviews || [];
        return {
          ...prev,
          reviews: [newReview, ...currentReviews],
          reviewCount: currentReviews.length + 1,
        };
      });
      loadMarketplaceData();
    }
  };

  const favoriteApps = apps.filter((a) => favoritesSet.has(a.id));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-white">
      {/* Universal Google Play Store-Inspired Header */}
      <Header
        currentView={currentView}
        setCurrentView={setCurrentView}
        isAdminLoggedIn={!!adminToken}
        adminEmail={adminUser?.email}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        favoritesCount={favoritesSet.size}
        onOpenFavorites={() => setFavoritesModalOpen(true)}
        onOpenAdminLogin={() => setCurrentView('admin')}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="py-24 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Connecting to Smile Store catalog...</p>
          </div>
        ) : (
          <>
            {currentView === 'store' ? (
              <StoreView
                apps={apps}
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onOpenAppDetail={handleOpenAppDetail}
                onDownloadClick={handleDownloadClick}
                favoritesSet={favoritesSet}
                onToggleFavorite={handleToggleFavorite}
                searchQuery={searchQuery}
              />
            ) : (
              <AdminCMS
                categories={categories}
                adminToken={adminToken}
                adminUser={adminUser}
                onLogin={(token, user) => {
                  setAdminToken(token);
                  setAdminUser(user);
                }}
                onLogout={() => {
                  setAdminToken(null);
                  setAdminUser(null);
                  setCurrentView('store');
                }}
                onCatalogUpdated={loadMarketplaceData}
              />
            )}
          </>
        )}
      </main>

      {/* App Detail Modal */}
      {activeAppDetail && (
        <AppDetailModal
          app={activeAppDetail}
          isOpen={!!activeAppDetail}
          onClose={() => setActiveAppDetail(null)}
          onDownloadClick={(app) => {
            setActiveAppDetail(null);
            handleDownloadClick(app);
          }}
          isFavorite={favoritesSet.has(activeAppDetail.id)}
          onToggleFavorite={handleToggleFavorite}
          onReviewAdded={handleReviewAdded}
        />
      )}

      {/* Safe Download & SHA-256 Verifier Modal */}
      {downloadModalApp && (
        <DownloadVerificationModal
          app={downloadModalApp}
          isOpen={!!downloadModalApp}
          onClose={() => setDownloadModalApp(null)}
          downloadData={downloadData}
        />
      )}

      {/* Favorites Drawer Modal */}
      {favoritesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                <h3 className="text-sm font-bold text-slate-900">Saved Favorites ({favoriteApps.length})</h3>
              </div>
              <button
                onClick={() => setFavoritesModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {favoriteApps.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                No saved apps yet. When applications are published, click the heart icon to save them here.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {favoriteApps.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => {
                      setFavoritesModalOpen(false);
                      handleOpenAppDetail(a);
                    }}
                    className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <img src={a.iconUrl || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=160&q=80'} alt={a.name} className="w-9 h-9 rounded-xl object-cover" />
                      <div>
                        <p className="text-xs font-bold text-slate-900">{a.name}</p>
                        <p className="text-[10px] text-slate-500">{a.categoryName}</p>
                      </div>
                    </div>
                    <span className="text-[11px] text-emerald-700 font-semibold">View</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Google Play-Inspired Clean Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                <ShoppingBag className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-slate-900">Smile Store</span>
              <span className="text-slate-400">·</span>
              <span>“Your independent Android app marketplace”</span>
            </div>

            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1 text-slate-600">
                <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                Object Storage: Cloudflare R2
              </span>
              <span>·</span>
              <span className="flex items-center gap-1 text-slate-600">
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                Admin Certified APKs
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400">
            <p>
              © 2026 Smile Store. Original independent Android marketplace. Launches with an empty catalog until authorized administrators publish verified applications.
            </p>
            <div className="flex items-center gap-3">
              <span className="hover:text-slate-600 cursor-pointer">Terms of Service</span>
              <span>·</span>
              <span className="hover:text-slate-600 cursor-pointer">Privacy Policy</span>
              <span>·</span>
              <button
                onClick={() => setCurrentView('admin')}
                className="hover:text-emerald-700 font-medium"
              >
                Admin CMS
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
