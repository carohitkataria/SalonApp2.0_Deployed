/**
 * HomeV2Shell.js — reusable Zenoti-style shell (rail + ribbon + topbar).
 *
 * Wraps ANY tab content so all salon dashboard pages share the same left rail,
 * right ribbon and sticky topbar as the Home page. This delivers pending-list
 * item #2 (extend the rail+ribbon shell to Queue, Staff, Services, Finance,
 * Guests, Analytics, Shop, Stock, Marketing, Settings).
 *
 * Usage:
 *   <HomeV2Shell
 *     salon={salon}
 *     salonId={salonId}
 *     getAuthHeaders={getAuthHeaders}
 *     activeTab="queue"            // for rail highlight
 *     onSaved={() => refetch()}    // called after appointment/guest saved
 *   >
 *     <YourTabContent />
 *   </HomeV2Shell>
 *
 * Notes:
 *   • CSS is scoped under `.shv2`. Legacy tab content still renders (this
 *     shell only frames the page). Tab-content re-skinning is a separate
 *     task.
 *   • The New Appointment and Add Guest drawers live inside the shell so
 *     they work on every page — a global CTA the user can hit from anywhere.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { HOME_V2_CSS } from './styles';
import AppointmentDrawer from './AppointmentDrawer';
import CustomerDrawer from './CustomerDrawer';
import GlobalSearchDropdown from './GlobalSearchDropdown';
import NotificationsDrawer from './NotificationsDrawer';
import MessagesDrawer from './MessagesDrawer';
import SalonLogoControl from './SalonLogoControl';
import OrdersDrawer from '@/components/ops/OrdersDrawer';

// ---- Rail items — Home is provided by the logo click at top ----
export const RAIL_ITEMS = [
  { id: 'queue',           label: 'Queue',     route: '/salon/dashboard?tab=queue' },
  { id: 'customer-master', label: 'Guests',    route: '/salon/dashboard?tab=customer-master' },
  { id: 'marketing',       label: 'Marketing', route: '/salon/dashboard?tab=marketing' },
  { id: 'inventory',       label: 'Inventory', route: '/salon/dashboard?tab=inventory' },
  { id: 'shop',            label: 'Shop',      route: '/salon/dashboard?tab=shop' },
  { id: 'staff',           label: 'Staff',     route: '/salon/dashboard?tab=staff' },
  { id: 'services',        label: 'Services',  route: '/salon/dashboard?tab=services' },
  { id: 'reports',         label: 'Reports',   route: '/salon/dashboard?tab=reports' },
  { id: 'salon',           label: 'Settings',  route: '/salon/dashboard?tab=salon' },
];

// SVG icon set (matches SalonHomeV2 exactly for visual parity)
export const SHELL_ICONS = {
  home:     () => <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>,
  cal:      () => <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  users:    () => <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  chat:     () => <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  chart:    () => <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  gear:     () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  plus:     () => <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  guestAdd: () => <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
  cart:     () => <svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  search:   () => <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  bell:     () => <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  help:     () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  branch:   () => <svg viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>,
  scissors: () => <svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  rupee:    () => <svg viewBox="0 0 24 24"><path d="M6 3h12M6 8h12M9 3s5 0 5 5c0 4-5 5-5 5H6l7 8"/></svg>,
  tag:      () => <svg viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  send:     () => <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  rotate:   () => <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
  bag:      () => <svg viewBox="0 0 24 24"><path d="M6 8h12l1 12H5L6 8z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>,
  chartMix: () => <svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>,
};

// Rail icon lookup — id → icon component
const RAIL_ICON = {
  home: SHELL_ICONS.home,
  queue: SHELL_ICONS.cal,
  staff: SHELL_ICONS.users,
  services: SHELL_ICONS.scissors,
  financials: SHELL_ICONS.rupee,
  'customer-master': SHELL_ICONS.guestAdd,
  analytics: SHELL_ICONS.chart,
  reports: SHELL_ICONS.chartMix,
  marketplace: SHELL_ICONS.cart,
  inventory: SHELL_ICONS.tag,
  shop: SHELL_ICONS.bag,
  marketing: SHELL_ICONS.send,
  salon: SHELL_ICONS.gear,
};

export default function HomeV2Shell({
  salon,
  salonId,
  getAuthHeaders,
  activeTab = 'home',
  onSaved,          // callback fired when appointment or guest saved (parent refetches)
  showTopbar = true,
  unreadNotifCount = 0,
  onLogout,
  children,
}) {
  const navigate = useNavigate();
  const { logout } = useAuth?.() || { logout: null };

  // Global drawers, mounted once per shell — accessible from any tab.
  const [apptOpen, setApptOpen] = useState(false);
  const [apptPresetGuest, setApptPresetGuest] = useState(null);
  const [apptPreset, setApptPreset] = useState(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(unreadNotifCount || 0);
  useEffect(() => { setNotifCount(unreadNotifCount || 0); }, [unreadNotifCount]);

  // Mobile "More" bottom-sheet state (Phase 2)
  const [moreOpen, setMoreOpen] = useState(false);

  // Topbar compact-on-scroll (Phase 1): `.main` is the scroll container
  // (rail/ribbon are position:fixed). Use React's onScroll + state so the
  // binding is guaranteed, reflected via the .is-scrolled class.
  const topbarRef = useRef(null);
  const mainRef = useRef(null);
  const [topbarScrolled, setTopbarScrolled] = useState(false);

  // Allow any child component (e.g. ShopModule) to open the orders drawer
  // by dispatching a global CustomEvent. This keeps the drawer state at
  // the shell level so it works from every page.
  useEffect(() => {
    const handler = () => setOrdersOpen(true);
    window.addEventListener('salon:open-orders-drawer', handler);
    return () => window.removeEventListener('salon:open-orders-drawer', handler);
  }, []);

  // Same pattern — let any tab (e.g. Queue's "Add Booking") open the New
  // Appointment drawer that lives on the right ribbon.
  useEffect(() => {
    const handler = (e) => { setApptPresetGuest(e?.detail?.guest || null); setApptPreset(e?.detail?.preset || null); setApptOpen(true); };
    window.addEventListener('salon:open-new-appointment', handler);
    return () => window.removeEventListener('salon:open-new-appointment', handler);
  }, []);

  // Open the New Appointment drawer, optionally pre-selecting a guest.
  const openAppt = (guest = null) => { setApptPresetGuest(guest); setApptOpen(true); };

  // Inject scoped stylesheet once.
  useEffect(() => {
    const id = 'shv2-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = HOME_V2_CSS;
    document.head.appendChild(el);
  }, []);

  const goRail = (item) => navigate(item.route);
  const I = SHELL_ICONS;

  return (
    <div className="shv2">
      {/* ===== RAIL ===== */}
      <aside className="rail">
        <SalonLogoControl
          salonId={salonId}
          salon={salon}
          getAuthHeaders={getAuthHeaders}
          onLogoChanged={() => onSaved?.()}
          onClick={() => navigate('/salon/dashboard?tab=home')}
        />
        <nav className="rail__nav">
          {RAIL_ITEMS.map((it) => {
            const IconFn = RAIL_ICON[it.id] || I.gear;
            const on = it.id === activeTab;
            return (
              <button
                key={it.id}
                className={`navitem ${on ? 'active' : ''}`}
                onClick={() => goRail(it)}
                title={it.label}
              >
                <IconFn />
                <span>{it.label}</span>
              </button>
            );
          })}
          <button
            className="navitem navitem--exit"
            onClick={() => { try { onLogout?.(); logout?.(); } catch (_) { /* ignore */ } navigate('/'); }}
            title="Logout"
            data-testid="rail-exit-btn"
          >
            <I.rotate /><span>Exit</span>
          </button>
        </nav>
      </aside>

      {/* ===== RIBBON ===== */}
      <aside className="ribbon">
        <button className="ribbon__btn ribbon__cta" data-tip="New Appointment" onClick={() => openAppt(null)}><I.plus /></button>
        <button className="ribbon__btn" data-tip="Add Guest" onClick={() => setGuestOpen(true)}><I.guestAdd /></button>
        <button className="ribbon__btn" data-tip="Retail Sale" onClick={() => navigate('/salon/dashboard?tab=inventory')}><I.cart /></button>
        <button className="ribbon__btn" data-tip="Shop Orders" data-testid="ribbon-orders-btn" onClick={() => setOrdersOpen(true)}><I.bag /></button>
        <div className="ribbon__sep" />
        <button className="ribbon__btn" data-tip="Messages" data-testid="ribbon-messages-btn" onClick={() => setMessagesOpen(true)}><I.chat /></button>
        <button
          className="ribbon__btn"
          data-tip="Notifications"
          data-testid="ribbon-notif-btn"
          onClick={() => setNotifOpen(true)}
        >
          <I.bell />
          {notifCount > 0 && (
            <span className="dot">{notifCount > 9 ? '9+' : notifCount}</span>
          )}
        </button>
        <div className="ribbon__sep" />
        <button className="ribbon__btn" data-tip="Help" data-testid="ribbon-help-btn"
                onClick={() => {
                  const msg = encodeURIComponent("Hi, I need help with SalonHub.");
                  window.open(`https://wa.me/917503070727?text=${msg}`, '_blank', 'noopener,noreferrer');
                }}>
          <I.help />
        </button>
      </aside>

      {/* ===== MAIN ===== */}
      <main className="main" ref={mainRef} onScroll={(e) => setTopbarScrolled(e.currentTarget.scrollTop > 40)}>
        {showTopbar && (
          <header className={`topbar ${topbarScrolled ? 'is-scrolled' : ''}`} ref={topbarRef}>
            <div className="brand">
              <div className="brand__ic"><I.scissors /></div>
              <div>
                <h1>Salon Dashboard</h1>
                <p>{salon?.salon_name || 'Your Salon'}</p>
              </div>
            </div>
            <div className="topbar__spacer" />
            <div className="searchbox" style={{ maxWidth: 460, padding: 0, background: 'transparent', border: 'none' }}>
              <GlobalSearchDropdown salonId={salonId} getAuthHeaders={getAuthHeaders} />
            </div>
            <div className="branch"><I.branch /> {salon?.city || 'Main Branch'}</div>
          </header>
        )}

        {/* Tab content — children render here. For legacy tabs we let their
            own layout / theme paint inside; for future re-skinned tabs the
            content will match .shv2 tokens automatically. */}
        <div className="content shv2-tabhost">
          {children}
        </div>
      </main>

      {/* ===== MOBILE BOTTOM NAV (Phase 2) — shown only ≤820px ===== */}
      <nav className="mobnav" data-testid="mobile-bottom-nav">
        <button className="mobnav__item" onClick={() => navigate('/salon/dashboard?tab=home')} title="Home">
          <I.home /><span>Home</span>
        </button>
        <button className="mobnav__item" onClick={() => navigate('/salon/dashboard?tab=queue')} title="Queue">
          <I.cal /><span>Queue</span>
        </button>
        <button className="mobnav__cta" onClick={() => openAppt(null)} title="New appointment" data-testid="mobnav-new-appt">
          <I.plus />
        </button>
        <button className="mobnav__item" onClick={() => navigate('/salon/dashboard?tab=customer-master')} title="Guests">
          <I.guestAdd /><span>Guests</span>
        </button>
        <button className="mobnav__item" onClick={() => setMoreOpen(true)} title="More" data-testid="mobnav-more">
          <I.gear /><span>More</span>
        </button>
      </nav>

      {/* Mobile "More" bottom sheet */}
      {moreOpen && (
        <div className="mobsheet-back" onClick={() => setMoreOpen(false)} data-testid="mobsheet-backdrop">
          <div className="mobsheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobsheet__grip" />
            <div className="mobsheet__grid">
              {RAIL_ITEMS.filter((it) => !['queue', 'customer-master'].includes(it.id)).map((it) => {
                const IconFn = RAIL_ICON[it.id] || I.gear;
                return (
                  <button
                    key={it.id}
                    className="mobsheet__cell"
                    onClick={() => { setMoreOpen(false); navigate(it.route); }}
                  >
                    <span className="mobsheet__ic"><IconFn /></span>
                    <span>{it.label}</span>
                  </button>
                );
              })}
              <button className="mobsheet__cell" onClick={() => { setMoreOpen(false); setGuestOpen(true); }}>
                <span className="mobsheet__ic"><I.guestAdd /></span><span>Add guest</span>
              </button>
              <button className="mobsheet__cell" onClick={() => { setMoreOpen(false); setNotifOpen(true); }}>
                <span className="mobsheet__ic"><I.bell /></span><span>Notifications</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global appointment + guest drawers (available on every page) */}
      <AppointmentDrawer
        open={apptOpen}
        onClose={() => { setApptOpen(false); setApptPreset(null); }}
        onSaved={() => { setApptOpen(false); setApptPreset(null); onSaved?.(); toast.success('Appointment saved'); }}
        getAuthHeaders={getAuthHeaders}
        salonId={salonId}
        defaultMode="queue"
        presetGuest={apptPresetGuest}
        preset={apptPreset}
      />
      <CustomerDrawer
        open={guestOpen}
        onClose={() => setGuestOpen(false)}
        onSaved={() => { setGuestOpen(false); onSaved?.(); toast.success('Guest saved'); }}
        getAuthHeaders={getAuthHeaders}
        salonId={salonId}
      />

      {/* Notifications side-drawer — opens from ribbon Bell on every page */}
      <NotificationsDrawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        salonId={salonId}
        onCountUpdate={setNotifCount}
      />

      {/* Orders side-drawer — opens from ribbon bag icon (and from Shop's "Orders" button)
          Shows recent orders with quick actions (cancel / return / replace / concern) and a
          "View all orders (Details)" button that navigates to the full orders page inside Shop. */}
      <OrdersDrawer
        open={ordersOpen}
        onClose={() => setOrdersOpen(false)}
        getAuthHeaders={getAuthHeaders}
      />

      <MessagesDrawer
        open={messagesOpen}
        onClose={() => setMessagesOpen(false)}
        salonId={salonId}
        getAuthHeaders={getAuthHeaders}
      />
    </div>
  );
}
