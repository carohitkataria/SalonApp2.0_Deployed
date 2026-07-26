/**
 * Reusable hamburger / slide-out nav for Salon admin pages.
 *
 * Reproduces the same nav surface that EnhancedSalonDashboard already has so
 * the salon admin retains the global menu on every page (Marketplace,
 * Inventory, Customer Orders, etc.).
 *
 * Usage:
 *   <SalonHamburgerMenu />
 * Place this absolutely inside any salon-admin page; it adds a fixed-position
 * trigger in the top-left corner.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, X, LayoutDashboard, Calendar, Users, Scissors, DollarSign, Database,
  TrendingUp, ShoppingBag, Boxes, FileText, Settings, LogOut, Bell,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';

const ITEMS = [
  { id: 'home',            label: 'Home',              icon: LayoutDashboard, route: '/salon/dashboard?tab=home' },
  { id: 'queue',           label: 'Token Queue',        icon: Calendar,       route: '/salon/dashboard?tab=queue' },
  { id: 'staff',           label: 'Staff Management',   icon: Users,          route: '/salon/dashboard?tab=staff' },
  { id: 'services',        label: 'Services & Offerings', icon: Scissors,    route: '/salon/dashboard?tab=services' },
  { id: 'reports',         label: 'Reports',            icon: TrendingUp,     route: '/salon/dashboard?tab=reports' },
  { id: 'customer-master', label: 'Customer Master',    icon: Database,       route: '/salon/dashboard?tab=customer-master' },
  { id: 'marketplace',     label: 'Marketplace',        icon: ShoppingBag,    route: '/salon/marketplace' },
  { id: 'inventory',       label: 'Inventory',          icon: Boxes,          route: '/salon/dashboard?tab=inventory' },
  { id: 'customer-orders', label: 'Customer Orders',    icon: Bell,           route: '/salon/customer-orders' },
  { id: 'staff-settings',  label: 'Staff Settings',    icon: Settings,       route: '/salon/staff/settings' },
  { id: 'gallery',         label: 'Gallery',            icon: FileText,       route: '/salon/dashboard?tab=gallery' },
  { id: 'salon',           label: 'Salon Settings',     icon: Settings,       route: '/salon/dashboard?tab=salon' },
];

export default function SalonHamburgerMenu({ activeId, className = '' }) {
  const navigate = useNavigate();
  const { logout } = useAuth?.() || { logout: null };
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    try {
      logout?.();
      localStorage.removeItem('salon_admin_token');
      localStorage.removeItem('salon_user_auth');
    } catch { /* noop */ }
    navigate('/');
  };

  return (
    <>
      <button
        type="button"
        data-testid="salon-hamburger-btn"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted transition-colors ${className}`}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
                className="fixed inset-0 bg-black/50 z-[100]"
              />
              <motion.div
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                transition={{ type: 'spring', damping: 22 }}
                className="fixed left-0 top-0 bottom-0 w-64 md:w-72 bg-card border-r border-border shadow-2xl z-[101] overflow-y-auto"
                data-testid="salon-hamburger-drawer"
              >
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Menu</h2>
                  <button
                    onClick={() => setOpen(false)}
                    className="p-2 hover:bg-muted rounded-lg"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-2">
                  {ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = activeId === item.id;
                    return (
                      <button
                        key={item.id}
                        data-testid={`nav-${item.id}`}
                        onClick={() => {
                          setOpen(false);
                          navigate(item.route);
                        }}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                          active ? 'bg-gold text-black font-semibold' : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-border p-2 mt-2">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-muted-foreground">Theme</span>
                    <ThemeToggle />
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-red-500 hover:bg-red-500/10 transition-all"
                    data-testid="salon-hamburger-logout"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>Logout</span>
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
