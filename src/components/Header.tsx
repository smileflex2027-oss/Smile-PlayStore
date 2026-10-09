import React, { useState } from 'react';
import {
  ShoppingBag,
  Shield,
  Search,
  Heart,
  Cloud,
  Lock,
  Menu,
  X,
  Smartphone
} from 'lucide-react';
import { PortalView } from '../types';

interface HeaderProps {
  currentView: 'store' | 'admin';
  setCurrentView: (view: 'store' | 'admin') => void;
  isAdminLoggedIn: boolean;
  adminEmail?: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  favoritesCount: number;
  onOpenFavorites: () => void;
  onOpenAdminLogin: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  setCurrentView,
  isAdminLoggedIn,
  adminEmail,
  searchQuery,
  setSearchQuery,
  favoritesCount,
  onOpenFavorites,
  onOpenAdminLogin,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      {/* Cloudflare R2 Cloud Delivery Status Strip */}
      <div className="bg-slate-900 text-slate-300 text-[11px] px-4 py-1.5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Cloud className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-medium text-white">Storage Provider:</span>
          <span className="text-emerald-400 font-medium">Cloudflare R2 (Private APKs · \$0 Egress)</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          {isAdminLoggedIn ? (
            <span className="flex items-center gap-1 text-emerald-400 font-mono text-[10px]">
              <Shield className="w-3 h-3" />
              Admin: {adminEmail || 'admin@smilestore.app'}
            </span>
          ) : (
            <button
              onClick={onOpenAdminLogin}
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-[11px]"
            >
              <Lock className="w-3 h-3" />
              Admin Login
            </button>
          )}
        </div>
      </div>

      {/* Main Google Play-Inspired Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Tagline */}
          <div
            onClick={() => setCurrentView('store')}
            className="flex items-center gap-3 cursor-pointer shrink-0 group"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-sm shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <ShoppingBag className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold tracking-tight text-slate-900">Smile Store</span>
                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-1.5 py-0.2 rounded border border-emerald-200">
                  R2
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-none">Your independent Android app marketplace</p>
            </div>
          </div>

          {/* Centered Search Bar */}
          <div className="hidden sm:flex flex-1 max-w-lg mx-4">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search apps & games..."
                className="w-full pl-10 pr-4 py-2 bg-slate-100 hover:bg-slate-100/90 focus:bg-white text-xs sm:text-sm rounded-full border border-transparent focus:border-emerald-500 focus:outline-none transition-all placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 p-0.5"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentView('store')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-full transition-colors flex items-center gap-1.5 ${
                currentView === 'store'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Apps
            </button>

            <button
              onClick={() => {
                if (!isAdminLoggedIn) onOpenAdminLogin();
                else setCurrentView('admin');
              }}
              className={`px-3.5 py-2 text-xs font-semibold rounded-full transition-colors flex items-center gap-1.5 ${
                currentView === 'admin'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Admin CMS
            </button>

            <button
              onClick={onOpenFavorites}
              className="p-2 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors relative ml-1"
              title="Saved Favorites"
            >
              <Heart className="w-5 h-5" />
              {favoritesCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {favoritesCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Search Bar */}
        <div className="sm:hidden pb-3">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search apps..."
              className="w-full pl-9 pr-4 py-2 bg-slate-100 text-xs rounded-full border border-transparent focus:bg-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </header>
  );
};
