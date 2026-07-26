import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import CustomerBookingStatus from '@/components/CustomerBookingStatus';
import CustomerOtpVerification from '@/components/CustomerOtpVerification';
import {
  Scissors, Calendar, User, MapPin, Star, Clock,
  ArrowLeft, Users, CheckCircle, AlertCircle, ChevronRight, X, Wallet, History,
  ChevronDown, Quote, Phone, Share2, Sparkles, TrendingUp, Package as PackageIcon, Flame, Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Footer from '@/components/Footer';

// Import tab components
import SalonServicesTab from './salon-tabs/SalonServicesTab';
import SalonBarbersTab from './salon-tabs/SalonBarbersTab';
import SalonShopTab from './salon-tabs/SalonShopTab';
import SalonGalleryTab from './salon-tabs/SalonGalleryTab';
import SalonProfileTab from './salon-tabs/SalonProfileTab';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABEL = { sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat' };

export default function SalonMainPage() {
  const { salonId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isUserLoggedIn, user } = useAuth();
  
  // Phase 3: branch the customer is currently viewing/booking at.
  // Comes from `?branch=` in the URL (set by the Find-a-salon flow / QR code).
  // Falls back to the salon's main branch on first load.
  const branchIdFromUrl = searchParams.get('branch') || '';
  const [branchId, setBranchId] = useState(branchIdFromUrl);
  const [branch, setBranch] = useState(null);
  const [salon, setSalon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liveStatus, setLiveStatus] = useState(null);
  const [userBookings, setUserBookings] = useState([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'dashboard');
  const [showLiveQueue, setShowLiveQueue] = useState(false);

  // New: data for scrollable home
  const [branches, setBranches] = useState([]);
  const [services, setServices] = useState([]);
  const [allBarbers, setAllBarbers] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [packages, setPackages] = useState([]);
  const [membershipPlans, setMembershipPlans] = useState([]);
  const [buyingPlanId, setBuyingPlanId] = useState(null);

  const buyMembership = async (plan) => {
    if (!isUserLoggedIn || !user?.phone) {
      toast.info('Please log in to buy a membership');
      navigate(`/user/login?redirect=/salon/${salonId}`);
      return;
    }
    setBuyingPlanId(plan.id);
    try {
      await axios.post(`${API}/salons/${salonId}/customers/${user.phone}/buy-membership`, {
        membership_plan_id: plan.id,
        customer_name: user.name || user.full_name || 'Customer',
        customer_phone: user.phone,
        payment_mode: 'pay_at_salon',
        paid_amount: plan.amount,
      });
      toast.success(`${plan.name} requested! Pay ₹${Math.round(plan.amount)} at the salon — ₹${Math.round(plan.credit)} credit is added once they confirm.`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not submit membership purchase');
    } finally {
      setBuyingPlanId(null);
    }
  };
  const [shiftWindows, setShiftWindows] = useState([]);
  // A1: Most booked service IDs (computed from completed bookings count, frontend-fallback to is_favorite)
  const [mostBookedIds, setMostBookedIds] = useState([]);

  // Keep activeTab synced with ?tab= URL param
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tab !== activeTab) setActiveTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    fetchSalonData();
    fetchLiveStatus();
    if (isUserLoggedIn) {
      fetchUserBookings();
      fetchWalletBalance();
    }

    const interval = setInterval(() => {
      fetchLiveStatus();
      if (isUserLoggedIn) {
        fetchUserBookings();
        fetchWalletBalance();
      }
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoggedIn, salonId]);

  // Listen for tab change events from hamburger menu
  useEffect(() => {
    const handleTabChange = (event) => {
      const tabId = event.detail;
      if (tabId) {
        setActiveTab(tabId);
      }
    };

    window.addEventListener('setTab', handleTabChange);
    return () => window.removeEventListener('setTab', handleTabChange);
  }, []);

  const fetchSalonData = async () => {
    try {
      const response = await axios.get(`${API}/salons/${salonId}`);
      setSalon(response.data);

      // Resolve the branch:
      //  - if branch_id was in URL, fetch its detail
      //  - else fetch the salon's branches and pick the main one
      try {
        const bRes = await axios.get(`${API}/public/salons/${salonId}/branches`);
        const branchList = Array.isArray(bRes.data) ? bRes.data : [];
        setBranches(branchList);
        let chosen = branchList.find(b => b.id === branchIdFromUrl);
        if (!chosen) chosen = branchList.find(b => b.is_main_branch) || branchList[0] || null;
        if (chosen) {
          setBranch(chosen);
          setBranchId(chosen.id);
        }
      } catch (e) {
        console.error('Failed to load branches', e);
      }

      // Fetch services, barbers, reviews, packages, shift-windows in parallel for the scrollable home
      Promise.allSettled([
        axios.get(`${API}/salons/${salonId}/services/enabled`),
        axios.get(`${API}/salons/${salonId}/barbers`),
        axios.get(`${API}/salons/${salonId}/ratings?limit=10`),
        axios.get(`${API}/salons/${salonId}/packages/with-services`),
        axios.get(`${API}/salons/${salonId}/shift-windows`),
        axios.get(`${API}/salons/${salonId}/membership-plans`),
      ]).then(([sv, br, rv, pk, sw, mp]) => {
        if (sv.status === 'fulfilled') {
          const list = Array.isArray(sv.value.data) ? sv.value.data : (sv.value.data?.services || []);
          setServices(list);
          // Most booked: prefer is_favorite=true; fall back to first 2 services
          const favs = list.filter(s => s.is_favorite).map(s => s.id);
          if (favs.length >= 2) {
            setMostBookedIds(favs.slice(0, 3));
          } else if (list.length > 0) {
            setMostBookedIds(list.slice(0, Math.min(2, list.length)).map(s => s.id));
          }
        }
        if (br.status === 'fulfilled') {
          setAllBarbers(Array.isArray(br.value.data) ? br.value.data : []);
        }
        if (rv.status === 'fulfilled') {
          const rvs = rv.value.data?.reviews || [];
          setReviews(rvs.filter(r => r.review && r.review.trim().length > 0));
          setReviewsTotal(rv.value.data?.total_reviews || 0);
        }
        if (pk.status === 'fulfilled') {
          const pkgs = Array.isArray(pk.value.data?.packages) ? pk.value.data.packages : [];
          setPackages(pkgs.filter(p => p.is_active !== false));
        }
        if (sw.status === 'fulfilled') {
          const shifts = Array.isArray(sw.value.data?.shifts) ? sw.value.data.shifts : (Array.isArray(sw.value.data) ? sw.value.data : []);
          setShiftWindows(shifts);
        }
        if (mp.status === 'fulfilled') {
          const plans = Array.isArray(mp.value.data?.plans) ? mp.value.data.plans : [];
          setMembershipPlans(plans.filter(p => p.is_active !== false));
        }
      });
    } catch (error) {
      console.error('Error fetching salon:', error);
      toast.error('Failed to load salon information');
      navigate('/salons');
    } finally {
      setLoading(false);
    }
  };

  // Branch switch — updates URL (?branch=...) so deep links remain shareable
  const handleSwitchBranch = (newBranch) => {
    if (!newBranch || newBranch.id === branchId) {
      setShowBranchDropdown(false);
      return;
    }
    setBranch(newBranch);
    setBranchId(newBranch.id);
    setShowBranchDropdown(false);
    const next = new URLSearchParams(searchParams);
    next.set('branch', newBranch.id);
    setSearchParams(next, { replace: true });
    // refresh live status & wallet for the new branch
    setTimeout(() => {
      fetchLiveStatus();
      fetchWalletBalance();
    }, 100);
  };

  // Compute today's open/close window from operational_hours
  const todayHours = useMemo(() => {
    if (!salon?.operational_hours) return null;
    const today = DAYS[new Date().getDay()];
    const day = salon.operational_hours[today];
    if (!day || day.is_holiday) return { closed: true };
    return { open: day.opening_time || '09:00', close: day.closing_time || '20:00', closed: false };
  }, [salon]);

  const isOpen = useMemo(() => {
    if (salon?.manual_toggle?.is_overridden) return salon.manual_toggle.is_open;
    if (!todayHours || todayHours.closed) return false;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [oh, om] = (todayHours.open || '09:00').split(':').map(Number);
    const [ch, cm] = (todayHours.close || '20:00').split(':').map(Number);
    return cur >= oh * 60 + om && cur <= ch * 60 + cm;
  }, [salon, todayHours]);

  const fetchLiveStatus = async () => {
    try {
      const params = branchId ? `?branch_id=${branchId}` : '';
      const response = await axios.get(`${API}/salons/${salonId}/live-status${params}`);
      setLiveStatus(response.data);
    } catch (error) {
      console.error('Error fetching live status:', error);
    }
  };

  const fetchUserBookings = async () => {
    if (!user?.id) return;
    try {
      const response = await axios.get(`${API}/user/${user.id}/history`);
      const activeStatuses = ['waiting', 'called', 'in_progress', 'in_service'];
      const todayBookings = response.data.filter(b =>
        b.salon_id === salonId && activeStatuses.includes(b.status)
      );
      // Enrich each active booking with live queue status (barber-wise position,
      // people before, estimated wait, currently serving for THIS barber).
      const enriched = await Promise.all(todayBookings.map(async (b) => {
        try {
          const r = await axios.get(`${API}/tokens/${b.id}/queue-status`);
          return { ...b, queue: r.data };
        } catch (e) {
          return b;
        }
      }));
      setUserBookings(enriched);
    } catch (error) {
      console.error('Error fetching user bookings:', error);
    }
  };

  const fetchWalletBalance = async () => {
    if (!user?.phone) return;
    try {
      const phone = user.phone.replace('+91', '');
      const response = await axios.get(`${API}/salons/${salonId}/customers/${phone}/wallet`);
      setWalletBalance(response.data.wallet_balance || 0);
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'waiting':
        return <Clock className="w-5 h-5 text-brass" strokeWidth={1.6} />;
      case 'called':
        return <AlertCircle className="w-5 h-5 text-brass animate-pulse" strokeWidth={1.6} />;
      case 'in_progress':
        return <Scissors className="w-5 h-5 text-sage animate-spin" strokeWidth={1.6} />;
      default:
        return <CheckCircle className="w-5 h-5 text-sage" strokeWidth={1.6} />;
    }
  };

  const getStatusMessage = (booking) => {
    const q = booking.queue;
    if (q?.status_message) return q.status_message;
    switch (booking.status) {
      case 'waiting': {
        const before = q?.people_before ?? 0;
        if (before === 0) return "You're next!";
        return `${before} customer${before === 1 ? '' : 's'} before you`;
      }
      case 'called':
        return `Your turn! Please proceed to ${booking.barber_name}`;
      case 'in_progress':
      case 'in_service':
        return `In progress with ${booking.barber_name}`;
      default:
        return 'Booking active';
    }
  };

  const formatWait = (mins) => {
    if (mins == null) return null;
    if (mins <= 0) return 'Next!';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Scissors className="w-12 h-12 text-brass animate-spin mx-auto mb-4" strokeWidth={1.4} />
          <p className="eyebrow">Loading salon</p>
        </div>
      </div>
    );
  }

  if (!salon) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground">Salon not found</p>
          <Button onClick={() => navigate('/salons')} className="mt-4">
            Back to Salons
          </Button>
        </div>
      </div>
    );
  }

  // Render tab content based on activeTab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'services':
        return <SalonServicesTab salonId={salonId} branchId={branchId} initialCategory={searchParams.get('category') || 'all'} />;
      case 'barbers':
        return <SalonBarbersTab salonId={salonId} branchId={branchId} />;
      case 'shop':
        return <SalonShopTab salonId={salonId} branchId={branchId} />;
      case 'gallery':
        return <SalonGalleryTab salon={salon} />;
      case 'profile':
        return <SalonProfileTab salon={salon} />;
      default:
        return renderDashboard();
    }
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Active Booking Status — barber-specific live queue */}
      {userBookings.length > 0 && (
        <div className="space-y-3">
          {userBookings.map((booking) => {
            const q = booking.queue || {};
            const peopleBefore = q.people_before ?? 0;
            const position = q.position ?? (peopleBefore + 1);
            const waitMin = q.estimated_wait_minutes;
            const serving = q.currently_serving;
            return (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-5 rounded-2xl border ${
                  booking.status === 'called' || booking.status === 'in_progress' || booking.status === 'in_service'
                    ? 'bg-card border-sage/40 brass-glow-pulse'
                    : 'lux-card bg-card'
                }`}
                data-testid={`active-booking-${booking.id}`}
              >
                {/* Header: status + total token */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(booking.status)}
                    <div>
                      <p className="font-fraunces text-lg text-foreground font-medium leading-tight">{getStatusMessage(booking)}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Stylist: <span className="font-medium text-foreground">{booking.barber_name}</span>
                        {' '}· {booking.shift}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="eyebrow">Token</p>
                    <p className="text-3xl font-bebas brass-text leading-none mt-1">{booking.token_number}</p>
                  </div>
                </div>

                {/* Key metrics — position / people before / wait */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="bg-muted/40 rounded-xl p-3 border border-border/60 text-center">
                    <p className="eyebrow">Your position</p>
                    <p className="text-xl font-bebas text-brass mt-1">#{position}</p>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3 border border-border/60 text-center">
                    <p className="eyebrow">Before you</p>
                    <p className="text-xl font-bebas text-foreground mt-1">{peopleBefore}</p>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3 border border-border/60 text-center">
                    <p className="eyebrow">Est. wait</p>
                    <p className="text-xl font-bebas text-foreground mt-1">
                      {formatWait(waitMin) ?? '—'}
                    </p>
                  </div>
                </div>

                {/* Currently serving for THIS barber (not salon-wide) */}
                {serving && serving.token_number && (
                  <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      <span className="uppercase tracking-wider text-[10px] block">
                        Currently with {booking.barber_name}
                      </span>
                      <span className="font-bold text-foreground">Token {serving.token_number}</span>
                      {Array.isArray(serving.services) && serving.services.length > 0 && (
                        <span className="text-xs"> • {serving.services.join(', ')}</span>
                      )}
                    </p>
                    {q.approx_finish_minutes != null && (
                      <div className="text-right">
                        <p className="text-[10px] uppercase text-muted-foreground">Finish in</p>
                        <p className="text-sm font-bold text-foreground">{formatWait(q.approx_finish_minutes)}</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* OTP Verification Banner */}
      <CustomerOtpVerification showAs="banner" />

      {/* === A1: HERO WAIT STRIP — shortest queue + per-shift breakdown === */}
      {(() => {
        const barberQueues = Array.isArray(liveStatus?.barbers) ? liveStatus.barbers : [];
        const activeBarbers = barberQueues.filter(b => (b.queue_status || 'available') !== 'inactive');
        // Shortest queue across active barbers
        const minWaiting = activeBarbers.length > 0
          ? Math.min(...activeBarbers.map(b => b.waiting_count || 0))
          : 0;
        const shortestWaitMin = minWaiting * 20; // ~20 min per token (matches existing live queue calc)
        const shortestBarber = activeBarbers.find(b => (b.waiting_count || 0) === minWaiting);

        // Per-shift estimated wait — group bookings by shift if data is available;
        // since live-status doesn't expose shift-wise counts, we approximate using
        // shift duration vs current waiting and show shift availability.
        const nowH = new Date().getHours();
        const shiftCards = (shiftWindows || []).map(s => {
          const isCurrent = s.start != null && s.end != null && nowH >= s.start && nowH < s.end;
          const isPast = s.end != null && nowH >= s.end;
          // For current shift, show shortestWaitMin; for upcoming shifts, show "Open"
          let label;
          if (!s.is_available) label = 'Closed';
          else if (isPast) label = 'Closed';
          else if (isCurrent) label = shortestWaitMin > 0 ? `~${shortestWaitMin} min` : 'No wait';
          else label = 'Open';
          return { ...s, isCurrent, isPast, label };
        });

        return (
          <section
            className="relative overflow-hidden rounded-3xl border border-brass/20 hero-wash bg-grain"
            data-testid="hero-wait-strip"
          >
            <div className="relative p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-5 sm:gap-7 items-center">
              {/* Left — single shortest wait number */}
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-brass-soft border border-brass/40 flex items-center justify-center flex-shrink-0 brass-glow-pulse">
                  {shortestWaitMin > 0
                    ? <Clock className="w-6 h-6 text-brass" strokeWidth={1.6} />
                    : <Sparkles className="w-6 h-6 text-brass" strokeWidth={1.6} />}
                </div>
                <div className="min-w-0">
                  <span className="eyebrow-brass">Shortest queue right now</span>
                  <p className="font-fraunces text-3xl sm:text-4xl font-medium leading-none mt-1">
                    {!isOpen
                      ? <span className="brass-text">Closed</span>
                      : activeBarbers.length === 0
                        ? <span className="brass-text">No stylists yet</span>
                        : shortestWaitMin > 0
                          ? <><span className="brass-text">~{shortestWaitMin}</span> <span className="text-2xl text-muted-foreground font-normal">min wait</span></>
                          : <span className="brass-text">Walk-in welcome</span>}
                  </p>
                  {isOpen && shortestBarber && shortestWaitMin > 0 && (
                    <p className="text-xs text-muted-foreground mt-1.5 truncate">
                      with <span className="text-foreground font-medium">{shortestBarber.barber_name}</span>
                    </p>
                  )}
                  {isOpen && shortestWaitMin === 0 && activeBarbers.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1.5">All chairs available now</p>
                  )}
                </div>
              </div>

              {/* Right — per-shift tiles */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full">
                {shiftCards.length === 0
                  ? Array(3).fill(0).map((_, i) => (
                      <div key={`shift-skel-${i}`} className="rounded-xl bg-card/50 border border-border/40 p-2.5 text-center opacity-50">
                        <div className="eyebrow text-[10px]">—</div>
                        <div className="text-sm font-medium text-muted-foreground mt-1">—</div>
                      </div>
                    ))
                  : shiftCards.map((s) => (
                      <div
                        key={s.id}
                        className={`rounded-xl p-2.5 text-center border transition-colors ${
                          s.isCurrent
                            ? 'bg-brass text-espresso border-brass shadow-lux'
                            : s.isPast
                              ? 'bg-muted/30 border-border/40 text-muted-foreground/60'
                              : 'bg-card border-border text-foreground'
                        }`}
                        data-testid={`hero-shift-${s.id?.toLowerCase()}`}
                      >
                        <div className={`eyebrow text-[10px] ${s.isCurrent ? 'text-espresso/80' : ''}`}>
                          {s.name}
                        </div>
                        <div className={`text-xs font-medium mt-1 leading-tight ${s.isCurrent ? '' : ''}`}>
                          {s.time || '—'}
                        </div>
                        <div className={`text-[11px] mt-1 font-semibold ${s.isCurrent ? 'text-espresso' : s.isPast ? 'opacity-60' : 'text-brass'}`}>
                          {s.label}
                        </div>
                      </div>
                    ))}
              </div>
            </div>
          </section>
        );
      })()}

      {/* === A1/A4: WALLET BALANCE BANNER (logged-in only, > 0) === */}
      {isUserLoggedIn && walletBalance > 0 && (
        <button
          onClick={() => navigate(`/salon/${salonId}/wallet`)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-brass/30 hover:border-brass/60 transition-colors text-left"
          data-testid="home-wallet-banner"
        >
          <div className="w-10 h-10 rounded-full bg-brass-soft border border-brass/30 flex items-center justify-center flex-shrink-0">
            <Wallet className="w-4 h-4 text-brass" strokeWidth={1.7} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">
              You have <span className="font-bebas brass-text text-lg leading-none">₹{walletBalance.toFixed(0)}</span> in your wallet
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Apply at checkout for instant savings</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.7} />
        </button>
      )}

      {/* === SALON IDENTITY (luzo-style: big name → tagline → action chips → gallery) === */}
      <section className="space-y-5" data-testid="salon-identity">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-fraunces text-[36px] sm:text-[48px] lg:text-[56px] leading-[1.02] font-medium tracking-tight">
              {salon.salon_name}
              {branch && !branch.is_main_branch && (
                <span className="block text-2xl sm:text-3xl font-normal text-brass serif-italic mt-1">{branch.branch_name}</span>
              )}
            </h1>
            <div className="mt-3 flex items-center gap-2 text-[15px] text-muted-foreground flex-wrap">
              <span>{(branch && branch.address) ? branch.address.split(',').slice(0, 2).join(', ') : (salon.address?.split(',').slice(0, 2).join(', ') || '')}</span>
              <span className="opacity-50">•</span>
              <span>{salon.gender_tag || 'Unisex'}</span>
              <span className="opacity-50">|</span>
              <span className="font-semibold text-foreground">₹₹</span>
              {branches.length > 1 && (
                <>
                  <span className="opacity-50">•</span>
                  <button
                    onClick={() => setShowBranchDropdown(true)}
                    className="text-brass hover:underline font-medium"
                    data-testid="view-branches-link"
                  >
                    View Branches ({branches.length})
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Share button (top-right of header) */}
          <button
            onClick={async () => {
              const url = window.location.href;
              try {
                if (navigator.share) {
                  await navigator.share({ title: salon.salon_name, url });
                } else {
                  await navigator.clipboard.writeText(url);
                  toast.success('Link copied to clipboard');
                }
              } catch { /* user cancelled */ }
            }}
            className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-border bg-card hover:border-brass/60 transition-colors flex-shrink-0"
            aria-label="Share"
            data-testid="salon-share-btn"
          >
            <Share2 className="w-4 h-4 text-foreground" strokeWidth={1.6} />
          </button>
        </div>

        {/* Action chips row — Open Now / Get Directions / Contact */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm ${
              isOpen
                ? 'bg-card border-border text-foreground'
                : 'bg-card border-border text-foreground'
            }`}
            data-testid="salon-status-chip"
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOpen ? 'bg-sage' : 'bg-[color:var(--status-closed,_#A85D52)]'}`} />
            <span className="font-medium">
              {isOpen ? 'Open Now' : 'Closed Now'}
            </span>
            {todayHours && !todayHours.closed && (
              <>
                <span className="opacity-40">|</span>
                <span className="text-muted-foreground">{todayHours.open} – {todayHours.close}</span>
              </>
            )}
          </span>

          {salon.latitude && salon.longitude && (
            <a
              href={`https://www.google.com/maps?q=${salon.latitude},${salon.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card hover:border-brass/60 transition-colors text-sm text-foreground"
              data-testid="salon-directions-chip"
            >
              <MapPin className="w-3.5 h-3.5 text-brass" strokeWidth={1.7} />
              <span className="font-medium">Get Directions</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.7} />
            </a>
          )}

          {salon.phone && (
            <a
              href={`tel:${salon.phone}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card hover:border-brass/60 transition-colors text-sm text-foreground"
              data-testid="salon-contact-chip"
            >
              <Phone className="w-3.5 h-3.5 text-brass" strokeWidth={1.7} />
              <span className="font-medium">Contact</span>
            </a>
          )}

          {salon.rating > 0 && salon.total_reviews > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm">
              <Star className="w-3.5 h-3.5 text-brass fill-brass" />
              <span className="font-semibold">{salon.rating}</span>
              <span className="text-muted-foreground">· {salon.total_reviews} reviews</span>
            </span>
          )}
        </div>
      </section>

      {/* === HERO GALLERY (1 large left + 2 thumbs right) === */}
      {(() => {
        const photos = (salon.photo_gallery && salon.photo_gallery.length)
          ? salon.photo_gallery.slice(0, 5)
          : (salon.logo_url ? [salon.logo_url] : []);
        const main = photos[0];
        const thumbs = photos.slice(1, 3);
        if (!main) return null;
        return (
          <section className="rise-in" data-testid="salon-hero-gallery">
            <div className="grid grid-cols-3 gap-3 h-72 sm:h-96">
              <div className={`${thumbs.length > 0 ? 'col-span-2' : 'col-span-3'} relative rounded-3xl overflow-hidden bg-muted shadow-lux`}>
                <img src={main} alt={salon.salon_name} className="w-full h-full object-cover" />
                {salon.photo_gallery?.length > 0 && (
                  <button
                    onClick={() => setActiveTab('gallery')}
                    className="absolute bottom-4 right-4 glass-warm text-foreground text-xs px-4 py-2 rounded-full inline-flex items-center gap-1.5 hover:bg-card transition-colors"
                    data-testid="hero-view-photos-btn"
                  >
                    <span>View all photos</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              {thumbs.length > 0 && (
                <div className="col-span-1 grid grid-rows-2 gap-3 h-full">
                  {thumbs.map((src, i) => (
                    <div key={`${src}-${i}`} className="relative rounded-3xl overflow-hidden bg-muted shadow-lux">
                      <img src={src} alt={`${salon.salon_name} ${i + 2}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* === SERVICES (luzo-style: image-first square cards, name below) === */}
      <section className="space-y-5 pt-2" data-testid="salon-services-section">
        <header className="flex items-end justify-between">
          <h2 className="font-fraunces text-3xl sm:text-4xl font-medium leading-none">Services</h2>
          {services.length > 0 && (
            <button
              onClick={() => setActiveTab('services')}
              className="text-sm text-brass hover:underline inline-flex items-center gap-1"
              data-testid="services-view-all-btn"
            >
              View all <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </header>

        {(() => {
          // Group services by category — luzo shows categories as the primary tile.
          // Thumbnail rules (matches the salon-side SalonServicesTab fallback chain):
          //   thumbnail_url → image_url → images[0]
          // First service in the category that has ANY of these wins.
          const pickImage = (sv) =>
            sv.thumbnail_url ||
            sv.image_url ||
            (Array.isArray(sv.images) && sv.images.length > 0 ? sv.images[0] : null) ||
            null;
          const categoryMap = new Map();
          services.forEach(sv => {
            const cat = sv.category || 'General';
            if (!categoryMap.has(cat)) {
              categoryMap.set(cat, { name: cat, image: pickImage(sv), count: 0, hasMostBooked: false });
            }
            const entry = categoryMap.get(cat);
            entry.count += 1;
            if (!entry.image) {
              const img = pickImage(sv);
              if (img) entry.image = img;
            }
            if (mostBookedIds.includes(sv.id)) entry.hasMostBooked = true;
          });
          const categories = Array.from(categoryMap.values());

          if (categories.length === 0) {
            return (
              <div className="lux-card rounded-2xl p-10 text-center text-muted-foreground text-sm">
                No services listed yet.
              </div>
            );
          }

          // Soft pastel placeholder colors that adapt to theme via brass-soft-ish tints
          const placeholderTints = [
            'bg-[rgb(var(--brass-rgb)/0.10)]',
            'bg-[rgb(var(--bronze-rgb)/0.10)]',
            'bg-[rgb(var(--sage-rgb)/0.10)]',
            'bg-[rgb(var(--brass-rgb)/0.14)]',
          ];

          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {categories.map((cat, idx) => (
                <button
                  key={cat.name}
                  onClick={() => navigate(`/salon/${salonId}?tab=services&category=${encodeURIComponent(cat.name)}${branchId ? `&branch=${branchId}` : ''}`)}
                  className="group flex flex-col items-center text-center"
                  data-testid={`service-category-${cat.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`}
                >
                  <div className={`relative w-full aspect-square rounded-3xl overflow-hidden ring-1 ring-border ${!cat.image ? placeholderTints[idx % placeholderTints.length] : 'bg-muted'} group-hover:ring-brass/60 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-lux flex items-center justify-center`}>
                    {cat.image ? (
                      <img
                        src={cat.image}
                        alt={cat.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <Scissors className="w-9 h-9 text-brass/70" strokeWidth={1.4} />
                    )}
                    {cat.hasMostBooked && (
                      <span
                        className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brass text-espresso text-[9px] font-semibold uppercase tracking-wider shadow-lux"
                        data-testid={`most-booked-badge-${cat.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`}
                      >
                        <Flame className="w-2.5 h-2.5" strokeWidth={2.2} />
                        Most booked
                      </span>
                    )}
                    <span className="absolute bottom-2 right-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-medium">
                      {cat.count}
                    </span>
                  </div>
                  <p className="mt-3.5 font-medium text-[15px] text-foreground leading-snug px-1">
                    {cat.name}
                  </p>
                </button>
              ))}
            </div>
          );
        })()}
      </section>

      {/* === STYLISTS (chips) === */}
      <section className="space-y-4" data-testid="salon-stylists-section">
        <header className="flex items-end justify-between">
          <div>
            <span className="eyebrow-brass">In the chair</span>
            <h2 className="font-fraunces text-2xl font-medium mt-1 leading-none">Our Stylists</h2>
          </div>
          <button
            onClick={() => setActiveTab('barbers')}
            className="text-sm text-brass hover:underline inline-flex items-center gap-1"
            data-testid="stylists-view-all-btn"
          >
            View all <ChevronRight className="w-4 h-4" />
          </button>
        </header>

        {allBarbers.length === 0 ? (
          <div className="lux-card rounded-2xl p-8 text-center text-muted-foreground text-sm">
            No stylists listed yet.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {allBarbers.map((b) => (
              <button
                key={b.id}
                onClick={() => navigate(`/salon/${salonId}/barber/${b.id}`)}
                className="group inline-flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-full bg-card border border-border hover:border-brass/60 transition-colors"
                data-testid={`stylist-chip-${b.id}`}
              >
                <span className="w-7 h-7 rounded-full overflow-hidden ring-1 ring-border flex-shrink-0 bg-muted flex items-center justify-center">
                  {(b.profile_image || b.image_url || b.photo_url) ? (
                    <img src={b.profile_image || b.image_url || b.photo_url} alt={b.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-brass" strokeWidth={1.6} />
                  )}
                </span>
                <span className="text-sm font-medium text-foreground">{b.name}</span>
                {b.rating > 0 && (
                  <span className="text-[11px] text-brass inline-flex items-center gap-0.5">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    {b.rating}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* === A1: OFFERS & PACKAGES (horizontal scroll) === */}
      {packages.length > 0 && (
        <section className="space-y-4" data-testid="salon-packages-section">
          <header className="flex items-end justify-between">
            <div>
              <span className="eyebrow-brass">Curated bundles</span>
              <h2 className="font-fraunces text-2xl font-medium mt-1 leading-none">Offers & Packages</h2>
            </div>
            <button
              onClick={() => navigate(`/book/${salonId}${branchId ? `?branch=${branchId}` : ''}`)}
              className="text-sm text-brass hover:underline inline-flex items-center gap-1"
              data-testid="packages-view-all-btn"
            >
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </header>

          <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto pb-2 scrollbar-thin">
            <div className="flex gap-4 snap-x snap-mandatory">
              {packages.map((pkg, idx) => {
                const sumServicePrice = (pkg.services || []).reduce((acc, s) => acc + (s.base_price || 0), 0);
                const totalPrice = pkg.total_price || sumServicePrice;
                const savings = sumServicePrice > totalPrice ? sumServicePrice - totalPrice : 0;
                const totalDuration = (pkg.services || []).reduce((acc, s) => acc + (s.default_duration || 0), 0);
                const cover = pkg.image_url
                  || (pkg.services || []).find(s => s.thumbnail_url || s.image_url || (Array.isArray(s.images) && s.images[0]))?.thumbnail_url
                  || (pkg.services || []).find(s => s.image_url || (Array.isArray(s.images) && s.images[0]))?.image_url
                  || (pkg.services || []).map(s => Array.isArray(s.images) ? s.images[0] : null).find(Boolean)
                  || null;
                return (
                  <button
                    key={pkg.id || idx}
                    onClick={() => navigate(`/book/${salonId}?package=${pkg.id}${branchId ? `&branch=${branchId}` : ''}`)}
                    className="snap-start flex-shrink-0 w-[280px] sm:w-[320px] lux-card rounded-3xl bg-card border border-border hover:border-brass/60 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lux text-left"
                    data-testid={`package-card-${pkg.id}`}
                  >
                    <div className="relative h-36 bg-muted overflow-hidden">
                      {cover ? (
                        <img src={cover} alt={pkg.package_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[rgb(var(--brass-rgb)/0.10)]">
                          <PackageIcon className="w-10 h-10 text-brass/70" strokeWidth={1.4} />
                        </div>
                      )}
                      {savings > 0 && (
                        <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sage text-white text-[10px] font-semibold uppercase tracking-wider shadow-lux">
                          <TrendingUp className="w-3 h-3" strokeWidth={2} /> Save ₹{Math.round(savings)}
                        </span>
                      )}
                      <span className="absolute bottom-3 right-3 inline-flex items-center px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-medium">
                        {(pkg.services || []).length} services
                      </span>
                    </div>
                    <div className="p-4">
                      <h3 className="font-fraunces text-lg font-medium text-foreground leading-tight line-clamp-1">
                        {pkg.package_name}
                      </h3>
                      {pkg.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pkg.description}</p>
                      )}
                      <div className="mt-3 flex items-end justify-between gap-2">
                        <div>
                          <p className="font-bebas text-2xl brass-text leading-none">₹{Math.round(totalPrice)}</p>
                          {sumServicePrice > totalPrice && (
                            <p className="text-[11px] text-muted-foreground line-through mt-0.5">₹{Math.round(sumServicePrice)}</p>
                          )}
                        </div>
                        {totalDuration > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" strokeWidth={1.7} />
                            {totalDuration < 60 ? `${totalDuration}m` : `${Math.floor(totalDuration/60)}h ${totalDuration%60 ? `${totalDuration%60}m` : ''}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* === MEMBERSHIPS (themed) === */}
      {membershipPlans.length > 0 && (
        <section className="space-y-4" data-testid="salon-memberships-section">
          <header className="flex items-end justify-between">
            <div>
              <span className="eyebrow-brass">Save more, every visit</span>
              <h2 className="font-fraunces text-2xl font-medium mt-1 leading-none">Memberships</h2>
            </div>
          </header>
          <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto pb-2 scrollbar-thin">
            <div className="flex gap-4 snap-x snap-mandatory">
              {membershipPlans.map((plan, idx) => {
                const TIER_COLORS = { Diamond: '#38bdf8', Gold: '#f59e0b', Silver: '#94a3b8', Platinum: '#64748b', Custom: '#a855f7' };
                const accent = plan.color || TIER_COLORS[plan.tier] || TIER_COLORS.Custom;
                const bonus = Math.max(0, Number(plan.credit || 0) - Number(plan.amount || 0));
                return (
                  <div
                    key={plan.id || idx}
                    className="snap-start flex-shrink-0 w-[280px] sm:w-[300px] rounded-3xl overflow-hidden border shadow-lux text-left"
                    style={{ borderColor: accent + '55', background: `linear-gradient(160deg, ${accent}14, ${accent}05)` }}
                    data-testid={`membership-card-${plan.id}`}
                  >
                    <div className="p-5" style={{ borderBottom: `1px solid ${accent}22` }}>
                      <div className="flex items-center justify-between">
                        <span
                          className="inline-flex items-center gap-1 rounded-full border font-bold uppercase tracking-wider px-2.5 py-1 text-[11px]"
                          style={{ color: accent, borderColor: accent, backgroundColor: accent + '1A' }}
                          data-testid={`membership-tier-${plan.id}`}
                        >
                          <Crown className="w-3.5 h-3.5" style={{ color: accent }} />
                          {plan.tier || 'Member'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{plan.validity_months} mo</span>
                      </div>
                      <h3 className="font-fraunces text-xl font-medium text-foreground mt-3 leading-tight">{plan.name}</h3>
                    </div>
                    <div className="p-5 space-y-2">
                      <div className="flex items-end gap-2">
                        <p className="font-bebas text-3xl leading-none" style={{ color: accent }}>₹{Math.round(plan.amount)}</p>
                        <span className="text-xs text-muted-foreground mb-0.5">one-time</span>
                      </div>
                      <p className="text-sm text-foreground">
                        Get <b style={{ color: accent }}>₹{Math.round(plan.credit)}</b> wallet credit
                        {bonus > 0 && <span className="text-green-600 dark:text-green-400 font-semibold"> · ₹{Math.round(bonus)} bonus</span>}
                      </p>
                      {plan.terms_conditions && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{plan.terms_conditions}</p>
                      )}
                      <button
                        onClick={() => buyMembership(plan)}
                        disabled={buyingPlanId === plan.id}
                        data-testid={`membership-buy-${plan.id}`}
                        className="mt-3 w-full h-10 rounded-xl font-semibold text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                        style={{ backgroundColor: accent }}
                      >
                        {buyingPlanId === plan.id ? 'Submitting…' : `Buy for ₹${Math.round(plan.amount)}`}
                      </button>
                      <div className="pt-1 text-[11px] text-muted-foreground text-center">Confirm &amp; pay at the salon to activate.</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* === ABOUT === */}
      <section className="space-y-4" data-testid="salon-about-section">
        <header>
          <span className="eyebrow-brass">House notes</span>
          <h2 className="font-fraunces text-2xl font-medium mt-1 leading-none">About</h2>
        </header>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Address card */}
          <div className="lux-card rounded-2xl p-5 bg-card">
            <div className="eyebrow mb-3">Address</div>
            <p className="text-foreground leading-relaxed">
              {(branch && branch.address) || salon.address}
            </p>
            {salon.phone && (
              <a
                href={`tel:${salon.phone}`}
                className="mt-4 inline-flex items-center gap-2 text-sm text-brass hover:underline"
              >
                <Phone className="w-3.5 h-3.5" strokeWidth={1.6} /> {salon.phone}
              </a>
            )}
            {salon.latitude && salon.longitude && (
              <a
                href={`https://www.google.com/maps?q=${salon.latitude},${salon.longitude}`}
                target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-sm text-brass hover:underline ml-4"
              >
                <MapPin className="w-3.5 h-3.5" strokeWidth={1.6} /> Get Directions
              </a>
            )}
          </div>

          {/* Hours */}
          <div className="lux-card rounded-2xl p-5 bg-card">
            <div className="eyebrow mb-3">Operational Hours</div>
            <ul className="space-y-1.5 text-sm">
              {DAYS.map((d) => {
                const day = salon.operational_hours?.[d];
                const isToday = DAYS[new Date().getDay()] === d;
                return (
                  <li key={d} className={`flex items-center justify-between ${isToday ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                    <span className={isToday ? 'text-brass' : ''}>
                      {DAY_LABEL[d]}
                      {isToday && <span className="serif-italic ml-1.5 text-[10px] uppercase tracking-widest">today</span>}
                    </span>
                    <span>
                      {!day || day.is_holiday
                        ? <span className="opacity-60">Closed</span>
                        : `${day.opening_time || '09:00'} – ${day.closing_time || '20:00'}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* === REVIEWS (auto-scrolling marquee) === */}
      <section className="space-y-4" data-testid="salon-reviews-section">
        <header className="flex items-end justify-between">
          <div>
            <span className="eyebrow-brass">In their words</span>
            <h2 className="font-fraunces text-2xl font-medium mt-1 leading-none">
              Reviews
              {reviewsTotal > 0 && (
                <span className="text-base font-normal text-muted-foreground ml-2">· {reviewsTotal}</span>
              )}
            </h2>
          </div>
          {reviewsTotal > 0 && (
            <button
              onClick={() => navigate(`/salon/${salonId}/ratings`)}
              className="text-sm text-brass hover:underline inline-flex items-center gap-1"
              data-testid="reviews-view-all-btn"
            >
              View all <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </header>

        {reviews.length === 0 ? (
          <div className="lux-card rounded-2xl p-8 text-center text-muted-foreground text-sm">
            No reviews yet — be the first to share your experience.
          </div>
        ) : (
          <div className="overflow-hidden relative" data-testid="reviews-marquee">
            <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
            <button
              onClick={() => navigate(`/salon/${salonId}/ratings`)}
              className="block w-full text-left"
              aria-label="View all reviews"
            >
              <div className="marquee-track py-2">
                {[...reviews, ...reviews].map((r, i) => (
                  <div
                    key={`${r.id || r._id || i}-${i}`}
                    className="lux-card rounded-2xl bg-card p-5 w-[300px] sm:w-[360px] flex-shrink-0"
                  >
                    <Quote className="w-5 h-5 text-brass/60" strokeWidth={1.4} />
                    <div className="flex items-center gap-1 mt-2">
                      {[1,2,3,4,5].map(s => (
                        <Star key={s} className={`w-3.5 h-3.5 ${s <= (r.rating || 0) ? 'text-brass fill-current' : 'text-muted-foreground/30'}`} />
                      ))}
                    </div>
                    <p className="text-sm text-foreground mt-3 leading-relaxed line-clamp-4">
                      "{r.review}"
                    </p>
                    <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">
                        {r.customer_name || 'Anonymous'}
                      </span>
                      {r.created_at && (
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </button>
          </div>
        )}
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-background bg-grain">
      {/* === STICKY TOP STRIP — Branch dropdown + actions === */}
      <div className="bg-card/80 glass-warm border-b border-border/60 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 flex items-center gap-2 ml-12 mr-12 sm:ml-14 sm:mr-14">
          {/* Back button */}
          <button
            onClick={() => {
              if (activeTab !== 'dashboard') {
                setActiveTab('dashboard');
                const next = new URLSearchParams(searchParams);
                next.delete('tab');
                setSearchParams(next, { replace: true });
              } else {
                navigate('/salons');
              }
            }}
            className="p-2 rounded-full hover:bg-muted transition-colors flex-shrink-0"
            data-testid="salon-back-btn"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" strokeWidth={1.7} />
          </button>

          {/* Branch dropdown — primary identity on top bar */}
          <div className="relative flex-1 min-w-0">
            <button
              onClick={() => setShowBranchDropdown(v => !v)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-muted transition-colors text-left"
              data-testid="branch-dropdown-btn"
              disabled={branches.length <= 1}
            >
              {salon.logo_url ? (
                <img src={salon.logo_url} alt={salon.salon_name} className="w-8 h-8 rounded-full object-cover ring-1 ring-brass/40 flex-shrink-0" />
              ) : (
                <span className="w-8 h-8 rounded-full bg-brass-soft border border-brass/30 flex items-center justify-center flex-shrink-0">
                  <Scissors className="w-3.5 h-3.5 text-brass" strokeWidth={1.6} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-fraunces text-[15px] font-medium text-foreground leading-tight truncate">
                  {salon.salon_name}
                </span>
                <span className="block text-[11px] text-muted-foreground truncate">
                  {branch?.branch_name || 'Main Branch'}{branches.length > 1 && <span className="text-brass"> · change ↓</span>}
                </span>
              </span>
              {branches.length > 1 && (
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${showBranchDropdown ? 'rotate-180' : ''}`} strokeWidth={1.6} />
              )}
            </button>
            <AnimatePresence>
              {showBranchDropdown && branches.length > 1 && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-2 w-[300px] max-w-[90vw] lux-card rounded-2xl bg-popover p-2 z-50"
                  data-testid="branch-dropdown-menu"
                >
                  <div className="eyebrow px-3 pt-2 pb-1">Branches</div>
                  <div className="max-h-72 overflow-y-auto">
                    {branches.map(b => (
                      <button
                        key={b.id}
                        onClick={() => handleSwitchBranch(b)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-start gap-2 ${
                          b.id === branchId ? 'bg-brass-soft' : 'hover:bg-muted'
                        }`}
                        data-testid={`branch-option-${b.id}`}
                      >
                        <MapPin className={`w-3.5 h-3.5 mt-1 flex-shrink-0 ${b.id === branchId ? 'text-brass' : 'text-muted-foreground'}`} strokeWidth={1.6} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-foreground truncate">
                            {b.branch_name}{b.is_main_branch && <span className="text-brass text-[10px] uppercase tracking-widest ml-1.5">main</span>}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">{b.address}</div>
                        </div>
                        {b.id === branchId && <CheckCircle className="w-4 h-4 text-brass flex-shrink-0 mt-0.5" strokeWidth={2} />}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action buttons — tight, icon+label on lg, icon-only on small */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => navigate(`/book/${salonId}${branchId ? `?branch=${branchId}` : ''}`)}
              className="inline-flex items-center gap-1.5 h-9 px-3 sm:px-4 rounded-full bg-brass text-espresso hover:bg-brass-hover transition-colors font-semibold text-sm"
              data-testid="strip-book-btn"
              aria-label="Book appointment"
            >
              <Calendar className="w-4 h-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Book</span>
            </button>
            <button
              onClick={() => setShowLiveQueue(true)}
              className="inline-flex items-center justify-center gap-1.5 h-9 w-9 sm:w-auto sm:px-3 rounded-full border border-border bg-card hover:border-brass/60 transition-colors text-foreground"
              data-testid="strip-queue-btn"
              aria-label="Live queue"
              title="Live queue"
            >
              <Clock className="w-4 h-4 text-brass" strokeWidth={1.7} />
              <span className="hidden md:inline text-sm">Queue</span>
            </button>
            <button
              onClick={() => navigate(`/salon/${salonId}/wallet`)}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full border border-border bg-card hover:border-brass/60 transition-colors text-foreground text-sm"
              data-testid="strip-wallet-btn"
              aria-label="Wallet"
              title="My wallet"
            >
              <Wallet className="w-4 h-4 text-brass" strokeWidth={1.7} />
              <span className="font-bebas text-base leading-none">₹{walletBalance.toFixed(0)}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        {renderTabContent()}
      </div>

      {/* Footer (only on the dashboard view) */}
      {activeTab === 'dashboard' && <Footer />}

      {/* Live Queue Modal */}
      <AnimatePresence>
        {showLiveQueue && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setShowLiveQueue(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden"
            >
              {/* Header */}
              <div className="p-5 border-b border-border/60 flex items-center justify-between">
                <div>
                  <span className="eyebrow-brass">Live</span>
                  <h2 className="font-fraunces text-2xl font-medium text-foreground mt-1 leading-none">Queue</h2>
                </div>
                <button
                  onClick={() => setShowLiveQueue(false)}
                  className="p-2 rounded-full hover:bg-muted"
                  data-testid="live-queue-close-btn"
                >
                  <X className="w-5 h-5 text-foreground" strokeWidth={1.6} />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 overflow-y-auto max-h-[60vh]">
                {/* Overall Status */}
                <div className="bg-gradient-to-r from-brass-soft via-card to-card rounded-2xl p-5 mb-4 border border-brass/20">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-3xl font-bebas text-brass">
                        {liveStatus?.overall?.waiting_count || 0}
                      </p>
                      <p className="eyebrow mt-1">In Queue</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bebas text-foreground">
                        #{liveStatus?.overall?.current_token || '—'}
                      </p>
                      <p className="eyebrow mt-1">Now Serving</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bebas text-sage">
                        {liveStatus?.overall?.completed_today || 0}
                      </p>
                      <p className="eyebrow mt-1">Completed</p>
                    </div>
                  </div>
                </div>

                {/* Stylist-wise Queue */}
                <h3 className="font-fraunces text-base font-medium text-foreground mb-3 mt-2">Stylist queue</h3>
                <div className="space-y-3">
                  {liveStatus?.barbers && liveStatus.barbers.length > 0 ? (
                    liveStatus.barbers.map((barber) => (
                      <div
                        key={barber.barber_id}
                        className="bg-background rounded-xl p-4 border border-border"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-brass-soft border border-brass/30 flex items-center justify-center">
                              <User className="w-4 h-4 text-brass" strokeWidth={1.6} />
                            </div>
                            <div>
                              <p className="font-bold text-foreground">{barber.barber_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {barber.status === 'busy' ? 'Currently Busy' : 'Available'}
                              </p>
                            </div>
                          </div>
                          {barber.current_token && (
                            <div className="px-2.5 py-1 pill-brass rounded-full">
                              <span className="font-semibold text-[11px]">Serving #{barber.current_token}</span>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="bg-muted/50 rounded-lg p-2">
                            <p className="text-lg font-bold text-foreground">{barber.waiting_count}</p>
                            <p className="text-xs text-muted-foreground">Waiting</p>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-2">
                            <p className="text-lg font-bold text-foreground">{barber.total_tokens_today || 0}</p>
                            <p className="text-xs text-muted-foreground">Served Today</p>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-2">
                            <p className="text-lg font-bold text-foreground">
                              {barber.waiting_count > 0 ? `~${barber.waiting_count * 20}min` : 'Now'}
                            </p>
                            <p className="text-xs text-muted-foreground">Est. Wait</p>
                          </div>
                        </div>

                        {/* Waiting Queue List */}
                        {barber.waiting_tokens && barber.waiting_tokens.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs text-muted-foreground mb-2">Queue:</p>
                            <div className="flex flex-wrap gap-2">
                              {barber.waiting_tokens.slice(0, 10).map((token, idx) => (
                                <span
                                  key={token}
                                  className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                    idx === 0
                                      ? 'pill-brass'
                                      : 'bg-muted text-foreground border border-border'
                                  }`}
                                >
                                  #{token}
                                </span>
                              ))}
                              {barber.waiting_tokens.length > 10 && (
                                <span className="text-xs text-muted-foreground">
                                  +{barber.waiting_tokens.length - 10} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground">No active barbers at the moment</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
