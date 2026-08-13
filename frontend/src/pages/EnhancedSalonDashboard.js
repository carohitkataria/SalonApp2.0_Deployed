import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import ThemeToggle from '@/components/ThemeToggle';
import BarberManagement from '@/components/BarberManagement';
import StaffCheckInWidget from '@/components/StaffCheckInWidget';
import BranchManagement from '@/components/BranchManagement';
import BranchSelector from '@/components/BranchSelector';
import OfferingsModule from '@/components/OfferingsModule';
import FinancialsModule from '@/components/FinancialsModule';
import ServicesModule from '@/components/ops/ServicesModule';
import InventoryModule from '@/components/ops/InventoryModule';
import ShopModule from '@/components/ops/ShopModule';
import ReportsModule from '@/components/ops/ReportsModule';
import { OpsProvider, useOps } from '@/components/ops/OpsContext';
import MyProfile from '@/components/MyProfile';
import PaymentVendorSetup from '@/components/PaymentVendorSetup';
import SalonNotificationSettings from '@/components/SalonNotificationSettings';
import OperationalHoursModule from '@/components/OperationalHoursModule';
import Analytics from '@/components/Analytics';
import SubscriptionPaywallModal from '@/components/SubscriptionPaywallModal';
import SubscriptionBadge from '@/components/SubscriptionBadge';
import { InventoryView } from '@/pages/salon/SalonInventoryPage';
import SalonHomeNew from '@/pages/salon/SalonHomeNew';
import SalonHomeV2 from '@/pages/salon/SalonHomeV2';
import HomeV2Shell from '@/pages/salon/home_v2/HomeV2Shell';
import SalonStaffV3 from '@/pages/salon/redesign/SalonStaffV3';
import SalonSettingsV3 from '@/pages/salon/redesign/SalonSettingsV3';
import TabHeaderV3 from '@/pages/salon/redesign/TabHeaderV3';
import QueueTabV2 from '@/pages/salon/home_v2/QueueTabV2';
import MarketingV2 from '@/pages/salon/v2_pages/MarketingV2';
import CustomersV2 from '@/pages/salon/v2_pages/CustomersV2';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { getSession, clearSession } from '@/utils/sessionManager';
import {
  requestNotificationPermission,
  showBrowserNotification,
  getSeenIds,
  setSeenIds,
} from '@/utils/browserNotifications';
import {
  Scissors, LogOut, ChevronRight, SkipForward, RotateCcw, XCircle,
  Clock, User, Phone, Bell, MapPin, Settings, CheckCircle, Calendar,
  Users, ArrowLeft, FileText, Download, Plus, X, TrendingUp, Menu,
  Shield, DollarSign, Database, Pin, PinOff, Edit, CreditCard, Banknote, Smartphone,
  LayoutDashboard, Activity, Zap, Wallet, Search, Building2, ShoppingBag, Boxes, Megaphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function EnhancedSalonDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { subscribe, unsubscribe } = useWebSocket();
  const { salonUser, isAdmin, hasPermission, isBranchManager } = useAuth();
  const { selectedBranchId } = useBranch();
  
  const [activeTab, setActiveTab] = useState(() => {
    // URL param is the single source of truth; absent param => 'home'.
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    const requestedTab = urlTab || 'home';
    
    // SECURITY: Check if requested tab is allowed for this user
    const isAdmin = (() => {
      let storedSalonUser = null;
      try {
        const raw = localStorage.getItem('salon_user_auth');
        if (raw) storedSalonUser = JSON.parse(raw);
      } catch (e) { storedSalonUser = null; }
      if (storedSalonUser) return ['admin', 'salon_admin', 'salon'].includes(storedSalonUser?.role);
      return !!localStorage.getItem('salon_admin_token');
    })();

    const isBM = (() => {
      try {
        const raw = localStorage.getItem('salon_user_auth');
        if (raw) return JSON.parse(raw)?.role === 'branch_manager';
      } catch (e) {}
      return false;
    })();
    
    const hasPermission = (permission) => {
      let storedSalonUser = null;
      try {
        const raw = localStorage.getItem('salon_user_auth');
        if (raw) storedSalonUser = JSON.parse(raw);
      } catch (e) { storedSalonUser = null; }
      if (['admin', 'salon_admin', 'salon'].includes(storedSalonUser?.role)) return true;
      return !!storedSalonUser?.permissions?.[permission];
    };
    
    // Check restricted tabs
    const restrictedTabs = {
      'staff': isAdmin || isBM || hasPermission('can_access_staff'),
      'services': isAdmin || isBM || hasPermission('can_access_services'),
      'gallery': isAdmin || isBM || hasPermission('can_access_gallery'),
      'marketing': isAdmin || isBM || hasPermission('can_access_gallery') || hasPermission('can_access_marketing'),
      'financials': isAdmin || isBM || hasPermission('can_access_financials'),
      'analytics': isAdmin || isBM || hasPermission('can_access_analytics'),
      'salon': isAdmin || hasPermission('can_edit_salon'),
      'branches': isAdmin || isBM
    };
    
    const allowed = restrictedTabs[requestedTab] ?? true;
    return allowed ? requestedTab : 'home';
  });

  // SINGLE DATA FLOW: URL (?tab=) -> activeTab. Every section/menu click writes
  // the URL via setSearchParams; this effect reads it back and sets activeTab.
  // Absent param => 'home'. Permission-gated tabs fall back to 'home'.
  useEffect(() => {
    const tab = searchParams.get('tab') || 'home';

    const isAdmin = (() => {
      let storedSalonUser = null;
      try {
        const raw = localStorage.getItem('salon_user_auth');
        if (raw) storedSalonUser = JSON.parse(raw);
      } catch (e) { storedSalonUser = null; }
      if (storedSalonUser) return ['admin', 'salon_admin', 'salon'].includes(storedSalonUser?.role);
      return !!localStorage.getItem('salon_admin_token');
    })();

    const hasPermission = (permission) => {
      let storedSalonUser = null;
      try {
        const raw = localStorage.getItem('salon_user_auth');
        if (raw) storedSalonUser = JSON.parse(raw);
      } catch (e) { storedSalonUser = null; }
      if (['admin', 'salon_admin', 'salon'].includes(storedSalonUser?.role)) return true;
      return !!storedSalonUser?.permissions?.[permission];
    };

    const isBM = (() => {
      try {
        const raw = localStorage.getItem('salon_user_auth');
        if (raw) return JSON.parse(raw)?.role === 'branch_manager';
      } catch (e) {}
      return false;
    })();

    const restrictedTabs = {
      'staff': isAdmin || isBM || hasPermission('can_access_staff'),
      'services': isAdmin || isBM || hasPermission('can_access_services'),
      'gallery': isAdmin || isBM || hasPermission('can_access_gallery'),
      'financials': isAdmin || isBM || hasPermission('can_access_financials'),
      'analytics': isAdmin || isBM || hasPermission('can_access_analytics'),
      'salon': isAdmin || hasPermission('can_edit_salon'),
      'branches': isAdmin || isBM,
      'inventory': isAdmin || isBM,
    };

    const allowed = restrictedTabs[tab] ?? true;
    const resolved = allowed ? tab : 'home';
    setActiveTab((prev) => (prev === resolved ? prev : resolved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Navigate to a dashboard section by writing the URL. Home clears the param
  // so the bare /salon/dashboard URL resolves to Home.
  const goToTab = (id) => {
    if (!id || id === 'home') {
      setSearchParams({});
    } else {
      setSearchParams({ tab: id });
    }
  };
  // Listen for programmatic navigation events emitted by Ops modules
  useEffect(() => {
    const onNav = (e) => {
      if (e?.detail?.tab) goToTab(e.detail.tab);
    };
    window.addEventListener('ops:navigate', onNav);
    return () => window.removeEventListener('ops:navigate', onNav);
  }, []); // eslint-disable-line
  const [salonId, setSalonId] = useState(null);
  const [salon, setSalon] = useState(null);
  const [barbers, setBarbers] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [selectedBarber, setSelectedBarber] = useState('all');
  const [filter, setFilter] = useState('all');
  // Today/Tomorrow date state — used for queue + home dashboard
  // Reliable IST via Intl API (Asia/Kolkata) — works regardless of browser TZ.
  const getISTDateOffset = (daysOffset = 0) => {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const today = fmt.format(new Date());
    if (daysOffset === 0) return today;
    const [y, m, d] = today.split('-').map(Number);
    const shifted = new Date(Date.UTC(y, m - 1, d + daysOffset));
    return fmt.format(shifted);
  };
  const [dateMode, setDateMode] = useState('today'); // 'today' | 'yesterday' | 'range'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const date = dateMode === 'yesterday' ? getISTDateOffset(-1) : getISTDateOffset(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPinned, setMenuPinned] = useState(() => {
    return localStorage.getItem('menu_pinned') === 'true';
  });
  
  // Add Services Dialog State
  const [addServicesDialog, setAddServicesDialog] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [allServices, setAllServices] = useState([]);
  const [selectedNewServices, setSelectedNewServices] = useState([]);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const [modifyTab, setModifyTab] = useState('services'); // kept for compatibility
  const [selectedNewBarber, setSelectedNewBarber] = useState(null);
  const [confirmPaymentMode, setConfirmPaymentMode] = useState('cash');
  const [finalAmount, setFinalAmount] = useState(0);
  // Module 7 — per-service barber assignment + order discount on Modify dialog
  // Map: { [service_id]: { barber_id, price } } — `price` is the barber-specific
  // service price loaded from /api/barbers/{id}/services.
  const [serviceAssignments, setServiceAssignments] = useState({});
  // Cache of barber-specific service prices: { [barber_id]: { [service_id]: price } }
  const [barberPriceCache, setBarberPriceCache] = useState({});
  const [orderDiscountPercent, setOrderDiscountPercent] = useState(0);
  // Tracks which discount field the user typed into last so we can correctly
  // recompute the other (true => discount %; false => final ₹).
  const discountSourceRef = useRef('percent');
  
  // Payment Confirmation Dialog (for Complete action)
  const [showPaymentConfirmDialog, setShowPaymentConfirmDialog] = useState(false);
  const [pendingCompleteTokenId, setPendingCompleteTokenId] = useState(null);
  const [completePaymentMode, setCompletePaymentMode] = useState('cash');
  // Wallet + partial-payment state for the "Complete" dialog
  const [walletInfo, setWalletInfo] = useState(null); // { wallet_balance, membership_name, tier, color, has_membership }
  const [completeWalletAmount, setCompleteWalletAmount] = useState(0);
  const [completeCashAmount, setCompleteCashAmount] = useState(0);
  const [completeUpiAmount, setCompleteUpiAmount] = useState(0);
  const [completeTokenTotal, setCompleteTokenTotal] = useState(0);
  
  // Notifications
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  // Home dashboard
  const [dailySales, setDailySales] = useState(0);
  const [homeBarberFilter, setHomeBarberFilter] = useState('all');
  
  // Manual Booking Dialog State
  const [showManualBookingDialog, setShowManualBookingDialog] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [bookingMode, setBookingMode] = useState('existing'); // 'existing' or 'adhoc'
  const [manualBookingForm, setManualBookingForm] = useState({
    customer_name: '',
    phone: '',
    gender: 'Men',
    barber_id: 'any',
    selected_services: [],
    payment_mode: 'cash'
  });
  const [manualSelectedCategory, setManualSelectedCategory] = useState('All');

  useEffect(() => {
    const storedSalonId = localStorage.getItem('salon_id');
    const legacyToken = localStorage.getItem('salon_admin_token');
    const salonUserAuth = localStorage.getItem('salon_user_auth');
    
    // Check for either legacy token or new multi-user auth
    if (!storedSalonId || (!legacyToken && !salonUserAuth)) {
      navigate('/salon/login');
      return;
    }

    // A staff-role user with no module permissions belongs on the Staff Portal,
    // not the admin dashboard (which would render an empty/broken view for them).
    if (salonUserAuth) {
      try {
        const a = JSON.parse(salonUserAuth);
        if (a?.role === 'staff') {
          const p = a.permissions || {};
          const flatOn = Object.keys(p).some((k) => k !== 'modules' && p[k] === true);
          const mods = p.modules || {};
          const modOn = Object.values(mods).some((acts) => acts && Object.values(acts).some(Boolean));
          if (!flatOn && !modOn) {
            navigate('/salon/staff-portal');
            return;
          }
        }
      } catch { /* ignore */ }
    }

    setSalonId(storedSalonId);
    fetchSalonData(storedSalonId);
    fetchBarbers(storedSalonId);
    fetchTokens(storedSalonId);
    fetchNotificationCount(storedSalonId);
    fetchDailySales(storedSalonId);

    // WebSocket subscriptions
    const handleUpdate = () => {
      if (storedSalonId) {
        fetchTokens(storedSalonId);
        fetchDailySales(storedSalonId);
      }
    };

    subscribe('token_created', handleUpdate);
    subscribe('new_token', handleUpdate);
    subscribe('token_updated', handleUpdate);
    subscribe('token_called', handleUpdate);
    subscribe('token_completed', handleUpdate);
    subscribe('token_skipped', handleUpdate);
    subscribe('token_recalled', handleUpdate);
    subscribe('token_cancelled', handleUpdate);
    subscribe('token_status_changed', handleUpdate);

    return () => {
      unsubscribe('token_created', handleUpdate);
      unsubscribe('new_token', handleUpdate);
      unsubscribe('token_updated', handleUpdate);
      unsubscribe('token_called', handleUpdate);
      unsubscribe('token_completed', handleUpdate);
      unsubscribe('token_skipped', handleUpdate);
      unsubscribe('token_recalled', handleUpdate);
      unsubscribe('token_cancelled', handleUpdate);
      unsubscribe('token_status_changed', handleUpdate);
    };
  }, [filter, selectedBarber]);

  // Polling fallback: every 10s re-fetch tokens + daily sales so the dashboard
  // stays in sync even if a websocket event is missed (network blip, mobile lock, etc.)
  useEffect(() => {
    const storedSalonId = localStorage.getItem('salon_id');
    if (!storedSalonId) return;
    const tick = () => {
      // Only refresh while the tab is visible — saves resources / mobile battery.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchTokens(storedSalonId);
      fetchDailySales(storedSalonId);
    };
    // Kick immediately so range/date changes are reflected without waiting.
    tick();
    const id = setInterval(tick, 10000);
    // Also refresh immediately when the tab becomes visible again.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchTokens(storedSalonId);
        fetchDailySales(storedSalonId);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, selectedBarber, dateMode, dateFrom, dateTo]);

  // Re-fetch tokens when date mode (today/tomorrow) toggles
  useEffect(() => {
    if (salonId) {
      fetchTokens(salonId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, salonId]);

  // Re-fetch dashboard data when the user switches the active branch.
  useEffect(() => {
    if (!salonId) return;
    fetchTokens(salonId);
    fetchBarbers(salonId);
    fetchDailySales(salonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  // SECURITY: Reset active tab to 'home' if it's not allowed for this user
  // (e.g., a staff user landing on a forbidden tab from a stale deep-link).
  // 'notifications' and 'branches' are valid non-menu tabs.
  useEffect(() => {
    const allowedIds = [...menuItems.map(m => m.id), 'notifications', 'branches'];
    if (activeTab && !allowedIds.includes(activeTab)) {
      goToTab('home');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonUser, salonId]);

  // Save active tab to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('salon_active_tab', activeTab);
  }, [activeTab]);

  // Browser notifications: detect new unread notifications and show native popup + sound
  useEffect(() => {
    if (!salonId) return;
    requestNotificationPermission();
    const storageKey = `seen_notif_salon_${salonId}`;
    let initialised = false;

    const pollNotifs = async () => {
      try {
        const res = await axios.get(`${API}/notifications/salon/${salonId}`);
        const notifs = Array.isArray(res.data) ? res.data : (res.data?.notifications || []);
        const seen = getSeenIds(storageKey);
        if (!initialised) {
          notifs.forEach(n => { if (n.id) seen.add(n.id); });
          setSeenIds(storageKey, seen);
          initialised = true;
          return;
        }
        const sorted = [...notifs].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        sorted.forEach(n => {
          if (!n.id || seen.has(n.id)) return;
          seen.add(n.id);
          if (n.is_read === false || n.read === false || n.is_read === undefined) {
            showBrowserNotification(
              n.title || 'New Salon Notification',
              n.message || n.body || '',
              { tag: `salon-${n.id}` }
            );
          }
        });
        setSeenIds(storageKey, seen);
      } catch (e) { /* silent */ }
    };
    pollNotifs();
    const interval = setInterval(pollNotifs, 30000);
    return () => clearInterval(interval);
  }, [salonId]);

  const getAuthHeaders = useCallback(() => {
    // Try new multi-user auth first, fall back to legacy
    const salonUserAuth = localStorage.getItem('salon_user_auth');
    if (salonUserAuth) {
      try {
        const authData = JSON.parse(salonUserAuth);
        // Feb 2026 — tolerate both `token` and `accessToken` keys. The
        // legacy phone/password path briefly wrote `accessToken` after the
        // SalonApp3.3 merge which caused Bearer-undefined 401s across
        // attendance/shop/inventory/orders/guests.
        const tok = authData?.token || authData?.accessToken;
        if (tok) return { Authorization: `Bearer ${tok}` };
      } catch (e) {
        // Fall through to legacy token
      }
    }

    const legacyToken = localStorage.getItem('salon_admin_token');
    return { Authorization: `Bearer ${legacyToken}` };
  }, []);

  const fetchSalonData = async (id) => {
    try {
      const response = await axios.get(`${API}/salons/${id}`);
      setSalon(response.data);
    } catch (error) {
      console.error('Error fetching salon:', error);
    }
  };

  const fetchBarbers = async (id) => {
    try {
      const params = new URLSearchParams();
      if (selectedBranchId) params.set('branch_id', selectedBranchId);
      const url = `${API}/salons/${id}/barbers${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await axios.get(url);
      setBarbers(response.data);
    } catch (error) {
      console.error('Error fetching barbers:', error);
    }
  };

  const fetchTokens = async (id) => {
    try {
      let url;
      // Feb 2026 — Range date support. When user selects "Range" and picks a
      // date_from/date_to, send both to backend so /queue can return tokens
      // spanning multiple days (previously ignored).
      const isRange = dateMode === 'range' && dateFrom && dateTo;
      if (selectedBarber === 'all') {
        url = isRange
          ? `${API}/salons/${id}/queue?date_from=${dateFrom}&date_to=${dateTo}`
          : `${API}/salons/${id}/queue?date=${date}`;
      } else {
        url = isRange
          ? `${API}/salons/${id}/barbers/${selectedBarber}/queue?date_from=${dateFrom}&date_to=${dateTo}`
          : `${API}/salons/${id}/barbers/${selectedBarber}/queue?date=${date}`;
      }
      if (filter !== 'all') {
        url += `&status=${filter}`;
      }
      if (selectedBranchId) {
        url += `&branch_id=${selectedBranchId}`;
      }

      const response = await axios.get(url);
      setTokens(response.data);
    } catch (error) {
      console.error('Error fetching tokens:', error);
    }
  };

  const handleCallNext = async (barberId) => {
    try {
      if (!barberId) {
        // Call next for any barber (first waiting token in queue)
        const waitingTokens = tokens.filter(t => t.status === 'waiting').sort((a, b) => a.token_number - b.token_number);
        if (waitingTokens.length === 0) {
          toast.error('No waiting customers in queue');
          return;
        }
        const nextToken = waitingTokens[0];
        barberId = nextToken.barber_id;
      }
      
      await axios.post(
        `${API}/salons/${salonId}/barbers/${barberId}/call-next`,
        {},
        { headers: getAuthHeaders() }
      );
      toast.success('Next token called');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to call next token');
    }
  };

  // Optimistic helper: mutate the local tokens list immediately so the card moves
  // to the next category before the websocket / re-fetch lands.
  const setTokenStatusLocally = (tokenId, newStatus, extra = {}) => {
    setTokens(prev =>
      Array.isArray(prev)
        ? prev.map(t => (t.id === tokenId ? { ...t, status: newStatus, ...extra } : t))
        : prev
    );
  };

  const handleCallToken = async (tokenId) => {
    // Optimistic: move to "called" immediately
    setTokenStatusLocally(tokenId, 'called');
    try {
      await axios.post(`${API}/tokens/${tokenId}/call`, {}, { headers: getAuthHeaders() });
      toast.success('Token called');
    } catch (error) {
      toast.error('Failed to call token');
      fetchTokens(salonId); // re-sync from server on failure
    }
  };

  const handleSkipToken = async (tokenId) => {
    if (!window.confirm('Skip this token? This action is final and cannot be undone.')) return;
    
    setTokenStatusLocally(tokenId, 'skipped');
    try {
      await axios.post(`${API}/tokens/${tokenId}/skip`, {}, { headers: getAuthHeaders() });
      toast.success('Token skipped');
    } catch (error) {
      toast.error('Failed to skip token');
      fetchTokens(salonId);
    }
  };

  const handleRecallToken = async (tokenId) => {
    setTokenStatusLocally(tokenId, 'waiting');
    try {
      await axios.post(`${API}/tokens/${tokenId}/recall`, {}, { headers: getAuthHeaders() });
      toast.success('Token recalled');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to recall token');
      fetchTokens(salonId);
    }
  };

  const handleCompleteToken = async (tokenId) => {
    // Find the token to check payment status
    const token = tokens.find(t => t.id === tokenId);
    if (token && !token.payment_confirmed) {
      // Pre-fetch wallet balance so we can show it + enable partial wallet
      const totalAmt = Number(token.total_amount) || 0;
      setPendingCompleteTokenId(tokenId);
      setCompletePaymentMode(token.payment_mode || 'cash');
      setCompleteTokenTotal(totalAmt);
      setCompleteWalletAmount(0);
      setCompleteCashAmount(totalAmt);
      setCompleteUpiAmount(0);
      setWalletInfo(null);
      try {
        const phoneQ = (token.phone || '').replace(/^\+91/, '');
        if (phoneQ && token.salon_id) {
          const res = await axios.get(`${API}/salons/${token.salon_id}/customers/${phoneQ}/wallet`);
          setWalletInfo(res.data || null);
        }
      } catch (err) {
        // Non-fatal — dialog still opens with wallet balance = 0
        console.warn('Failed to fetch wallet:', err);
      }
      setShowPaymentConfirmDialog(true);
      return;
    }
    
    if (!window.confirm('Mark this customer as completed? Invoice will be generated.')) return;
    
    setTokenStatusLocally(tokenId, 'completed');
    try {
      await axios.post(`${API}/tokens/${tokenId}/complete`, {}, { headers: getAuthHeaders() });
      toast.success('Token marked as completed');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to complete token');
      fetchTokens(salonId);
    }
  };

  // Helpers for the partial-payment dialog
  const applyWalletSelection = (mode) => {
    const bal = Number(walletInfo?.wallet_balance) || 0;
    const total = completeTokenTotal;
    if (mode === 'wallet_full') {
      if (bal >= total) {
        setCompleteWalletAmount(total);
        setCompleteCashAmount(0);
        setCompleteUpiAmount(0);
        setCompletePaymentMode('wallet');
      } else {
        // Partial: use all wallet, rest in cash
        setCompleteWalletAmount(bal);
        setCompleteCashAmount(Math.max(0, total - bal));
        setCompleteUpiAmount(0);
        setCompletePaymentMode('split');
      }
    } else if (mode === 'wallet_partial') {
      const useWallet = Math.min(bal, total);
      setCompleteWalletAmount(useWallet);
      setCompleteCashAmount(Math.max(0, total - useWallet));
      setCompleteUpiAmount(0);
      setCompletePaymentMode(useWallet > 0 ? 'split' : 'cash');
    } else if (mode === 'cash') {
      setCompleteWalletAmount(0);
      setCompleteCashAmount(total);
      setCompleteUpiAmount(0);
      setCompletePaymentMode('cash');
    } else if (mode === 'upi') {
      setCompleteWalletAmount(0);
      setCompleteCashAmount(0);
      setCompleteUpiAmount(total);
      setCompletePaymentMode('upi');
    }
  };

  const handleConfirmPaymentAndComplete = async () => {
    if (!pendingCompleteTokenId) return;
    
    const total = completeTokenTotal;
    const w = Number(completeWalletAmount) || 0;
    const c = Number(completeCashAmount) || 0;
    const u = Number(completeUpiAmount) || 0;
    const sum = w + c + u;

    if (Math.abs(sum - total) > 1) {
      toast.error(`Totals mismatch: entered ₹${sum.toFixed(0)}, expected ₹${total.toFixed(0)}`);
      return;
    }
    const walletBal = Number(walletInfo?.wallet_balance) || 0;
    if (w > walletBal + 0.001) {
      toast.error(`Wallet amount ₹${w.toFixed(0)} exceeds available balance ₹${walletBal.toFixed(0)}`);
      return;
    }

    try {
      await axios.post(
        `${API}/tokens/${pendingCompleteTokenId}/confirm-payment`,
        {
          payment_mode: completePaymentMode,
          wallet_amount: w,
          cash_amount: c,
          upi_amount: u,
        },
        { headers: getAuthHeaders() }
      );
      
      // Then complete the token
      await axios.post(`${API}/tokens/${pendingCompleteTokenId}/complete`, {}, { headers: getAuthHeaders() });
      toast.success('Payment confirmed and token marked as completed');
      setShowPaymentConfirmDialog(false);
      setPendingCompleteTokenId(null);
      fetchTokens(salonId);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to complete token');
    }
  };

  const handleConfirmPaymentOnly = async () => {
    if (!selectedToken) return;
    
    try {
      await axios.post(
        `${API}/tokens/${selectedToken.id}/confirm-payment`,
        { payment_mode: confirmPaymentMode },
        { headers: getAuthHeaders() }
      );
      toast.success('Payment confirmed successfully');
      setAddServicesDialog(false);
      fetchTokens(salonId);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm payment');
    }
  };

  const handleChangeBarber = async () => {
    if (!selectedToken || !selectedNewBarber) return;
    
    try {
      const response = await axios.put(
        `${API}/tokens/${selectedToken.id}/change-barber`,
        { barber_id: selectedNewBarber },
        { headers: getAuthHeaders() }
      );
      toast.success(response.data.message || 'Barber changed successfully');
      setAddServicesDialog(false);
      fetchTokens(salonId);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change barber');
    }
  };

  // Module 7 — load per-barber service prices on demand
  const ensureBarberPrices = async (barberId) => {
    if (!barberId || barberId === 'any') return {};
    if (barberPriceCache[barberId]) return barberPriceCache[barberId];
    try {
      const res = await axios.get(`${API}/barbers/${barberId}/services`);
      const map = {};
      (res.data || []).forEach((s) => {
        // /api/barbers/{id}/services returns merged service info with
        // `barber_price` overlay (falls back to base_price when unassigned).
        map[s.id] = Number(s.barber_price ?? s.base_price ?? 0);
      });
      setBarberPriceCache((prev) => ({ ...prev, [barberId]: map }));
      return map;
    } catch (err) {
      console.warn('Failed to load barber prices for', barberId, err);
      return {};
    }
  };

  const priceForServiceByBarber = (barberId, serviceId) => {
    const m = barberPriceCache[barberId] || {};
    if (m[serviceId] != null) return m[serviceId];
    // Fall back to global base price from `allServices`
    const svc = allServices.find((s) => s.id === serviceId);
    return Number(svc?.base_price || 0);
  };

  // Unified save handler for the modify dialog (Module 7: single PUT /modify endpoint)
  const handleSaveAllModifications = async () => {
    if (!selectedToken) return;
    if (!selectedNewBarber || selectedNewBarber === 'any') {
      toast.error('Please pick a main barber');
      return;
    }
    if (!selectedNewServices.length) {
      toast.error('Add at least one service');
      return;
    }

    // Hard guard against accidental zero-out: every line must have a non-zero
    // price OR the user must have explicitly typed a final amount.
    const assignments = selectedNewServices.map((sid) => {
      const a = serviceAssignments[sid] || {};
      const bid = a.barber_id || selectedNewBarber;
      const price = a.price != null ? Number(a.price) : priceForServiceByBarber(bid, sid);
      return { service_id: sid, barber_id: bid, service_price: price };
    });

    const subtotalCalc = assignments.reduce((s, a) => s + Number(a.service_price || 0), 0);
    if (subtotalCalc <= 0 && Number(finalAmount) <= 0) {
      toast.error('Prices are still loading. Please wait a moment and retry.');
      return;
    }
    const finalNum = Number(finalAmount);
    const pctNum = Number(orderDiscountPercent);

    // "Last edited wins": if user typed a Final that disagrees with the pct
    // computation, we send final_amount; else send order_discount_percent.
    const pctImplied = subtotalCalc > 0 ? ((subtotalCalc - finalNum) / subtotalCalc) * 100 : 0;
    const payload = { main_barber_id: selectedNewBarber, service_assignments: assignments };
    if (Math.abs(pctImplied - pctNum) > 0.5) {
      payload.final_amount = finalNum;
    } else {
      payload.order_discount_percent = pctNum;
    }
    if (confirmPaymentMode && confirmPaymentMode !== 'not_confirmed') {
      payload.payment_mode = confirmPaymentMode;
      if (!selectedToken.payment_confirmed || selectedToken.payment_mode !== confirmPaymentMode) {
        payload.payment_confirmed = true;
      }
    }

    try {
      await axios.put(
        `${API}/tokens/${selectedToken.id}/modify`,
        payload,
        { headers: getAuthHeaders() }
      );
      toast.success('Booking updated successfully');
      setAddServicesDialog(false);
      fetchTokens(salonId);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update booking');
    }
  };

  // Module 7 — when the main barber changes, overwrite every service line's
  // barber with the new main (per spec: "if the main barber is changed, all
  // services should change"). The first time we open the dialog, `mainBarber`
  // already matches all lines so this is a no-op.
  const mainBarberInitRef = useRef(null);
  useEffect(() => {
    if (!addServicesDialog) {
      mainBarberInitRef.current = null;
      return;
    }
    if (mainBarberInitRef.current === null) {
      mainBarberInitRef.current = selectedNewBarber;
      return;
    }
    if (selectedNewBarber && selectedNewBarber !== mainBarberInitRef.current) {
      mainBarberInitRef.current = selectedNewBarber;
      // Overwrite ALL line barbers with the new main; clear cached prices on
      // those rows so they refetch from the new barber's price list.
      ensureBarberPrices(selectedNewBarber);
      setServiceAssignments((curr) => {
        const upd = {};
        Object.keys(curr).forEach((sid) => {
          upd[sid] = { barber_id: selectedNewBarber, price: null };
        });
        return upd;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNewBarber, addServicesDialog]);

  // Module 7 — subtotal + discount/final synchronisation. Memoised so the
  // bottom bar always shows current numbers.
  const modifySubtotal = useMemo(() => {
    return selectedNewServices.reduce((sum, sid) => {
      const a = serviceAssignments[sid] || {};
      const bid = a.barber_id || selectedNewBarber;
      const price = a.price != null ? Number(a.price) : priceForServiceByBarber(bid, sid);
      return sum + Number(price || 0);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNewServices, serviceAssignments, selectedNewBarber, barberPriceCache, allServices]);

  // Keep Final ₹ and Discount % in sync. The user's last edit (tracked by
  // discountSourceRef) is authoritative; the other field is recomputed.
  useEffect(() => {
    if (!addServicesDialog) return;
    if (discountSourceRef.current === 'percent') {
      const pct = Math.max(0, Math.min(100, Number(orderDiscountPercent) || 0));
      const final = Math.max(0, modifySubtotal * (1 - pct / 100));
      setFinalAmount(Number(final.toFixed(2)));
    } else {
      // 'final' was last edited — derive the implied %
      const final = Math.max(0, Number(finalAmount) || 0);
      const pct = modifySubtotal > 0
        ? Math.max(0, Math.min(100, ((modifySubtotal - final) / modifySubtotal) * 100))
        : 0;
      setOrderDiscountPercent(Number(pct.toFixed(2)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modifySubtotal, orderDiscountPercent, finalAmount, addServicesDialog]);

  const fetchNotificationCount = async (sid) => {
    try {
      const response = await axios.get(`${API}/notifications/salon/${sid}/unread-count`);
      setUnreadNotifCount(response.data.unread_count || 0);
    } catch (error) {
      console.error('Error fetching notification count:', error);
    }
  };

  const fetchDailySales = async (sid) => {
    try {
      const params = new URLSearchParams();
      if (selectedBranchId) params.set('branch_id', selectedBranchId);
      const url = `${API}/salons/${sid}/today-sales${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await axios.get(url, { headers: getAuthHeaders() });
      setDailySales(response.data.today_sales || 0);
    } catch (error) {
      console.error('Error fetching daily sales:', error);
    }
  };

  const handleCancelToken = async (tokenId) => {
    if (!window.confirm('Cancel this token?')) return;
    
    setTokenStatusLocally(tokenId, 'cancelled');
    try {
      await axios.post(`${API}/tokens/${tokenId}/cancel`, {}, { headers: getAuthHeaders() });
      toast.success('Token cancelled');
    } catch (error) {
      toast.error('Failed to cancel token');
      fetchTokens(salonId);
    }
  };

  const handleSendNotification = async (tokenId) => {
    try {
      await axios.post(`${API}/tokens/${tokenId}/notify`, {}, { headers: getAuthHeaders() });
      toast.success('Notification sent to customer');
    } catch (error) {
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to send notification');
    }
  };

  const fetchAllServices = async () => {
    try {
      // Fetch only services enabled for THIS salon (not the global services list).
      // Falls back to the global list if the enabled endpoint fails for any reason.
      let enabled = [];
      try {
        const res = await axios.get(`${API}/salons/${salonId}/services/enabled`);
        enabled = Array.isArray(res.data) ? res.data : [];
      } catch (e) {
        console.warn('Enabled services fetch failed, falling back to /services');
        const fallback = await axios.get(`${API}/services`);
        enabled = fallback.data || [];
      }
      setAllServices(enabled);
      return enabled;
    } catch (error) {
      console.error('Error fetching services:', error);
      toast.error('Failed to load services');
      return [];
    }
  };

  const handleOpenAddServices = async (token) => {
    setSelectedToken(token);
    setSelectedNewServices(token.selected_services || []);
    // "any" tokens shouldn't reach this screen post-confirmation; if a legacy
    // doc still has it, fall back to the first active barber.
    const mainBarber = (!token.barber_id || token.barber_id === 'any')
      ? (barbers.find((b) => b.is_active)?.id || barbers[0]?.id || '')
      : token.barber_id;
    setSelectedNewBarber(mainBarber);
    setConfirmPaymentMode(token.payment_confirmed ? (token.payment_mode || 'cash') : 'not_confirmed');
    setOrderDiscountPercent(Number(token.order_discount_percent || 0));
    setServiceSearchQuery('');
    setModifyTab('assignment');

    // Fetch services FIRST so we can resolve names + base prices synchronously
    // when building the initial assignments. This guarantees the dialog opens
    // with a non-zero subtotal and the assignment table shows real service
    // names (not raw UUIDs).
    const services = await fetchAllServices();
    const serviceById = Object.fromEntries(services.map((s) => [s.id, s]));

    // Pre-load barber-specific prices for the main barber AND every barber
    // referenced in an existing split.
    const existing = token.service_assignments || [];
    const barberIdsToLoad = new Set([mainBarber]);
    existing.forEach((a) => a.barber_id && barberIdsToLoad.add(a.barber_id));
    const cachesByBarber = {};
    await Promise.all(
      Array.from(barberIdsToLoad).map(async (bid) => {
        cachesByBarber[bid] = await ensureBarberPrices(bid);
      })
    );

    // Seed initial assignments with EXPLICIT prices. Priority:
    //   1) Persisted line price on token.service_assignments
    //   2) Barber-specific price from /barbers/{id}/services
    //   3) Service base_price from /salons/{id}/services/enabled
    const initialAssignments = {};
    if (existing.length) {
      existing.forEach((a) => {
        initialAssignments[a.service_id] = {
          barber_id: a.barber_id,
          price: Number(a.service_price || 0),
        };
      });
    } else {
      (token.selected_services || []).forEach((sid) => {
        const cache = cachesByBarber[mainBarber] || {};
        const price = cache[sid] != null ? cache[sid] : (serviceById[sid]?.base_price || 0);
        initialAssignments[sid] = { barber_id: mainBarber, price: Number(price) };
      });
    }
    setServiceAssignments(initialAssignments);

    // Initial Final ₹ = the token's existing total_amount (so an immediate Save
    // without edits never zeroes the order).
    setFinalAmount(Number(token.total_amount || 0));
    discountSourceRef.current = 'percent';

    setAddServicesDialog(true);
  };

  const handleUpdateServices = async () => {
    // Check if any change was made
    const originalServices = selectedToken.selected_services || [];
    const hasChanges = JSON.stringify([...selectedNewServices].sort()) !== JSON.stringify([...originalServices].sort());
    
    if (!hasChanges) {
      toast.info('No changes made');
      setAddServicesDialog(false);
      return;
    }

    try {
      const response = await axios.put(
        `${API}/tokens/${selectedToken.id}/update-services`,
        { service_ids: selectedNewServices },
        { headers: getAuthHeaders() }
      );
      
      toast.success('Services updated successfully');
      setAddServicesDialog(false);
      fetchTokens(salonId); // Refresh token list to show updated amount
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update services');
    }
  };

  const toggleServiceSelection = (serviceId) => {
    setSelectedNewServices((prev) => {
      const isAdding = !prev.includes(serviceId);
      const next = isAdding ? [...prev, serviceId] : prev.filter((id) => id !== serviceId);
      // Maintain per-service assignment map in sync.
      setServiceAssignments((curr) => {
        const upd = { ...curr };
        if (isAdding) {
          // Seed newly-added service with the current main barber.
          if (!upd[serviceId]) {
            upd[serviceId] = { barber_id: selectedNewBarber, price: null };
          }
        } else {
          delete upd[serviceId];
        }
        return upd;
      });
      return next;
    });
  };

  const fetchCustomers = async () => {
    try {
      const response = await axios.get(`${API}/salons/${salonId}/customers`, {
        headers: getAuthHeaders()
      });
      setCustomers(response.data.customers || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const handleOpenManualBooking = async () => {
    await fetchCustomers();
    await fetchAllServices();
    setBookingMode('existing');
    setCustomerSearchQuery('');
    setSelectedCustomer(null);
    setWalletInfo(null);
    setManualSelectedCategory('All');
    setManualBookingForm({
      customer_name: '',
      phone: '',
      gender: 'Men',
      barber_id: selectedBarber === 'all' ? 'any' : selectedBarber,
      selected_services: [],
      payment_mode: 'cash'
    });
    setShowManualBookingDialog(true);
  };

  const handleManualBooking = async () => {
    if (bookingMode === 'existing' && !manualBookingForm.customer_name) {
      toast.error('Please select a customer');
      return;
    }
    if (bookingMode === 'adhoc' && !manualBookingForm.customer_name.trim()) {
      toast.error('Customer name is required');
      return;
    }
    if (manualBookingForm.selected_services.length === 0) {
      toast.error('Please select at least one service');
      return;
    }

    try {
      await axios.post(
        `${API}/salons/${salonId}/salon-booking`,
        {
          customer_name: manualBookingForm.customer_name,
          phone: manualBookingForm.phone,
          gender: manualBookingForm.gender,
          barber_id: manualBookingForm.barber_id,
          selected_services: manualBookingForm.selected_services,
          payment_mode: manualBookingForm.payment_mode,
          branch_id: selectedBranchId || undefined
        },
        { headers: getAuthHeaders() }
      );
      toast.success('Booking created successfully');
      setShowManualBookingDialog(false);
      fetchTokens(salonId);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create booking');
    }
  };

  const handleCustomerSelection = async (customer) => {
    setSelectedCustomer(customer);
    setManualBookingForm(prev => ({
      ...prev,
      customer_name: customer.name,
      phone: customer.phone,
      gender: customer.gender || 'Men'
    }));
    // Pre-fetch wallet balance so the Wallet payment button shows the amount
    // and gets enabled/disabled correctly.
    try {
      const phoneQ = String(customer.phone || '').replace(/^\+91/, '').replace(/\D/g, '');
      if (phoneQ) {
        const res = await axios.get(`${API}/salons/${salonId}/customers/${phoneQ}/wallet`);
        setWalletInfo(res.data || null);
      } else {
        setWalletInfo(null);
      }
    } catch (err) {
      setWalletInfo(null);
    }
  };

  const toggleManualServiceSelection = (serviceId) => {
    setManualBookingForm(prev => ({
      ...prev,
      selected_services: prev.selected_services.includes(serviceId)
        ? prev.selected_services.filter(id => id !== serviceId)
        : [...prev.selected_services, serviceId]
    }));
  };

  const handleLogout = () => {
    // SECURITY: Purge ALL salon auth data so the next user (especially staff)
    // can't inherit admin privileges from a stale legacy token in localStorage.
    try {
      localStorage.removeItem('salon_admin_token');
      localStorage.removeItem('salon_user_auth');
      localStorage.removeItem('salon_id');
      localStorage.removeItem('salon_active_tab');
    } catch (e) { /* ignore */ }
    clearSession();  // Clear all session data using session manager
    // Notify AuthContext to flush in-memory state so the next login renders cleanly
    try { window.dispatchEvent(new Event('salon-auth-changed')); } catch (e) {}
    navigate('/salon/login');
    toast.success('Logged out successfully');
  };

  // Check if user is admin. SECURITY: prefer multi-user auth over legacy.
  // If a multi-user auth is present (salon_user_auth), the legacy token MUST be
  // ignored — this prevents stale admin tokens from a previous session from
  // granting elevated access to a freshly logged-in staff user on the same browser.
  const checkIsAdmin = () => {
    // Read from localStorage directly to avoid race conditions with React state
    let storedSalonUser = null;
    try {
      const raw = localStorage.getItem('salon_user_auth');
      if (raw) storedSalonUser = JSON.parse(raw);
    } catch (e) { storedSalonUser = null; }

    if (storedSalonUser || salonUser) {
      const u = storedSalonUser || salonUser;
      return ['admin', 'salon_admin', 'salon'].includes(u?.role);
    }
    // Only if NO multi-user auth, fall back to legacy salon login (treated as admin)
    const legacyToken = localStorage.getItem('salon_admin_token');
    return !!legacyToken;
  };

  const checkIsBranchManager = () => {
    let storedSalonUser = null;
    try {
      const raw = localStorage.getItem('salon_user_auth');
      if (raw) storedSalonUser = JSON.parse(raw);
    } catch (e) { storedSalonUser = null; }
    const u = storedSalonUser || salonUser;
    return u?.role === 'branch_manager';
  };

  const checkHasPermission = (permission) => {
    // Read multi-user auth from localStorage to be strict
    let storedSalonUser = null;
    try {
      const raw = localStorage.getItem('salon_user_auth');
      if (raw) storedSalonUser = JSON.parse(raw);
    } catch (e) { storedSalonUser = null; }

    const u = storedSalonUser || salonUser;
    if (u) {
      if (['admin', 'salon_admin', 'salon'].includes(u.role)) return true;
      return !!u.permissions?.[permission];
    }
    // Legacy login (no multi-user auth at all) has all permissions
    const legacyToken = localStorage.getItem('salon_admin_token');
    if (legacyToken) return true;
    return false;
  };

  // Define menu items with role-based visibility
  const menuItems = [
    { id: 'home', label: 'Home', icon: LayoutDashboard, show: true },
    { id: 'queue', label: 'Token Queue', icon: Calendar, show: true },
    { id: 'staff', label: 'Staff Management', icon: Users, show: checkIsAdmin() || checkIsBranchManager() || checkHasPermission('can_access_staff') },
    { id: 'services', label: 'Services', icon: Scissors, show: checkIsAdmin() || checkIsBranchManager() || checkHasPermission('can_access_services') },
    { id: 'reports', label: 'Reports', icon: TrendingUp, show: checkIsAdmin() || checkIsBranchManager() || checkHasPermission('can_access_financials') || checkHasPermission('can_access_analytics') },
    { id: 'customer-master', label: 'Guests', icon: Database, show: true },
    { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag, show: checkIsAdmin(), route: '/salon/marketplace' },
    { id: 'inventory', label: 'Inventory', icon: Boxes, show: checkIsAdmin() || checkIsBranchManager() },
    { id: 'shop', label: 'Shop', icon: ShoppingBag, show: checkIsAdmin() || checkIsBranchManager() },
    { id: 'marketing', label: 'Marketing', icon: Megaphone, show: checkIsAdmin() || checkIsBranchManager() || checkHasPermission('can_access_gallery') || checkHasPermission('can_access_marketing') },
    { id: 'salon', label: 'Salon Settings', icon: Settings, show: checkIsAdmin() || checkHasPermission('can_edit_salon') }
  ].filter(item => item.show);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'waiting': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'called': return <ChevronRight className="w-4 h-4 text-blue-500" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'skipped': return <SkipForward className="w-4 h-4 text-red-500" />;
      case 'cancelled': return <XCircle className="w-4 h-4 text-gray-500" />;
      default: return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'waiting': return 'border-yellow-500/30 bg-yellow-500/5';
      case 'called': return 'border-blue-500/50 bg-blue-500/10';
      case 'completed': return 'border-green-500/30 bg-green-500/5';
      case 'skipped': return 'border-red-500/30 bg-red-500/5';
      case 'cancelled': return 'border-gray-500/30 bg-gray-500/5';
      default: return 'border-border';
    }
  };

  return (
    <SubscriptionProvider salonId={salonId}>
    {/* Home tab uses its own full-viewport shell (rail + ribbon). Render outside
        the legacy header/max-w-7xl wrapper so the new design isn't constrained. */}
    {activeTab === 'home' ? (
      <SalonHomeV2
        salon={salon}
        salonId={salonId}
        tokens={tokens}
        barbers={barbers}
        goToTab={goToTab}
        getAuthHeaders={getAuthHeaders}
        handleCallToken={handleCallToken}
        handleCompleteToken={handleCompleteToken}
      />
    ) : (
    <HomeV2Shell
      salon={salon}
      salonId={salonId}
      getAuthHeaders={getAuthHeaders}
      activeTab={activeTab}
      unreadNotifCount={unreadNotifCount}
      onLogout={handleLogout}
      onSaved={() => { try { fetchTokens?.(); fetchBarbers?.(); } catch (_) {} }}
    >
    <div className="min-h-screen bg-background text-foreground">
      <div className="w-full px-3 md:px-5 py-4">

        {/* ===== HOME DASHBOARD (rendered separately outside this wrapper) ===== */}

        {activeTab === 'queue' && (
          <div className="tab-pad-legacy tab-hdr-scope">
            <TabHeaderV3
              icon="queue"
              title="Live Queue"
              accent="sky"
            />
            <QueueTabV2
              date={date}
              salonId={salonId}
              getAuthHeaders={getAuthHeaders}
              dateMode={dateMode}
              setDateMode={setDateMode}
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
              barbers={barbers}
              selectedBarber={selectedBarber}
              setSelectedBarber={setSelectedBarber}
              tokens={tokens}
              filter={filter}
              setFilter={setFilter}
              handleCallNext={handleCallNext}
              handleCallToken={handleCallToken}
              handleCompleteToken={handleCompleteToken}
              handleRecallToken={handleRecallToken}
              handleSkipToken={handleSkipToken}
              handleCancelToken={handleCancelToken}
              handleSendNotification={handleSendNotification}
              handleOpenAddServices={handleOpenAddServices}
              API={API}
              navigate={navigate}
            />
          </div>
        )}

        {activeTab === 'staff' && salonId && (
          <SalonStaffV3 salonId={salonId} getAuthHeaders={getAuthHeaders} />
        )}

        {activeTab === 'customer-master' && (
          <div className="tab-pad-legacy tab-hue-teal">
            <CustomersV2 salonId={salonId} getAuthHeaders={getAuthHeaders} salon={salon} />
          </div>
        )}

        {activeTab === 'financials' && salonId && (
          <ReportsModule salonId={salonId} getAuthHeaders={getAuthHeaders} canManageFinancials={checkIsAdmin() || checkHasPermission('can_access_financials')} />
        )}

        {activeTab === 'reports' && salonId && (
          <ReportsModule salonId={salonId} getAuthHeaders={getAuthHeaders} canManageFinancials={checkIsAdmin() || checkHasPermission('can_access_financials')} />
        )}

        {activeTab === 'shop' && salonId && (
          <OpsProvider>
            <ShopModule salonId={salonId} salonProfile={salon} getAuthHeaders={getAuthHeaders} />
          </OpsProvider>
        )}

        {/* Legacy customer-master placeholder removed — replaced by CustomersV2 above */}

        {activeTab === 'services' && salonId && (
          <ServicesModule salonId={salonId} getAuthHeaders={getAuthHeaders} />
        )}

        {activeTab === 'marketing' && (
          <div className="tab-pad-legacy tab-hue-violet">
            <MarketingV2 salonId={salonId} getAuthHeaders={getAuthHeaders} salon={salon} />
          </div>
        )}

        {activeTab === 'analytics' && salonId && (
          <ReportsModule salonId={salonId} getAuthHeaders={getAuthHeaders} canManageFinancials={checkIsAdmin() || checkHasPermission('can_access_financials')} />
        )}

        {activeTab === 'salon' && salonId && (
          <SalonSettingsV3
            salonId={salonId}
            salon={salon}
            setSalon={setSalon}
            getAuthHeaders={getAuthHeaders}
            onDeleteSalon={handleLogout}
          />
        )}

        {activeTab === 'branches' && salonId && checkIsAdmin() && (
          <BranchManagement salonId={salonId} />
        )}

        {activeTab === 'inventory' && salonId && (checkIsAdmin() || checkIsBranchManager()) && (
          <OpsProvider>
            <InventoryModule salonId={salonId} salonProfile={salon} getAuthHeaders={getAuthHeaders} />
          </OpsProvider>
        )}

        {activeTab === 'notifications' && salonId && (
          <SalonNotificationsPanel
            salonId={salonId}
            onCountUpdate={(count) => setUnreadNotifCount(count)}
            onNavigate={(tabId) => {
              goToTab(tabId);
            }}
          />
        )}
      </div>

      {/* Modify Booking Drawer (right-side, matches Queue theme) */}
      <div
        className={`shv2-overlay ${addServicesDialog ? 'open' : ''}`}
        onClick={() => setAddServicesDialog(false)}
        style={{ zIndex: 9060 }}
      />
      <aside
        data-testid="modify-booking-drawer"
        role="dialog"
        aria-modal="true"
        aria-hidden={!addServicesDialog}
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0,
          width: 'min(640px, 95vw)', background: '#fff',
          boxShadow: '-20px 0 40px rgba(30,32,50,.12)',
          borderLeft: '1px solid #ECECF3',
          transform: addServicesDialog ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .32s cubic-bezier(.22,.61,.36,1)',
          zIndex: 9070, display: 'flex', flexDirection: 'column',
          fontFamily: "'Plus Jakarta Sans','Inter',system-ui,sans-serif",
          color: '#23252F',
        }}
      >
        {/* Drawer header — Queue-purple theme */}
        <div style={{
          padding: '16px 22px', borderBottom: '1px solid #ECECF3',
          background: 'linear-gradient(135deg,#F5F1FF,#FFFFFF)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.7px', color: '#6C4FE0', textTransform: 'uppercase' }}>Queue · Booking</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>Modify Booking</div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setAddServicesDialog(false)}
            style={{
              width: 34, height: 34, borderRadius: 10, border: '1px solid #ECECF3',
              background: '#fff', color: '#23252F', cursor: 'pointer', fontSize: 20, lineHeight: 1,
              display: 'grid', placeItems: 'center',
            }}
          >×</button>
        </div>
        <div style={{ padding: '14px 22px 18px', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} data-testid="modify-booking-dialog">
          {selectedToken && (
            <>
              {/* Compact Info Row */}
              <div className="flex items-center gap-3 p-3 rounded-lg text-sm flex-shrink-0" style={{ background: '#F6F6FA' }}>
                <span className="font-bold" style={{ color: '#6C4FE0' }}>{selectedToken.token_number}</span>
                <span className="font-semibold">{selectedToken.customer_name}</span>
                <span style={{ color: '#9EA1B2' }}>•</span>
                <span style={{ color: selectedToken.payment_confirmed ? '#12A150' : '#D8873F', fontWeight: 600 }}>
                  {selectedToken.payment_confirmed ? '✓ Paid' : '⏳ Unpaid'}
                </span>
              </div>

              {/* Main barber + Payment row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 flex-shrink-0">
                <div>
                  <Label className="text-xs text-muted-foreground">Main barber (customer-facing)</Label>
                  <select
                    value={selectedNewBarber || ''}
                    onChange={(e) => setSelectedNewBarber(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-gold/50"
                    data-testid="modify-main-barber-select"
                  >
                    {barbers.filter((b) => b.is_active !== false).map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Payment mode</Label>
                  <select
                    value={confirmPaymentMode}
                    onChange={(e) => setConfirmPaymentMode(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-gold/50"
                    data-testid="modify-payment-mode-select"
                  >
                    <option value="not_confirmed">Not Confirmed</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="wallet">Wallet</option>
                    <option value="card">Card</option>
                  </select>
                </div>
              </div>

              {/* Tabs: Services search vs Assignment table */}
              <div className="mt-3 flex items-center gap-2 border-b flex-shrink-0" style={{ borderColor: '#ECECF3' }}>
                <button
                  type="button"
                  onClick={() => setModifyTab('services')}
                  className="px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    color: modifyTab === 'services' ? '#6C4FE0' : '#7C8092',
                    borderBottom: modifyTab === 'services' ? '2px solid #6C4FE0' : '2px solid transparent',
                  }}
                  data-testid="modify-tab-services"
                >
                  Pick services ({selectedNewServices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setModifyTab('assignment')}
                  className="px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    color: modifyTab === 'assignment' ? '#6C4FE0' : '#7C8092',
                    borderBottom: modifyTab === 'assignment' ? '2px solid #6C4FE0' : '2px solid transparent',
                  }}
                  data-testid="modify-tab-assignment"
                >
                  Barber assignment
                </button>
              </div>

              {/* Services picker pane */}
              {modifyTab === 'services' && (
                <>
                  <div className="mt-2 flex-shrink-0">
                    <Input
                      type="text"
                      placeholder="Search services..."
                      value={serviceSearchQuery}
                      onChange={(e) => setServiceSearchQuery(e.target.value)}
                      className="w-full h-9 text-sm"
                    />
                  </div>
                  <div className="mt-2 space-y-1.5 overflow-y-auto flex-1 min-h-0 pr-1">
                    {allServices
                      .filter((service) =>
                        service.service_name.toLowerCase().includes(serviceSearchQuery.toLowerCase()) ||
                        service.category?.toLowerCase().includes(serviceSearchQuery.toLowerCase())
                      )
                      .map((service) => {
                        const isSelected = selectedNewServices.includes(service.id);
                        return (
                          <div
                            key={service.id}
                            className="flex items-center gap-3 px-3 py-2 border rounded-lg cursor-pointer transition-all text-sm"
                            style={isSelected
                              ? { borderColor: '#6C4FE0', background: 'rgba(108,79,224,.06)' }
                              : { borderColor: '#ECECF3' }}
                            onClick={() => toggleServiceSelection(service.id)}
                          >
                            <Checkbox checked={isSelected} onCheckedChange={() => toggleServiceSelection(service.id)} />
                            <span className="flex-1 font-medium">{service.service_name}</span>
                            <span className="text-xs" style={{ color: '#7C8092' }}>{service.category}</span>
                            <span className="font-bold" style={{ color: '#6C4FE0' }}>₹{service.base_price}</span>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}

              {/* Per-service Assignment pane */}
              {modifyTab === 'assignment' && (
                <div className="mt-2 overflow-y-auto flex-1 min-h-0 pr-1" data-testid="service-assignment-table">
                  {selectedNewServices.length === 0 && (
                    <p className="text-center text-muted-foreground py-6 text-sm">
                      Pick at least one service first.
                    </p>
                  )}
                  {selectedNewServices.length > 0 && (
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                        <div className="col-span-5">Service</div>
                        <div className="col-span-2 text-right">Price</div>
                        <div className="col-span-5">Barber</div>
                      </div>
                      {selectedNewServices.map((sid) => {
                        const svc = allServices.find((s) => s.id === sid);
                        const a = serviceAssignments[sid] || {};
                        const bid = a.barber_id || selectedNewBarber;
                        const price = a.price != null ? a.price : priceForServiceByBarber(bid, sid);
                        return (
                          <div
                            key={sid}
                            className="grid grid-cols-12 gap-2 items-center px-3 py-2 border-t border-border text-sm"
                            data-testid={`assignment-row-${sid}`}
                          >
                            <div className="col-span-5">
                              <p className="font-medium truncate" data-testid={`assignment-name-${sid}`}>
                                {svc?.service_name || 'Service'}
                              </p>
                              <p className="text-[11px] text-muted-foreground">{svc?.category || ''}</p>
                            </div>
                            <div className="col-span-2 text-right font-bold" style={{ color: '#6C4FE0' }} data-testid={`assignment-price-${sid}`}>
                              ₹{Number(price || 0).toFixed(0)}
                            </div>
                            <div className="col-span-5">
                              <select
                                value={bid || ''}
                                onChange={async (e) => {
                                  const newBid = e.target.value;
                                  await ensureBarberPrices(newBid);
                                  setServiceAssignments((curr) => ({
                                    ...curr,
                                    [sid]: { barber_id: newBid, price: null },
                                  }));
                                }}
                                className="w-full h-8 px-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                                data-testid={`assignment-barber-${sid}`}
                              >
                                {barbers.filter((b) => b.is_active !== false).map((b) => (
                                  <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Bottom summary bar: subtotal, discount %, discount ₹, final, save */}
              <div className="flex-shrink-0 pt-3 mt-2 border-t border-border bg-background">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-xs">
                    Subtotal: <span className="font-semibold text-foreground" data-testid="modify-subtotal">₹{modifySubtotal.toFixed(0)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs whitespace-nowrap">Discount %</Label>
                    <Input
                      type="number"
                      value={orderDiscountPercent}
                      onChange={(e) => {
                        discountSourceRef.current = 'percent';
                        setOrderDiscountPercent(e.target.value);
                      }}
                      className="w-16 h-8 text-sm"
                      min={0}
                      max={100}
                      step="0.5"
                      data-testid="modify-discount-percent"
                    />
                  </div>
                  <div className="text-xs">
                    Off: <span className="font-semibold text-red-500" data-testid="modify-discount-amount">−₹{Math.max(0, modifySubtotal - Number(finalAmount || 0)).toFixed(0)}</span>
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <Label className="text-xs font-semibold whitespace-nowrap">Final ₹</Label>
                    <Input
                      type="number"
                      value={finalAmount}
                      onChange={(e) => {
                        discountSourceRef.current = 'final';
                        setFinalAmount(e.target.value);
                      }}
                      className="w-24 h-8 text-sm font-bold"
                      style={{ color: '#6C4FE0' }}
                      min={0}
                      data-testid="modify-final-amount"
                    />
                  </div>
                  <Button
                    onClick={handleSaveAllModifications}
                    disabled={modifySubtotal === 0}
                    className="h-8 text-sm disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#6C4FE0,#8464F5)', color: '#fff', fontWeight: 700 }}
                    data-testid="modify-save-btn"
                  >
                    <CheckCircle className="w-4 h-4 mr-1.5" />
                    Save
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Payment Confirmation Dialog (when clicking Complete) */}
      <Dialog open={showPaymentConfirmDialog} onOpenChange={setShowPaymentConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CreditCard className="w-5 h-5 text-gold" />
              Confirm Payment to Complete
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Total + Wallet Summary */}
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Bill total</span>
                <span className="text-lg font-bold">₹{completeTokenTotal.toFixed(0)}</span>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5" />
                  Wallet balance
                  {walletInfo?.membership_name && (
                    <span className="ml-1 text-xs px-1.5 py-0.5 rounded"
                      style={{
                        color: walletInfo.color || '#a855f7',
                        backgroundColor: (walletInfo.color || '#a855f7') + '1A',
                      }}>
                      {walletInfo.tier || 'Member'}
                    </span>
                  )}
                </span>
                <span className={`text-base font-bold ${(walletInfo?.wallet_balance || 0) >= completeTokenTotal ? 'text-green-600' : 'text-amber-600'}`}>
                  ₹{Number(walletInfo?.wallet_balance || 0).toFixed(0)}
                </span>
              </div>
              {(walletInfo?.wallet_balance || 0) > 0 && (walletInfo?.wallet_balance || 0) < completeTokenTotal && (
                <p className="text-xs text-amber-600 mt-1.5">
                  Insufficient for full wallet payment — remainder will be split into cash/UPI.
                </p>
              )}
              {!walletInfo?.has_membership && (
                <p className="text-xs text-muted-foreground mt-1.5">Customer has no active wallet.</p>
              )}
            </div>

            {/* Quick modes */}
            <div>
              <Label className="mb-2 block text-sm font-semibold">Quick select</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={`h-9 text-xs ${completePaymentMode === 'cash' ? 'bg-gold/20 border-gold' : ''}`}
                  onClick={() => applyWalletSelection('cash')}
                >
                  <Banknote className="w-3.5 h-3.5 mr-1" />Cash
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`h-9 text-xs ${completePaymentMode === 'upi' ? 'bg-gold/20 border-gold' : ''}`}
                  onClick={() => applyWalletSelection('upi')}
                >
                  <Smartphone className="w-3.5 h-3.5 mr-1" />UPI
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!walletInfo?.has_membership || (walletInfo?.wallet_balance || 0) <= 0}
                  className={`h-9 text-xs ${completeWalletAmount === completeTokenTotal ? 'bg-gold/20 border-gold' : ''}`}
                  onClick={() => applyWalletSelection('wallet_full')}
                >
                  <Wallet className="w-3.5 h-3.5 mr-1" />
                  {(walletInfo?.wallet_balance || 0) >= completeTokenTotal ? 'Full Wallet' : 'Wallet (partial)'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!walletInfo?.has_membership || (walletInfo?.wallet_balance || 0) <= 0}
                  className={`h-9 text-xs ${completePaymentMode === 'split' ? 'bg-gold/20 border-gold' : ''}`}
                  onClick={() => applyWalletSelection('wallet_partial')}
                >
                  Split Wallet + Cash
                </Button>
              </div>
            </div>

            {/* Manual split inputs */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">Wallet (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={completeWalletAmount}
                  max={walletInfo?.wallet_balance || 0}
                  disabled={!walletInfo?.has_membership || (walletInfo?.wallet_balance || 0) <= 0}
                  onChange={(e) => setCompleteWalletAmount(Number(e.target.value) || 0)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Cash (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={completeCashAmount}
                  onChange={(e) => setCompleteCashAmount(Number(e.target.value) || 0)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">UPI (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={completeUpiAmount}
                  onChange={(e) => setCompleteUpiAmount(Number(e.target.value) || 0)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Sum validation */}
            {(() => {
              const sum = Number(completeWalletAmount) + Number(completeCashAmount) + Number(completeUpiAmount);
              const diff = sum - completeTokenTotal;
              if (Math.abs(diff) < 1) {
                return (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Total matches ₹{completeTokenTotal.toFixed(0)}
                  </p>
                );
              }
              return (
                <p className="text-xs text-red-500">
                  {diff > 0 ? `Over by ₹${diff.toFixed(0)}` : `Short by ₹${Math.abs(diff).toFixed(0)}`}
                </p>
              );
            })()}

            <div className="flex gap-2 pt-3 border-t">
              <Button
                onClick={handleConfirmPaymentAndComplete}
                className="flex-1 bg-green-600 text-white hover:bg-green-700 h-9 text-sm"
              >
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Confirm & Complete
              </Button>
              <Button variant="outline" onClick={() => setShowPaymentConfirmDialog(false)} className="h-9 text-sm">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Booking Dialog */}
      <Dialog open={showManualBookingDialog} onOpenChange={setShowManualBookingDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Manual Booking</DialogTitle>
          </DialogHeader>

          {/* Mode Selection */}
          <div className="flex gap-2 mb-4">
            <Button
              onClick={() => setBookingMode('existing')}
              className={bookingMode === 'existing' ? 'bg-gold text-black' : 'bg-muted'}
              variant={bookingMode === 'existing' ? 'default' : 'outline'}
            >
              Select Existing Customer
            </Button>
            <Button
              onClick={() => setBookingMode('adhoc')}
              className={bookingMode === 'adhoc' ? 'bg-gold text-black' : 'bg-muted'}
              variant={bookingMode === 'adhoc' ? 'default' : 'outline'}
            >
              Add New Customer
            </Button>
          </div>

          {/* Customer Selection (Existing Mode) */}
          {bookingMode === 'existing' && (
            <div className="mb-4">
              <Label>Select Customer</Label>
              {/* Search box */}
              <div className="relative mt-2 mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or mobile number..."
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Wallet balance chip for selected customer */}
              {selectedCustomer && (
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gold/15 text-gold border border-gold/30">
                    <Wallet className="w-3.5 h-3.5" />
                    Wallet: ₹{Number(selectedCustomer.wallet_balance || 0).toFixed(0)}
                  </span>
                  {selectedCustomer.membership_name && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground">
                      {selectedCustomer.membership_name}
                    </span>
                  )}
                </div>
              )}

              <div className="max-h-48 overflow-y-auto border rounded-lg">
                {customers.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    No customers found. Switch to "Add New Customer" mode.
                  </p>
                ) : (
                  (() => {
                    const q = customerSearchQuery.trim().toLowerCase();
                    const filtered = q
                      ? customers.filter(c =>
                          (c.name || '').toLowerCase().includes(q) ||
                          (c.phone || '').toLowerCase().includes(q)
                        )
                      : customers;
                    if (filtered.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground p-4 text-center">
                          No customers match "{customerSearchQuery}".
                        </p>
                      );
                    }
                    return filtered.map((customer) => (
                      <div
                        key={customer.phone || customer.name}
                        onClick={() => handleCustomerSelection(customer)}
                        className={`p-3 cursor-pointer hover:bg-muted border-b transition-colors ${
                          manualBookingForm.customer_name === customer.name && manualBookingForm.phone === customer.phone
                            ? 'bg-gold/20 border-gold'
                            : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold truncate">{customer.name}</p>
                            <p className="text-xs text-muted-foreground">{customer.phone || 'No phone'}</p>
                            {customer.gender && (
                              <span className="text-xs px-2 py-0.5 bg-muted rounded mt-1 inline-block">
                                {customer.gender}
                              </span>
                            )}
                          </div>
                          {(customer.wallet_balance ?? 0) > 0 && (
                            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gold/10 text-gold border border-gold/30">
                              <Wallet className="w-3 h-3" />
                              ₹{Number(customer.wallet_balance).toFixed(0)}
                            </span>
                          )}
                        </div>
                      </div>
                    ));
                  })()
                )}
              </div>
            </div>
          )}

          {/* Customer Details (Ad-hoc Mode) */}
          {bookingMode === 'adhoc' && (
            <div className="space-y-3 mb-4">
              <div>
                <Label htmlFor="adhoc-name">Customer Name *</Label>
                <Input
                  id="adhoc-name"
                  value={manualBookingForm.customer_name}
                  onChange={(e) => setManualBookingForm(prev => ({ ...prev, customer_name: e.target.value }))}
                  placeholder="Enter customer name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="adhoc-phone">Mobile Number (Optional)</Label>
                <Input
                  id="adhoc-phone"
                  value={manualBookingForm.phone}
                  onChange={(e) => setManualBookingForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="e.g., +919876543210"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Gender</Label>
                <div className="flex gap-2 mt-2">
                  {['Men', 'Women', 'Kids'].map((gender) => (
                    <button
                      key={gender}
                      onClick={() => setManualBookingForm(prev => ({ ...prev, gender }))}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        manualBookingForm.gender === gender
                          ? 'bg-gold text-black border-gold font-semibold'
                          : 'bg-card border-border hover:bg-muted'
                      }`}
                    >
                      {gender}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Barber Selection */}
          <div className="mb-4">
            <Label>Select Barber</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => setManualBookingForm(prev => ({ ...prev, barber_id: 'any' }))}
                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                  manualBookingForm.barber_id === 'any'
                    ? 'bg-gold text-black border-gold font-semibold'
                    : 'bg-card border-border hover:bg-muted'
                }`}
              >
                Any Available
              </button>
              {barbers.map((barber) => (
                <button
                  key={barber.id}
                  onClick={() => setManualBookingForm(prev => ({ ...prev, barber_id: barber.id }))}
                  className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                    manualBookingForm.barber_id === barber.id
                      ? 'bg-gold text-black border-gold font-semibold'
                      : 'bg-card border-border hover:bg-muted'
                  }`}
                >
                  {barber.name}
                </button>
              ))}
            </div>
          </div>

          {/* Service Selection */}
          <div className="mb-4">
            <Label>Select Services *</Label>
            {allServices.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">Loading services...</p>
            ) : (
              <>
                {/* Category Filter Chips */}
                {(() => {
                  const allCategories = ['All', ...Array.from(new Set(allServices.map(s => s.category || 'General')))];
                  return (
                    <div className="flex gap-2 overflow-x-auto py-2 mt-2 -mx-1 px-1 scrollbar-thin">
                      {allCategories.map(cat => {
                        const isActive = manualSelectedCategory === cat;
                        const count = cat === 'All'
                          ? allServices.length
                          : allServices.filter(s => (s.category || 'General') === cat).length;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setManualSelectedCategory(cat)}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-all whitespace-nowrap ${
                              isActive
                                ? 'bg-gold text-black border-gold shadow-md'
                                : 'bg-background text-foreground border-border hover:border-gold/50'
                            }`}
                          >
                            {cat} <span className={`ml-1 ${isActive ? 'text-black/60' : 'text-muted-foreground'}`}>({count})</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                <div className="max-h-64 overflow-y-auto border rounded-lg mt-2">
                  {(() => {
                    const filtered = manualSelectedCategory === 'All'
                      ? allServices
                      : allServices.filter(s => (s.category || 'General') === manualSelectedCategory);
                    if (filtered.length === 0) {
                      return <p className="text-sm text-muted-foreground p-4 text-center">No services in this category</p>;
                    }
                    return filtered.map((service) => {
                      const isSelected = manualBookingForm.selected_services.includes(service.id);
                      const price = service.base_price ?? service.price ?? 0;
                      const isOnwards = service.price_type === 'onwards';
                      return (
                        <div
                          key={service.id}
                          onClick={() => toggleManualServiceSelection(service.id)}
                          className={`p-3 cursor-pointer hover:bg-muted border-b transition-colors flex items-center justify-between ${
                            isSelected ? 'bg-gold/20 border-gold' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox checked={isSelected} />
                            <div>
                              <p className="font-semibold text-sm">{service.service_name || service.name}</p>
                              <p className="text-xs text-muted-foreground">{service.category || 'General'}</p>
                            </div>
                          </div>
                          <p className="font-bold text-gold whitespace-nowrap">
                            {isOnwards ? '₹' + price + '+' : '₹' + price}
                          </p>
                        </div>
                      );
                    });
                  })()}
                </div>
              </>
            )}
          </div>

          {/* Payment Mode */}
          <div className="mb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label>Payment Mode</Label>
              {walletInfo?.has_membership && (
                <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-500/50 text-emerald-600 bg-emerald-500/5">
                  Wallet available: ₹{Number(walletInfo.wallet_balance || 0).toFixed(0)} · {walletInfo.membership_name}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {['cash', 'upi', 'card', 'wallet', 'pay_later'].map((mode) => {
                const isWallet = mode === 'wallet';
                const walletUsable = !!walletInfo?.has_membership && Number(walletInfo?.wallet_balance || 0) > 0;
                const disabled = isWallet && bookingMode === 'existing' && selectedCustomer && !walletUsable;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => !disabled && setManualBookingForm(prev => ({ ...prev, payment_mode: mode }))}
                    data-testid={`manual-booking-payment-${mode}`}
                    disabled={disabled}
                    className={`px-3 py-2 rounded-lg border text-sm transition-colors capitalize inline-flex items-center gap-1.5 ${
                      manualBookingForm.payment_mode === mode
                        ? 'bg-gold text-black border-gold font-semibold'
                        : disabled
                          ? 'bg-muted/40 border-border text-muted-foreground cursor-not-allowed opacity-60'
                          : 'bg-card border-border hover:bg-muted'
                    }`}
                    title={disabled ? 'Customer has no active membership wallet' : ''}
                  >
                    {isWallet && <Wallet className="w-4 h-4" />}
                    {mode === 'pay_later'
                      ? 'Pay Later at Salon'
                      : isWallet
                        ? (walletUsable ? `Wallet · ₹${Number(walletInfo.wallet_balance).toFixed(0)}` : 'Wallet (Membership)')
                        : mode.toUpperCase()}
                  </button>
                );
              })}
            </div>
            {manualBookingForm.payment_mode === 'wallet' && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
                ⓘ Customer must have an active membership wallet with sufficient balance. Amount will be auto-deducted.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4 border-t">
            <Button
              onClick={handleManualBooking}
              className="flex-1 bg-gold text-black hover:bg-gold/90"
              disabled={!manualBookingForm.customer_name || manualBookingForm.selected_services.length === 0}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Booking
            </Button>
            <Button
              onClick={() => setShowManualBookingDialog(false)}
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </HomeV2Shell>
    )}
    <SubscriptionPaywallModal />
    </SubscriptionProvider>
  );
}


// Salon Notifications Panel Component
function SalonNotificationsPanel({ salonId, onCountUpdate, onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, [salonId]);

  const fetchNotifications = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/notifications/salon/${salonId}`);
      setNotifications(response.data.notifications || []);
      const unread = (response.data.notifications || []).filter(n => !n.is_read).length;
      if (onCountUpdate) onCountUpdate(unread);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notifId) => {
    try {
      await axios.put(`${BACKEND_URL}/api/notifications/${notifId}/read`);
      fetchNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllRead = async () => {
    try {
      await axios.put(`${BACKEND_URL}/api/notifications/salon/${salonId}/read-all`);
      fetchNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  // Determine which tab to navigate to based on notification type
  const getTargetTab = (type) => {
    switch (type) {
      case 'new_booking':
      case 'booking_cancelled':
      case 'booking_completed':
      case 'booking_rescheduled':
      case 'token_called':
        return 'home'; // queue / dashboard with active bookings
      case 'membership_pending':
      case 'membership_purchase':
      case 'membership_confirmed':
        return 'services'; // memberships live under services/offerings
      case 'review_added':
        return 'analytics'; // reviews/analytics tab
      default:
        return null;
    }
  };

  const handleNotifClick = (notif) => {
    if (!notif.is_read) markAsRead(notif.id);
    const target = getTargetTab(notif.type);
    if (target && onNavigate) onNavigate(target);
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'payment_confirmed': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'membership_pending': return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'membership_confirmed': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'new_booking': return <Calendar className="w-5 h-5 text-blue-500" />;
      case 'booking_cancelled': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'booking_completed': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'review_added': return <TrendingUp className="w-5 h-5 text-gold" />;
      default: return <Bell className="w-5 h-5 text-blue-500" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <p className="text-muted-foreground">Loading notifications...</p>
      </div>
    );
  }

  return (
    <div className="bg-card/50 backdrop-blur-sm border border-gold/20 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-playfair font-bold text-foreground flex items-center gap-3">
          <Bell className="w-6 h-6 text-gold" />
          Notifications
        </h2>
        {notifications.some(n => !n.is_read) && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="text-xs">
            Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-30" />
          <p className="text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => handleNotifClick(notif)}
              className={`p-4 rounded-lg border transition-all cursor-pointer ${
                notif.is_read
                  ? 'bg-muted/30 border-border hover:bg-muted/50'
                  : 'bg-gold/5 border-gold/30 hover:bg-gold/10'
              }`}
            >
              <div className="flex items-start gap-3">
                {getTypeIcon(notif.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className={`text-sm font-semibold ${notif.is_read ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {notif.title}
                    </h4>
                    {!notif.is_read && (
                      <span className="w-2 h-2 bg-gold rounded-full flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{notif.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {new Date(notif.created_at).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
