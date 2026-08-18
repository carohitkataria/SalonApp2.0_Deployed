import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBookingIntent } from '@/contexts/BookingIntentContext';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import GenderBadge from '@/components/GenderBadge';
import { Scissors, Calendar, User, CheckCircle, Star, Clock, ArrowLeft, Home, Zap, Check, ChevronDown, ChevronRight, Search, Package, Crown, History, Wallet, Banknote, Smartphone, Shield, Edit, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import CustomerWalletCard from '@/components/CustomerWalletCard';
import WalletDisplay from '@/components/WalletDisplay';
import CustomerOtpVerification from '@/components/CustomerOtpVerification';
import CustomerAuthModal from '@/components/CustomerAuthModal';
import BookingIdentitySheet from '@/components/BookingIdentitySheet';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// After the category taxonomy migration, the fine-grained bucket a service
// belongs to lives in `sub_category` (e.g. "Facial", "Hair Cut") and `category`
// is the top-level "Services"/"Packages" split. For customer-facing grouping we
// want the fine-grained bucket, falling back to legacy `category` for un-migrated data.
const svcBucket = (s) => (s?.sub_category || s?.category || 'General');

// Helper functions for IST time (Asia/Kolkata) — reliable regardless of browser timezone
const _istDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
});
const _istHourFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false,
});

const getTodayIST = () => _istDateFmt.format(new Date()); // "YYYY-MM-DD"

const getTomorrowIST = () => {
  const today = getTodayIST();
  // Build a Date at midnight IST then add one day, format back
  const [y, m, d] = today.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  return _istDateFmt.format(tomorrow);
};

const getCurrentHourIST = () => parseInt(_istHourFmt.format(new Date()), 10);

// Legacy alias (kept for any code path still calling getISTDate)
const getISTDate = () => {
  const parts = _istDateFmt.formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {});
  const hour = getCurrentHourIST();
  return new Date(Date.UTC(parseInt(parts.year, 10), parseInt(parts.month, 10) - 1, parseInt(parts.day, 10), hour));
};

// Chip Component for selections
const SelectChip = ({ selected, onClick, children, icon: Icon, disabled = false }) => (
  <motion.button
    type="button"
    whileHover={disabled ? {} : { scale: 1.02 }}
    whileTap={disabled ? {} : { scale: 0.98 }}
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    className={`relative px-4 py-2.5 rounded-full border-2 transition-all flex items-center gap-2 text-sm font-medium ${
      disabled
        ? 'bg-muted/50 text-muted-foreground/50 border-border/50 cursor-not-allowed opacity-50'
        : selected
        ? 'bg-gold text-black border-gold shadow-lg shadow-gold/20'
        : 'bg-background text-foreground border-border hover:border-gold/50'
    }`}
  >
    {Icon && <Icon className="w-4 h-4" />}
    {children}
    {selected && !disabled && (
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
      >
        <Check className="w-3 h-3 text-white" />
      </motion.span>
    )}
  </motion.button>
);

// Service Card Component
const ServiceCard = ({ service, selected, onToggle, price }) => {
  const isOnwards = service.price_type === 'onwards' || (Array.isArray(service.axes) && service.axes.length > 0);
  return (
  <motion.div
    whileHover={{ scale: 1.01 }}
    whileTap={{ scale: 0.99 }}
    onClick={onToggle}
    className={`relative p-3 rounded-xl cursor-pointer transition-all border-2 ${
      selected
        ? 'bg-gold/10 border-gold shadow-md'
        : 'bg-card border-border hover:border-gold/40'
    }`}
  >
    <div className="flex justify-between items-center">
      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-foreground text-sm truncate">{service.service_name}</h4>
        {service.default_duration && (
          <p className="text-xs text-muted-foreground flex items-center mt-0.5">
            <Clock className="w-3 h-3 mr-1" /> {service.default_duration} mins
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="text-base font-bold text-gold leading-tight">₹{price}</p>
          {isOnwards && (
            <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide leading-tight">Onwards</p>
          )}
        </div>
        {selected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-5 h-5 bg-gold rounded-full flex items-center justify-center"
          >
            <Check className="w-3 h-3 text-black" />
          </motion.div>
        )}
      </div>
    </div>
  </motion.div>
  );
};

// Barber Selection Component
const BarberChip = ({ barber, selected, onSelect, liveStatus, slotAvailability }) => {
  const status = liveStatus?.barbers?.find(b => b.barber_id === barber.id);
  const waitingCount = status?.waiting_count || 0;

  // Get slot availability for this barber
  const barberSlot = slotAvailability?.barbers?.find(b => b.barber_id === barber.id);
  const isFull = barberSlot?.is_full || false;
  const slotsLeft = barberSlot?.available ?? 10;

  // On-leave for the selected date — flag from backend customer_view response
  const onLeave = barber.is_on_leave === true;
  const disabled = isFull || onLeave;

  return (
    <motion.button
      type="button"
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      onClick={disabled ? undefined : () => onSelect(barber.id)}
      disabled={disabled}
      className={`relative p-3 rounded-xl border-2 transition-all text-left ${
        onLeave
          ? 'bg-muted/40 border-border/40 opacity-50 cursor-not-allowed grayscale'
          : isFull
          ? 'bg-muted/30 border-border/50 opacity-60 cursor-not-allowed'
          : selected
          ? 'bg-gold/10 border-gold shadow-md'
          : 'bg-card border-border hover:border-gold/40'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0 border-2 ${onLeave ? 'border-border/40' : 'border-gold/30'}`}>
          {(barber.profile_image || barber.photo_url || barber.image_url) ? (
            <img src={barber.profile_image || barber.photo_url || barber.image_url} alt={barber.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gold/20 to-gold/40">
              <User className="w-5 h-5 text-gold" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground text-sm truncate flex items-center gap-1">
            {barber.name}
            {barber.gender_specialization && (
              <GenderBadge gender={barber.gender_specialization} size="xs" />
            )}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
            <span className="text-xs text-muted-foreground">{barber.rating || '4.5'}</span>
            {onLeave ? (
              <span className="text-xs text-amber-600 font-semibold">• On Leave</span>
            ) : isFull ? (
              <span className="text-xs text-red-500 font-medium">• Full</span>
            ) : (
              <span className="text-xs text-muted-foreground">• {slotsLeft} slots</span>
            )}
          </div>
        </div>
      </div>
      {/* Distinct "On Leave" badge */}
      {onLeave && (
        <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-amber-500/20 text-amber-700 border border-amber-500/40">
          On Leave
        </span>
      )}
      {selected && !disabled && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 right-2 w-5 h-5 bg-gold rounded-full flex items-center justify-center"
        >
          <Check className="w-3 h-3 text-black" />
        </motion.div>
      )}
      {isFull && (
        <div className="absolute top-2 right-2 px-2 py-0.5 bg-red-500/20 text-red-500 text-xs rounded-full font-medium">
          Booked
        </div>
      )}
    </motion.button>
  );
};

// Collapsible Category Component
const CategorySection = ({ category, services, selectedServices, onToggle, priceGetter, isOpen, onToggleOpen }) => (
  <div className="border border-border rounded-xl overflow-hidden">
    <button
      type="button"
      onClick={onToggleOpen}
      className="w-full flex items-center justify-between p-3 bg-card hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Scissors className="w-4 h-4 text-gold" />
        <span className="font-bold text-foreground">{category}</span>
        <span className="text-xs bg-gold/20 text-gold px-2 py-0.5 rounded-full">
          {services.length}
        </span>
      </div>
      {isOpen ? (
        <ChevronDown className="w-5 h-5 text-muted-foreground" />
      ) : (
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      )}
    </button>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="p-3 pt-0 space-y-2">
            {services.map(service => (
              <ServiceCard
                key={service.id}
                service={service}
                selected={selectedServices.includes(service.id)}
                onToggle={() => onToggle(service.id)}
                price={priceGetter(service)}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

export default function SinglePageBooking() {
  const { salonId } = useParams();
  const navigate = useNavigate();
  const { user, isUserLoggedIn, isUserOtpVerified, loginUser } = useAuth();
  const { saveIntent, getIntent, clearIntent } = useBookingIntent();
  const [searchParams] = useSearchParams();
  
  // Track salon visit for smart routing
  useEffect(() => {
    if (salonId) {
      localStorage.setItem('last_visited_salon_id', salonId);
    }
  }, [salonId]);
  
  const source = searchParams.get('source') || 'online';
  const forSelf = searchParams.get('for') === 'self';
  const whenParam = searchParams.get('when');
  const preselectedBarber = searchParams.get('barber');
  const preselectedServices = searchParams.get('services');
  const preselectedPackage = searchParams.get('package'); // Task 4: direct package booking
  const modifyTokenId = searchParams.get('modify'); // WhatsApp reschedule flow
  const branchIdFromUrl = searchParams.get('branch') || ''; // Phase 3: customer-selected branch
  const [rescheduleBooking, setRescheduleBooking] = useState(null);
  const [branchId, setBranchId] = useState(branchIdFromUrl);

  const [salon, setSalon] = useState(null);
  const [barbers, setBarbers] = useState([]);
  const [salonServices, setSalonServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [customerMembership, setCustomerMembership] = useState(null);
  const [showMembershipShop, setShowMembershipShop] = useState(false);
  const [membershipPlans, setMembershipPlans] = useState([]);
  const [activeTab, setActiveTab] = useState('services');
  const [serviceTab, setServiceTab] = useState('services'); // favorites / services / packages
  const [selectedCategory, setSelectedCategory] = useState('All'); // Category filter (default: All services)
  const [categories, setCategories] = useState([]); // Categories with thumbnails
  const [customerBookings, setCustomerBookings] = useState([]);
  const [recentServices, setRecentServices] = useState([]);
  const [availablePackages, setAvailablePackages] = useState({ public: [], customer: [] });
  const [useWallet, setUseWallet] = useState(false);
  const [paymentMode, setPaymentMode] = useState(''); // online | wallet | pay_at_salon
  const [inAppPayEnabled, setInAppPayEnabled] = useState(false); // salon has completed Cashfree KYC
  const [onlinePayLoading, setOnlinePayLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [customerPoints, setCustomerPoints] = useState(null);
  const [usePoints, setUsePoints] = useState(false);
  const [upiAppOpened, setUpiAppOpened] = useState(false);
  const [barberServices, setBarberServices] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [liveStatus, setLiveStatus] = useState(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [bookedToken, setBookedToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [slotAvailability, setSlotAvailability] = useState(null);
  
  // Form state
  const [bookingForSelf, setBookingForSelf] = useState(forSelf || true);
  const [otherPersonName, setOtherPersonName] = useState('');
  const [otherPersonPhone, setOtherPersonPhone] = useState('');
  const [otherPersonGender, setOtherPersonGender] = useState('');
  // Frictionless checkout — identity captured at the payment step when the
  // customer is NOT signed in. We do NOT send an OTP; the resulting user is
  // marked is_otp_verified=false and the booking is tagged accordingly.
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestGender, setGuestGender] = useState('');
  // Guest vs Login choice for unauthenticated customers at the payment step.
  // null → show chooser, 'guest' → show identity form, 'login' → open auth modal.
  const [bookingMode, setBookingMode] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  // Item 10 — Post-confirm identity sheet
  const [showIdentitySheet, setShowIdentitySheet] = useState(false);
  const [autoSubmitAfterLogin, setAutoSubmitAfterLogin] = useState(false);
  const [fastestAvailable, setFastestAvailable] = useState(!preselectedBarber);
  const [searchQuery, setSearchQuery] = useState('');
  const [openCategories, setOpenCategories] = useState({});

  const [formData, setFormData] = useState({
    date: whenParam === 'today' ? getTodayIST() : getTodayIST(),
    shift: '',
    barberId: preselectedBarber || 'any',
    selectedServices: preselectedServices ? preselectedServices.split(',') : [],
    bookingType: whenParam === 'today' ? 'instant' : 'instant'
  });

  const [totalAmount, setTotalAmount] = useState(0);

  // Fetch data on mount
  useEffect(() => {
    fetchSalonData();
    fetchShifts();
    fetchLiveStatus();
    fetchRecentServices();
    fetchCustomerMembership();
    fetchPackages();
    fetchCustomerBookings();
    const interval = setInterval(fetchLiveStatus, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoggedIn, salonId]);

  // Force "self" for unauthenticated guest checkout — they can't book for others.
  useEffect(() => {
    if (!isUserLoggedIn && !bookingForSelf) setBookingForSelf(true);
  }, [isUserLoggedIn, bookingForSelf]);

  // Hydrate cart from BookingIntent (sessionStorage, 30-min TTL) so customers
  // returning from the sign-in flow keep their selections.
  const intentHydratedRef = useRef(false);
  useEffect(() => {
    if (intentHydratedRef.current) return;
    const intent = getIntent();
    if (!intent || intent.salon_id !== salonId) return;
    intentHydratedRef.current = true;
    setFormData((prev) => ({
      ...prev,
      selectedServices: Array.isArray(intent.services) && intent.services.length
        ? intent.services
        : prev.selectedServices,
      barberId: intent.barber_id || prev.barberId,
      date: intent.date || prev.date,
      shift: intent.shift || prev.shift,
    }));
    if (intent.barber_id && intent.barber_id !== 'any') setFastestAvailable(false);
    if (intent.branch_id) setBranchId(intent.branch_id);
    // Once consumed, drop it so we don't re-hydrate on every render.
    clearIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId]);

  // Reschedule flow: when ?modify=<tokenId> is present in URL, hydrate the form
  // with the existing booking's data so the customer can edit the SAME token
  // (rather than creating a fresh booking).
  useEffect(() => {
    if (!modifyTokenId || !isUserLoggedIn) return;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/tokens/${modifyTokenId}/public-details`);
        setRescheduleBooking(data);
        setFormData((prev) => ({
          ...prev,
          date: data.date || prev.date,
          shift: data.shift || '',
          barberId: data.barber_id || 'any',
          selectedServices: Array.isArray(data.selected_services) ? data.selected_services : [],
        }));
        setFastestAvailable(!data.barber_id || data.barber_id === 'any');
        if (typeof data.booking_for_self === 'boolean') setBookingForSelf(data.booking_for_self);
        if (data.payment_mode) {
          // Map legacy modes → new consolidated modes.
          const legacy = data.payment_mode;
          const mapped = legacy === 'cash' || legacy === 'upi' || legacy === 'pay_later'
            ? 'pay_at_salon'
            : legacy; // 'wallet' | 'online' | already-new
          setPaymentMode(mapped);
        }
        toast.info(`Modifying booking #${data.token_number}`);
      } catch (err) {
        toast.error(err?.response?.data?.detail || 'Could not load booking to reschedule.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modifyTokenId, isUserLoggedIn]);

  // Refetch shift windows when selected date changes (operational-hour driven)
  useEffect(() => {
    if (salonId && formData.date) {
      fetchShifts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.date, salonId]);

  // Fetch barber services when barber changes
  const rescheduleHydratedRef = useRef(false);
  // Track the previous barberId so we only wipe selectedServices when the
  // user actually CHANGES barber (vs the effect firing on mount or because
  // salonServices arrived). This preserves URL-preselected services brought
  // over from the services page (`?services=id1,id2`).
  const prevBarberIdRef = useRef(null);
  useEffect(() => {
    if (formData.barberId !== 'any' && !fastestAvailable) {
      fetchBarberServices(formData.barberId);
    } else {
      setBarberServices(salonServices);
    }
    // Don't wipe preloaded services during reschedule hydration — those are
    // the services the customer just clicked through from WhatsApp.
    if (modifyTokenId && !rescheduleHydratedRef.current && formData.selectedServices.length) {
      rescheduleHydratedRef.current = true;
      prevBarberIdRef.current = formData.barberId;
      return;
    }
    // Task 4: Don't wipe selected services if a package is active (services come from the package).
    if (selectedPackage) {
      prevBarberIdRef.current = formData.barberId;
      return;
    }
    // Only wipe selectedServices when the barber ACTUALLY changes. This avoids
    // wiping (a) URL-preselected services on initial mount, (b) services when
    // salonServices/fastestAvailable change but barberId stayed put.
    const prev = prevBarberIdRef.current;
    if (prev !== null && prev !== formData.barberId) {
      setFormData(p => ({ ...p, selectedServices: [] }));
    }
    prevBarberIdRef.current = formData.barberId;
  }, [formData.barberId, salonServices, fastestAvailable, selectedPackage]);

  // Calculate total when services change
  useEffect(() => {
    calculateTotal();
  }, [formData.selectedServices, barberServices, salonServices, selectedPackage]);

  // Fetch coupons the salon chose to show customers (show_to_customer=true)
  useEffect(() => {
    if (!salonId) return;
    axios.get(`${API}/public/salons/${salonId}/coupons`)
      .then(r => setAvailableCoupons(Array.isArray(r.data?.coupons) ? r.data.coupons : []))
      .catch(() => setAvailableCoupons([]));
  }, [salonId]);

  // Fetch the logged-in customer's loyalty points (for redeem-at-checkout)
  useEffect(() => {
    const ph = user?.phone;
    if (!salonId || !ph) { setCustomerPoints(null); return; }
    axios.get(`${API}/salons/${salonId}/customers/${ph}/loyalty-points`)
      .then(r => setCustomerPoints(r.data))
      .catch(() => setCustomerPoints(null));
  }, [salonId, user]);

  // Re-validate / clear coupon when the cart total changes
  useEffect(() => {
    if (appliedCoupon) { setAppliedCoupon(null); setCouponDiscount(0); setCouponError('Cart changed — re-apply coupon'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAmount]);

  const applyCustomerCoupon = async (codeArg) => {
    const code = (codeArg || couponCode || '').trim().toUpperCase();
    if (!code) { setCouponError('Please enter a coupon code'); return; }
    setCouponCode(code);
    setCouponBusy(true);
    setCouponError('');
    try {
      const { data } = await axios.post(`${API}/salons/${salonId}/coupons/validate`, {
        code,
        bill_amount: totalAmount,
        service_ids: formData.selectedServices,
        customer_phone: formData.customerPhone || null,
        branch_id: branchId || null,
      });
      if (data?.valid) {
        setAppliedCoupon(data.coupon || { code });
        setCouponDiscount(Math.round(Number(data.discount_amount) || 0));
        setCouponError('');
        toast.success(`Coupon applied · you save ₹${Math.round(Number(data.discount_amount) || 0)}`);
      } else {
        setAppliedCoupon(null); setCouponDiscount(0);
        setCouponError(data?.reason || 'Invalid coupon code');
      }
    } catch (err) {
      setAppliedCoupon(null); setCouponDiscount(0);
      setCouponError(err?.response?.data?.detail || 'Invalid coupon code');
    } finally {
      setCouponBusy(false);
    }
  };

  // Discount membership: flat % off services, auto-applied (mirrors backend order)
  const membershipDiscountPct = (customerMembership?.has_membership && customerMembership?.plan_type === 'discount')
    ? Number(customerMembership.discount_percent || 0) : 0;
  const membershipDiscount = membershipDiscountPct > 0
    ? Math.round(Number(totalAmount) * membershipDiscountPct / 100) : 0;
  const baseAfterMembership = Math.max(0, Number(totalAmount) - membershipDiscount);
  // Recompute coupon on the post-membership base so it matches backend stacking
  const effCouponDiscount = (() => {
    if (!appliedCoupon || !couponDiscount) return 0;
    const c = appliedCoupon;
    if (c.type == null || c.value == null) return Math.min(Number(couponDiscount || 0), baseAfterMembership);
    let d = c.type === 'percent' ? baseAfterMembership * Number(c.value || 0) / 100 : Number(c.value || 0);
    if (c.max_discount_amount != null) d = Math.min(d, Number(c.max_discount_amount));
    return Math.max(0, Math.min(Math.round(d), baseAfterMembership));
  })();
  // Amount the guest actually pays (after membership + coupon)
  const payableAfterCoupon = Math.max(0, baseAfterMembership - effCouponDiscount);
  const pointsDiscount = (usePoints && customerPoints?.can_redeem)
    ? Math.min(Number(customerPoints.redeemable_value || 0), payableAfterCoupon)
    : 0;
  const payableAmount = Math.max(0, payableAfterCoupon - pointsDiscount);

  // Initialize open categories
  useEffect(() => {
    const services = (fastestAvailable || formData.barberId === 'any') ? salonServices : barberServices;
    const categories = [...new Set(services.map(s => svcBucket(s)))];
    const initial = {};
    categories.forEach((cat, idx) => {
      initial[cat] = idx === 0; // Open first category by default
    });
    setOpenCategories(initial);
  }, [salonServices, barberServices, fastestAvailable, formData.barberId]);

  const fetchSalonData = async () => {
    try {
      // Resolve effective branch_id: explicit URL > main branch (fetched fresh).
      let effectiveBranchId = branchId;
      if (!effectiveBranchId) {
        try {
          const bRes = await axios.get(`${API}/public/salons/${salonId}/branches`);
          const list = Array.isArray(bRes.data) ? bRes.data : [];
          const main = list.find(b => b.is_main_branch) || list[0];
          if (main) {
            effectiveBranchId = main.id;
            setBranchId(main.id);
          }
        } catch (e) { /* fall through */ }
      }

      const branchSuffix = effectiveBranchId ? `&branch_id=${effectiveBranchId}` : '';
      const [salonRes, barbersRes, servicesRes, categoriesRes] = await Promise.all([
        axios.get(`${API}/salons/${salonId}`),
        // Customer view with the active date so the backend marks `is_on_leave` per-date
        // (we no longer pass available_only — we want on-leave barbers visible but greyed-out).
        axios.get(`${API}/salons/${salonId}/barbers?customer_view=true&date=${formData.date || getTodayIST()}${branchSuffix}`),
        axios.get(`${API}/salons/${salonId}/services/enabled`),
        axios.get(`${API}/salons/${salonId}/categories?type=service`)
      ]);
      setSalon(salonRes.data);

      // Is this salon set up to accept in-app UPI/card payment (Cashfree KYC done)?
      // Non-blocking — failure just leaves online-pay hidden; wallet / pay-at-salon still work.
      axios
        .get(`${API}/service-payments/salon/${salonId}/available`)
        .then((r) => setInAppPayEnabled(!!r.data?.in_app_payment_enabled))
        .catch(() => setInAppPayEnabled(false));
      setBarbers(barbersRes.data);
      setSalonServices(servicesRes.data);
      
      // Set categories with default thumbnails
      const defaultThumbnails = {
        "All": "https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?w=200&h=200&fit=crop",
        "Favorites": "https://images.pexels.com/photos/7755651/pexels-photo-7755651.jpeg?w=200&h=200&fit=crop",
        "General": "https://images.pexels.com/photos/7781850/pexels-photo-7781850.jpeg?w=200&h=200&fit=crop",
        "Packages": "https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?w=200&h=200&fit=crop",
        "Facial": "https://images.pexels.com/photos/3985325/pexels-photo-3985325.jpeg?w=200&h=200&fit=crop",
        "Hair Color": "https://images.pexels.com/photos/3993146/pexels-photo-3993146.jpeg?w=200&h=200&fit=crop",
        "Massage & Spa": "https://images.pexels.com/photos/3757952/pexels-photo-3757952.jpeg?w=200&h=200&fit=crop",
        "Men's Grooming": "https://images.pexels.com/photos/9992819/pexels-photo-9992819.jpeg?w=200&h=200&fit=crop",
        "Manicure & Pedicure": "https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?w=200&h=200&fit=crop"
      };
      
      // Determine which categories actually have services available at this salon
      const enabledServices = servicesRes.data || [];
      const categoriesWithServices = new Set(
        enabledServices.map(s => svcBucket(s)).filter(Boolean)
      );
      
      const rawCategories = categoriesRes.data.categories || [];
      const orderedCategories = [];
      
      // 1) "All" — always shown first when there is at least one service
      if (enabledServices.length > 0) {
        orderedCategories.push({ name: "All", thumbnail_url: defaultThumbnails["All"] });
      }
      
      // 2) Favorites — only if customer has any recent / favorite services (decided when recentServices loads).
      // We pre-add it as a placeholder; if recentServices is empty, we'll filter it out below.
      orderedCategories.push({ name: "Favorites", thumbnail_url: defaultThumbnails["Favorites"], _isFavorites: true });
      
      // 3) Real service categories — canonical per-salon taxonomy (WS4).
      //    Only those that actually have services at this salon, in sort_order.
      rawCategories.forEach(cat => {
        if (categoriesWithServices.has(cat.name) && !orderedCategories.find(c => c.name === cat.name)) {
          orderedCategories.push({ ...cat, thumbnail_url: cat.thumbnail_url || defaultThumbnails[cat.name] || defaultThumbnails["General"] });
        }
      });
      // Catch any service category that wasn't in the master list (custom categories)
      categoriesWithServices.forEach(cName => {
        if (!orderedCategories.find(c => c.name === cName)) {
          orderedCategories.push({ name: cName, thumbnail_url: defaultThumbnails[cName] || defaultThumbnails["General"] });
        }
      });
      
      setCategories(orderedCategories);
    } catch (error) {
      console.error('Error fetching salon data:', error);
      toast.error('Failed to load salon information');
    }
  };

  const fetchShifts = async () => {
    try {
      // Prefer salon-specific shift windows derived from operational hours
      const dateForShifts = formData.date || getTodayIST();
      const response = await axios.get(`${API}/salons/${salonId}/shift-windows`, {
        params: { date: dateForShifts }
      });
      setShifts(response.data.shifts || []);
    } catch (error) {
      console.error('Error fetching shift windows, falling back to defaults:', error);
      try {
        const fallback = await axios.get(`${API}/shifts`);
        setShifts(fallback.data.shifts);
      } catch (e) {
        console.error('Fallback /shifts also failed:', e);
      }
    }
  };

  const fetchLiveStatus = async () => {
    try {
      const response = await axios.get(`${API}/salons/${salonId}/live-status`);
      setLiveStatus(response.data);
    } catch (error) {
      console.error('Error fetching live status:', error);
    }
  };

  // Refetch barbers whenever the selected date changes so the on-leave flag
  // (per-date) updates correctly. We don't refetch the whole salon — just barbers.
  useEffect(() => {
    if (!salonId || !formData.date) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/salons/${salonId}/barbers`, {
          params: { customer_view: true, date: formData.date }
        });
        if (!cancelled) setBarbers(res.data || []);
      } catch (e) {
        console.error('Error refreshing barbers for date', formData.date, e);
      }
    })();
    return () => { cancelled = true; };
  }, [salonId, formData.date]);

  const fetchSlotAvailability = async (date, shift) => {
    try {
      const response = await axios.get(`${API}/salons/${salonId}/slot-availability`, {
        params: { date, shift }
      });
      setSlotAvailability(response.data);
    } catch (error) {
      console.error('Error fetching slot availability:', error);
    }
  };

  // Fetch slot availability when date or shift changes
  useEffect(() => {
    if (formData.date && formData.shift) {
      fetchSlotAvailability(formData.date, formData.shift);
    }
  }, [formData.date, formData.shift]);

  const fetchBarberServices = async (barberId) => {
    try {
      const response = await axios.get(`${API}/barbers/${barberId}/services`);
      setBarberServices(response.data.filter(s => s.is_available));
    } catch (error) {
      setBarberServices([]);
    }
  };

  const fetchPackages = async () => {
    try {
      const gender = user?.gender || 'all';
      
      // Fetch public salon packages
      const publicResponse = await axios.get(`${API}/salons/${salonId}/packages/with-services`, {
        params: { gender }
      });
      
      // Fetch customer-specific packages if user is logged in
      let customerPackages = [];
      if (user && user.phone) {
        try {
          const phone = user.phone.replace('+91', '');
          const customerResponse = await axios.get(`${API}/salons/${salonId}/customers/${phone}/packages`);
          customerPackages = (customerResponse.data.customer_packages || []).map(p => ({
            ...p,
            is_custom: true  // Mark as custom for display
          }));
        } catch (error) {
          // No customer packages — handled gracefully below.
        }
      }
      
      setAvailablePackages({
        public: publicResponse.data.packages || [],
        customer: customerPackages
      });
      // Customer packages first, then public
      setPackages([...customerPackages, ...(publicResponse.data.packages || [])]);
    } catch (error) {
      console.error('Error fetching packages:', error);
    }
  };

  const fetchCustomerBookings = async () => {
    if (!user || !user.phone) return;

    try {
      const phone = user.phone.replace('+91', '');
      const response = await axios.get(`${API}/salons/${salonId}/customers/${phone}/bookings`);
      setCustomerBookings(response.data.bookings || []);
    } catch (error) {
      // No booking history for this customer — leave list empty.
    }
  };

  const fetchRecentServices = async () => {
    if (!user || !user.phone) return;
    try {
      const phone = user.phone.replace('+91', '');
      const response = await axios.get(`${API}/salons/${salonId}/customers/${phone}/recent-services`);
      setRecentServices(response.data.recent_services || []);
      // If there are recent services, default to 'recent' tab, otherwise 'services'
      if ((response.data.recent_services || []).length > 0) {
        setServiceTab('recent');
      } else {
        setServiceTab('services');
      }
    } catch (error) {
      setServiceTab('services');
    }
  };

  const fetchMembershipPlans = async () => {
    try {
      const response = await axios.get(`${API}/salons/${salonId}/membership-plans`);
      setMembershipPlans(response.data.plans || []);
    } catch (error) {
      console.error('Error fetching plans:', error);
    }
  };

  const fetchCustomerMembership = async () => {
    if (!user || !user.phone) return;
    try {
      const response = await axios.get(`${API}/salons/${salonId}/customer-membership/${user.phone}`);
      if (response.data.has_membership) {
        setCustomerMembership(response.data);
      }
    } catch (error) {
      console.error('Error fetching membership:', error);
    }
  };

  const handlePackageSelect = (pkg) => {
    if (selectedPackage?.id === pkg.id) {
      // Deselect package
      setSelectedPackage(null);
      setFormData(prev => ({ ...prev, selectedServices: [] }));
    } else {
      // Select package and auto-select all its services
      setSelectedPackage(pkg);
      // CustomerPackage uses service_id, SalonPackage uses id
      const serviceIds = pkg.services?.map(s => s.id || s.service_id) || [];
      setFormData(prev => ({ ...prev, selectedServices: serviceIds }));
      toast.success(`Package "${pkg.package_name}" selected`);
    }
  };

  // Task 4: Auto-select package from ?package=<id> URL param once packages load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!preselectedPackage || packages.length === 0 || selectedPackage) return;
    const pkg = packages.find(p => p.id === preselectedPackage);
    if (pkg) {
      setSelectedPackage(pkg);
      const serviceIds = pkg.services?.map(s => s.id || s.service_id) || [];
      setFormData(prev => ({ ...prev, selectedServices: serviceIds }));
      // Switch to packages category in service tab for visibility
      setSelectedCategory('Packages');
    }
  }, [packages, preselectedPackage]);


  // Get available shifts for a date
  const getShiftAvailability = (shiftId) => {
    const currentHour = getCurrentHourIST();
    const isToday = formData.date === getTodayIST();
    
    if (!isToday) return true;

    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return false;
    
    const timeParts = shift.time.split(' - ');
    if (timeParts.length !== 2) return true;
    
    const endTimeStr = timeParts[1].trim();
    const endMatch = endTimeStr.match(/(\d+)\s*(AM|PM)/i);
    if (!endMatch) return true;
    
    let endHour = parseInt(endMatch[1]);
    const period = endMatch[2].toUpperCase();
    
    if (period === 'PM' && endHour !== 12) endHour += 12;
    else if (period === 'AM' && endHour === 12) endHour = 0;
    
    return currentHour < endHour;
  };

  // Auto-select the EARLIEST available time slot whenever shifts/date change.
  // "Earliest" = the first (chronologically nearest) shift that is still available.
  useEffect(() => {
    if (!shifts || shifts.length === 0) return;
    // If user already picked a shift and it's still valid, keep it.
    const currentValid = formData.shift && shifts.some(s =>
      s.id === formData.shift && getShiftAvailability(s.id) && (s.is_available !== false)
    );
    if (currentValid) return;
    // Pick the FIRST available shift in the list (shifts come ordered morning -> evening).
    const availableShifts = shifts.filter(s => getShiftAvailability(s.id) && (s.is_available !== false));
    if (availableShifts.length === 0) return;
    const earliest = availableShifts[0];
    setFormData(prev => ({ ...prev, shift: earliest.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, formData.date]);

  const calculateTotal = () => {
    // Task 4: For package bookings, use the package's total price directly
    if (selectedPackage) {
      const pkgPrice = selectedPackage.total_price || selectedPackage.total_discounted || selectedPackage.package_price || 0;
      if (pkgPrice > 0) {
        setTotalAmount(pkgPrice);
        return;
      }
    }
    if (formData.selectedServices.length === 0) {
      setTotalAmount(0);
      return;
    }
    let total = 0;
    const serviceList = (fastestAvailable || formData.barberId === 'any') ? salonServices : barberServices;
    formData.selectedServices.forEach(serviceId => {
      const service = serviceList.find(s => s.id === serviceId);
      if (service) {
        total += (fastestAvailable || formData.barberId === 'any') 
          ? service.base_price 
          : (service.barber_price || service.base_price);
      }
    });
    setTotalAmount(total);
  };

  const handleServiceToggle = (serviceId) => {
    setFormData(prev => ({
      ...prev,
      selectedServices: prev.selectedServices.includes(serviceId)
        ? prev.selectedServices.filter(id => id !== serviceId)
        : [...prev.selectedServices, serviceId]
    }));
  };

  const handleBarberSelect = (barberId) => {
    setFastestAvailable(false);
    setFormData(prev => ({ ...prev, barberId }));
  };

  // Check if any selected service has price_type='onwards' → force Pay at Salon
  const hasOnwardsSelected = (() => {
    if (formData.selectedServices.length === 0) return false;
    const serviceList = (fastestAvailable || formData.barberId === 'any') ? salonServices : barberServices;
    return formData.selectedServices.some(sid => {
      const svc = serviceList.find(s => s.id === sid);
      return svc && svc.price_type === 'onwards';
    });
  })();

  // Auto-switch to pay_at_salon when an onwards service is selected and another mode was active
  useEffect(() => {
    if (hasOnwardsSelected && paymentMode && paymentMode !== 'pay_at_salon') {
      setPaymentMode('pay_at_salon');
      setUpiAppOpened(false);
      toast.info("'Pay at Salon' is the only option because you selected a service with price 'Onwards'.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOnwardsSelected]);

  const handleFastestAvailable = () => {
    setFastestAvailable(true);
    setFormData(prev => ({ ...prev, barberId: 'any' }));
  };

  const getServicePrice = (service) => {
    return (fastestAvailable || formData.barberId === 'any') 
      ? service.base_price 
      : (service.barber_price || service.base_price);
  };

  // Persist the current selection into BookingIntent (sessionStorage, 30-min TTL)
  // so that signing in mid-flow doesn't lose the cart.
  const persistIntent = () => {
    saveIntent({
      salon_id: salonId,
      branch_id: branchId || null,
      services: formData.selectedServices,
      barber_id: fastestAvailable ? 'any' : formData.barberId,
      date: formData.date,
      shift: formData.shift,
      return_to: `/book/${salonId}${branchId ? `?branch=${branchId}` : ''}`,
    });
  };

  // Resolve a customer record before placing the booking. If the user is already
  // signed in, we just return the user. Otherwise we register a lightweight
  // (non-OTP) customer using the guest identity form.
  const ensureCustomer = async () => {
    if (isUserLoggedIn && user?.id) return user;

    // Booking-for-others doesn't need the booker to be signed in either — but
    // we still need SOME identity to attach the booking to. Use guest fields.
    const name = (guestName || '').trim();
    const phoneDigits = (guestPhone || '').replace(/\D/g, '').replace(/^91/, '');
    if (!name) { toast.error('Please enter your name'); return null; }
    if (phoneDigits.length !== 10) { toast.error('Please enter a valid 10-digit mobile number'); return null; }
    if (!guestGender) { toast.error('Please select your gender'); return null; }

    const result = await loginUser(name, phoneDigits, guestGender);
    if (!result.success) {
      toast.error(result.error || 'Could not register your details. Please try again.');
      return null;
    }
    return result.user;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    if (!formData.shift) {
      toast.error('Please select a time slot');
      return;
    }

    if (formData.selectedServices.length === 0) {
      toast.error('Please select at least one service');
      return;
    }

    if (!paymentMode) {
      toast.error('Please select a payment mode');
      return;
    }

    // Wallet balance check
    if (paymentMode === 'wallet') {
      const walletBalance = customerMembership?.wallet_balance || 0;
      if (walletBalance < payableAmount) {
        toast.error(`Insufficient wallet balance. Available: ₹${walletBalance}, Required: ₹${payableAmount}`);
        return;
      }
    }

    setLoading(true);

    try {
      // Reschedule/modify existing booking (opened via WhatsApp reschedule link)
      if (modifyTokenId) {
        const body = {
          selected_services: formData.selectedServices,
          barber_id: fastestAvailable ? 'any' : formData.barberId,
          date: formData.date,
          shift: formData.shift,
          payment_mode: paymentMode,
        };
        const response = await axios.put(`${API}/tokens/${modifyTokenId}/customer-reschedule`, body);
        setBookedToken(response.data.token || { id: modifyTokenId });
        setBookingStep('success');
        toast.success('Booking updated successfully!');
        return;
      }

      // Frictionless flow — make sure we have a customer record (existing or newly
      // created lightweight one). Returns the user object (or throws).
      const customer = await ensureCustomer();
      if (!customer) { setLoading(false); return; }

      const bookingData = {
        salon_id: salonId,
        branch_id: branchId || undefined,
        user_id: customer.id,
        customer_name: bookingForSelf ? customer.name : otherPersonName,
        phone: bookingForSelf ? customer.phone : otherPersonPhone,
        date: formData.date,
        shift: formData.shift,
        barber_id: fastestAvailable ? 'any' : formData.barberId,
        selected_services: formData.selectedServices,
        source: source,
        booking_type: formData.bookingType,
        booking_for_self: bookingForSelf,
        customer_gender: bookingForSelf ? (customer.gender || guestGender || 'Men') : otherPersonGender,
        is_guest: !isUserLoggedIn && bookingMode === 'guest',
        coupon_code: appliedCoupon?.code || null,
        points_redeem: (usePoints && customerPoints?.can_redeem) ? customerPoints.points : 0,
        payment_mode: paymentMode
      };

      const response = await axios.post(`${API}/bookings`, bookingData);
      setBookedToken(response.data);
      setBookingStep('success');
      clearIntent();

      // Save phone in localStorage for smart routing on the customer's next visit.
      try {
        const phoneToStore = customer?.phone || (guestPhone ? `+91${guestPhone}` : '');
        if (phoneToStore) localStorage.setItem('customer_phone', phoneToStore);
      } catch (_) { /* noop */ }
      
      // Refresh membership data if wallet was used
      if (paymentMode === 'wallet') {
        fetchCustomerMembership();
      }
      
      toast.success('Booking confirmed!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create booking');
    } finally {
      setLoading(false);
    }
  };

  // Add bookingStep state
  const [bookingStep, setBookingStep] = useState('services'); // 'services' | 'payment' | 'success'

  // In-app gateway payment (Cashfree Easy Split). Creates the booking first so
  // we have a token to attach the payment to, then opens the hosted checkout.
  // The webhook flips the token to paid; the callback page confirms to the customer.
  const handleOnlinePay = async () => {
    if (!formData.shift) { toast.error('Please select a time slot'); return; }
    if (formData.selectedServices.length === 0) { toast.error('Please select at least one service'); return; }

    setOnlinePayLoading(true);
    try {
      // 1) Ensure a customer record, then create the booking (pending payment).
      let tokenId = modifyTokenId;
      if (modifyTokenId) {
        const body = {
          selected_services: formData.selectedServices,
          barber_id: fastestAvailable ? 'any' : formData.barberId,
          date: formData.date,
          shift: formData.shift,
          payment_mode: 'online',
        };
        const resp = await axios.put(`${API}/tokens/${modifyTokenId}/customer-reschedule`, body);
        tokenId = resp.data?.token?.id || modifyTokenId;
      } else {
        const customer = await ensureCustomer();
        if (!customer) { setOnlinePayLoading(false); return; }
        const bookingData = {
          salon_id: salonId,
          branch_id: branchId || undefined,
          user_id: customer.id,
          customer_name: bookingForSelf ? customer.name : otherPersonName,
          phone: bookingForSelf ? customer.phone : otherPersonPhone,
          date: formData.date,
          shift: formData.shift,
          barber_id: fastestAvailable ? 'any' : formData.barberId,
          selected_services: formData.selectedServices,
          source: source,
          booking_type: formData.bookingType,
          booking_for_self: bookingForSelf,
          customer_gender: bookingForSelf ? (customer.gender || guestGender || 'Men') : otherPersonGender,
          is_guest: !isUserLoggedIn && bookingMode === 'guest',
        coupon_code: appliedCoupon?.code || null,
        points_redeem: (usePoints && customerPoints?.can_redeem) ? customerPoints.points : 0,
          payment_mode: 'online',
        };
        const resp = await axios.post(`${API}/bookings`, bookingData);
        setBookedToken(resp.data);
        tokenId = resp.data?.id;
      }

      if (!tokenId) { toast.error('Could not create booking. Please try again.'); setOnlinePayLoading(false); return; }

      // 2) Create the split order.
      let orderRes;
      try {
        orderRes = await axios.post(`${API}/service-payments/create-order`, { token_id: tokenId });
      } catch (err) {
        // 409 → salon KYC not complete. Fall back gracefully.
        if (err?.response?.status === 409) {
          setInAppPayEnabled(false);
          setPaymentMode('pay_at_salon');
          toast.error('Online payment unavailable for this salon. Please choose Wallet or Pay at Salon.');
          setOnlinePayLoading(false);
          return;
        }
        throw err;
      }

      const { payment_session_id, order_id, cashfree_env } = orderRes.data || {};
      if (!payment_session_id) { toast.error('Could not initiate payment. Please try again.'); setOnlinePayLoading(false); return; }

      // Marker so the callback page can verify.
      try {
        localStorage.setItem('salonhub_pending_service_payment', JSON.stringify({ order_id, token_id: tokenId, salon_id: salonId, ts: Date.now() }));
      } catch (_) { /* noop */ }

      // eslint-disable-next-line no-undef
      if (typeof Cashfree === 'undefined') { toast.error('Payment SDK not loaded. Please refresh and retry.'); setOnlinePayLoading(false); return; }
      // eslint-disable-next-line no-undef
      const cashfree = Cashfree({ mode: (cashfree_env || 'TEST').toLowerCase() === 'prod' ? 'production' : 'sandbox' });
      cashfree.checkout({
        paymentSessionId: payment_session_id,
        redirectTarget: '_self',
        returnUrl: `${window.location.origin}/pay/callback?order_id=${encodeURIComponent(order_id)}`,
      });
      // Browser navigates away after redirectTarget=_self.
    } catch (err) {
      console.error('Online pay error', err);
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : (err.message || 'Payment could not be started'));
      setOnlinePayLoading(false);
    }
  };

  // UPI intent handler
  const handleUpiIntent = () => {
    if (!salon?.upi_id) {
      toast.error('Salon UPI ID not configured');
      return;
    }
    const upiUrl = `upi://pay?pa=${salon.upi_id}&pn=${encodeURIComponent(salon.salon_name)}&am=${payableAmount}&cu=INR&tn=Booking_${salonId.slice(0,8)}`;
    window.location.href = upiUrl;
    // Mark that UPI app was opened
    setUpiAppOpened(true);
  };

  // Handle UPI confirmation by customer
  const handleUpiConfirm = async () => {
    setLoading(true);
    try {
      // Reschedule path — update SAME token instead of creating a new one
      if (modifyTokenId) {
        const body = {
          selected_services: formData.selectedServices,
          barber_id: fastestAvailable ? 'any' : formData.barberId,
          date: formData.date,
          shift: formData.shift,
          payment_mode: 'upi',
        };
        const response = await axios.put(`${API}/tokens/${modifyTokenId}/customer-reschedule`, body);
        await axios.post(`${API}/payments/customer-confirm-upi`, {
          token_id: modifyTokenId,
          upi_reference: 'Customer confirmed'
        });
        setBookedToken(response.data.token || { id: modifyTokenId });
        setBookingStep('success');
        toast.success('Booking updated with UPI payment!');
        return;
      }

      // First create the booking
      const customer = await ensureCustomer();
      if (!customer) { setLoading(false); return; }
      const bookingData = {
        salon_id: salonId,
        branch_id: branchId || undefined,
        user_id: customer.id,
        customer_name: bookingForSelf ? customer.name : otherPersonName,
        phone: bookingForSelf ? customer.phone : otherPersonPhone,
        date: formData.date,
        shift: formData.shift,
        barber_id: fastestAvailable ? 'any' : formData.barberId,
        selected_services: formData.selectedServices,
        source: source,
        booking_type: formData.bookingType,
        booking_for_self: bookingForSelf,
        customer_gender: bookingForSelf ? (customer.gender || guestGender || 'Men') : otherPersonGender,
        is_guest: !isUserLoggedIn && bookingMode === 'guest',
        coupon_code: appliedCoupon?.code || null,
        points_redeem: (usePoints && customerPoints?.can_redeem) ? customerPoints.points : 0,
        payment_mode: 'upi'
      };

      const response = await axios.post(`${API}/bookings`, bookingData);
      
      // Confirm UPI payment on the token
      await axios.post(`${API}/payments/customer-confirm-upi`, {
        token_id: response.data.id,
        upi_reference: 'Customer confirmed'
      });

      setBookedToken(response.data);
      setBookingStep('success');
      clearIntent();
      toast.success('Booking confirmed with UPI payment!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create booking');
    } finally {
      setLoading(false);
    }
  };

  // Task 4: Direct package booking — bypasses payment step, defaults to pay_at_salon
  const handlePackageBookingDirect = async () => {
    if (!selectedPackage) return;
    if (formData.selectedServices.length === 0) {
      toast.error('Please select a package');
      return;
    }
    if (!formData.date) {
      toast.error('Please pick a date');
      return;
    }
    // If user isn't logged in AND guest details not filled, route through payment step
    // so the existing guest-details UI can capture name + phone first.
    if (!isUserLoggedIn && bookingMode !== 'guest') {
      // Pre-set pay_at_salon as the chosen mode for package bookings
      setPaymentMode('pay_at_salon');
      setBookingStep('payment');
      return;
    }
    if (!isUserLoggedIn && bookingMode === 'guest' && (!guestPhone || !guestName)) {
      setPaymentMode('pay_at_salon');
      setBookingStep('payment');
      return;
    }
    setLoading(true);
    try {
      const customer = await ensureCustomer();
      if (!customer) { setLoading(false); return; }

      const bookingData = {
        salon_id: salonId,
        branch_id: branchId || undefined,
        user_id: customer.id,
        customer_name: bookingForSelf ? customer.name : otherPersonName,
        phone: bookingForSelf ? customer.phone : otherPersonPhone,
        date: formData.date,
        shift: formData.shift || shifts[0]?.id || 'morning',
        barber_id: fastestAvailable ? 'any' : (formData.barberId || 'any'),
        selected_services: formData.selectedServices,
        source: source,
        booking_type: formData.bookingType || 'future',
        booking_for_self: bookingForSelf,
        customer_gender: bookingForSelf ? (customer.gender || guestGender || 'Men') : otherPersonGender,
        is_guest: !isUserLoggedIn && bookingMode === 'guest',
        coupon_code: appliedCoupon?.code || null,
        points_redeem: (usePoints && customerPoints?.can_redeem) ? customerPoints.points : 0,
        payment_mode: 'pay_at_salon',
      };
      const response = await axios.post(`${API}/bookings`, bookingData);
      setBookedToken({ ...response.data, _is_package_booking: true });
      setBookingStep('success');
      clearIntent();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to book package');
    } finally {
      setLoading(false);
    }
  };

  // Proceed to payment step
  const goToPayment = () => {
    // Task 4: If a package is selected, skip payment step and book directly
    if (selectedPackage) {
      handlePackageBookingDirect();
      return;
    }
    if (!formData.shift) {
      toast.error('Please select a time slot');
      return;
    }
    if (formData.selectedServices.length === 0) {
      toast.error('Please select at least one service');
      return;
    }
    if (!bookingForSelf) {
      if (!otherPersonName || !otherPersonPhone) {
        toast.error('Please enter name and phone for the person');
        return;
      }
      if (!otherPersonGender) {
        toast.error('Please select gender for the person');
        return;
      }
    }
    setBookingStep('payment');
  };

  // Success Screen
  if (bookingStep === 'success' && bookedToken) {
    const isPkgBooking = bookedToken._is_package_booking || !!selectedPackage;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full"
        >
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.2 }}
            >
              <CheckCircle className="w-20 h-20 text-brass mx-auto mb-4" />
            </motion.div>
            <h2 className="text-3xl font-fraunces font-medium text-foreground">
              {isPkgBooking ? 'Thanks for booking!' : "You're All Set!"}
            </h2>
            {isPkgBooking && (
              <p className="text-muted-foreground text-sm mt-2 leading-relaxed" data-testid="package-thanks-message">
                The salon will call you soon to confirm your slot.
              </p>
            )}
          </div>

          <div className="lux-card bg-card border border-border rounded-2xl p-6 shadow-xl">
            {!isPkgBooking && (
              <div className="text-center mb-6">
                <p className="text-muted-foreground text-sm mb-1">Your Token</p>
                <div className="text-6xl font-bebas brass-text">{bookedToken.token_number}</div>
              </div>
            )}

            <div className="space-y-3 text-sm border-t border-border pt-4">
              {isPkgBooking && selectedPackage && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Package</span>
                  <span className="font-bold text-foreground">{selectedPackage.package_name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-bold text-foreground">{formData.date}</span>
              </div>
              {!isPkgBooking && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shift</span>
                    <span className="font-bold text-foreground">{bookedToken.shift}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Barber</span>
                    <span className="font-bold text-foreground">{bookedToken.barber_name}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-border pt-3">
                <span className="text-muted-foreground">Payment</span>
                <span className="font-bold text-foreground capitalize">
                  {isPkgBooking ? 'At salon' : (paymentMode || 'Pending')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="text-xl font-bold brass-text">₹{bookedToken.total_amount}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button onClick={() => navigate(`/salon/${salonId}`)} className="flex-1 bg-brass text-espresso hover:bg-brass-hover">
              Back to Salon
            </Button>
            <Button onClick={() => navigate('/history')} variant="outline" className="flex-1">
              My Bookings
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  const services = (fastestAvailable || formData.barberId === 'any') ? salonServices : barberServices;
  
  // Gender filter: show services matching customer gender + Unisex
  // gender_tag stored as 'Men'/'Women'/'Unisex'; user.gender may be 'male'/'female'/'Men'/'Women'.
  const customerGender = (user?.gender || '').toLowerCase();
  const normalizedGender = (customerGender === 'male' || customerGender === 'men' || customerGender === 'm') ? 'men'
                         : (customerGender === 'female' || customerGender === 'women' || customerGender === 'w' || customerGender === 'f') ? 'women'
                         : '';
  const genderFilteredServices = services.filter(s => {
    const tag = (s.gender_tag || 'Unisex').toLowerCase();
    if (tag === 'unisex') return true;
    if (!normalizedGender) return true; // Show all if gender not set
    return tag === normalizedGender;
  });

  // Filter and group services
  const filteredServices = genderFilteredServices.filter(s => 
    s.service_name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const groupedServices = filteredServices.reduce((acc, service) => {
    const category = svcBucket(service);
    if (!acc[category]) acc[category] = [];
    acc[category].push(service);
    return acc;
  }, {});

  // ========== PAYMENT STEP ==========
  if (bookingStep === 'payment') {
    const walletBalance = customerMembership?.wallet_balance || 0;
    const hasWallet = !!customerMembership && walletBalance > 0;
    const walletSufficient = hasWallet && walletBalance >= payableAmount;

    return (
      <div className="min-h-screen bg-background pb-32">
        {/* Header */}
        <div className="bg-card border-b border-border sticky top-0 z-20">
          <div className="max-w-2xl mx-auto flex items-center p-3 gap-3">
            <button onClick={() => { setBookingStep('services'); setPaymentMode(''); setUpiAppOpened(false); }} className="p-2 rounded-full hover:bg-muted">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <div className="flex-1">
              <span className="font-bold text-foreground">Select Payment</span>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto p-4 space-y-5">
          {/* Order Summary */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Order Summary</h3>
            <div className="space-y-2">
              {formData.selectedServices.map(sid => {
                const svc = [...salonServices, ...barberServices].find(s => s.id === sid);
                return svc ? (
                  <div key={sid} className="flex justify-between text-sm">
                    <span className="text-foreground">{svc.service_name}</span>
                    <span className="font-medium text-foreground">₹{getServicePrice(svc)}</span>
                  </div>
                ) : null;
              })}
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="font-medium text-foreground">Subtotal</span>
                <span className="font-medium text-foreground">₹{totalAmount}</span>
              </div>
              {membershipDiscount > 0 && (
                <div className="flex justify-between text-sm text-green-600 dark:text-green-400 font-medium" data-testid="summary-membership-discount">
                  <span>Membership {customerMembership?.membership_name ? `(${customerMembership.membership_name})` : ''} — {membershipDiscountPct}% off</span>
                  <span>− ₹{membershipDiscount}</span>
                </div>
              )}
              {effCouponDiscount > 0 && (
                <div className="flex justify-between text-sm text-green-600 dark:text-green-400 font-medium" data-testid="summary-coupon-discount">
                  <span>Coupon {appliedCoupon?.code ? `(${appliedCoupon.code})` : ''}</span>
                  <span>− ₹{effCouponDiscount}</span>
                </div>
              )}
              {pointsDiscount > 0 && (
                <div className="flex justify-between text-sm text-green-600 dark:text-green-400 font-medium" data-testid="summary-points-discount">
                  <span>Loyalty points</span>
                  <span>− ₹{pointsDiscount}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="font-bold text-foreground">Total payable</span>
                <span className="text-xl font-bold text-gold" data-testid="summary-payable">₹{payableAmount}</span>
              </div>
            </div>
          </div>

          {/* Login/Guest choice is now shown as a bottom-sheet AFTER the user
              taps "Confirm Booking" (see BookingIdentitySheet below).
              The inline chooser + guest form + login-pending helper card that
              used to live here have been removed on purpose so the payment
              page stays clean — the sheet is now the single source of truth. */}

          {/* Coupon Code */}
          <div className="bg-card border border-border rounded-xl p-4" data-testid="customer-coupon-card">
            {availableCoupons.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Available offers</p>
                <div className="flex flex-wrap gap-2">
                  {availableCoupons.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => applyCustomerCoupon(c.code)}
                      data-testid={`customer-coupon-chip-${c.code}`}
                      className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${appliedCoupon?.code === c.code ? 'border-gold bg-gold/15 text-gold' : 'border-dashed border-gold/60 text-gold hover:bg-gold/10'}`}
                      title={c.description || c.title}
                    >
                      {c.code} · {c.type === 'percent' ? `${c.value}% off` : `₹${c.value} off`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); if (couponError) setCouponError(''); }}
                  placeholder="Enter coupon code"
                  data-testid="customer-coupon-input"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold/50"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={couponBusy}
                data-testid="customer-coupon-apply"
                className="border-gold text-gold hover:bg-gold/10"
                onClick={() => applyCustomerCoupon()}
              >
                {couponBusy ? '…' : (appliedCoupon ? 'Re-apply' : 'Apply')}
              </Button>
            </div>
            {appliedCoupon && (
              <div className="mt-2 flex items-center justify-between text-sm text-green-600 dark:text-green-400 font-medium" data-testid="customer-coupon-applied">
                <span>Coupon <b>{appliedCoupon.code}</b> applied — you save ₹{couponDiscount}</span>
                <button type="button" className="text-xs underline text-muted-foreground" onClick={() => { setAppliedCoupon(null); setCouponDiscount(0); setCouponCode(''); }} data-testid="customer-coupon-remove">Remove</button>
              </div>
            )}
            {couponError && !appliedCoupon && (
              <div className="mt-2 text-sm font-medium text-red-500" data-testid="customer-coupon-error">{couponError}</div>
            )}
          </div>

          {/* Loyalty points redeem */}
          {customerPoints && customerPoints.config?.points_enabled && customerPoints.points > 0 && (
            <label className="bg-card border border-gold/40 rounded-xl p-4 flex items-center justify-between gap-3 cursor-pointer" data-testid="loyalty-redeem-checkout">
              <div>
                <p className="text-sm font-semibold text-foreground">Use loyalty points</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You have <b className="text-gold">{customerPoints.points} pts</b> (₹{customerPoints.redeemable_value})
                  {!customerPoints.can_redeem && ` · need ${customerPoints.config.points_min_redeem} pts to redeem`}
                </p>
              </div>
              <input
                type="checkbox"
                checked={usePoints}
                disabled={!customerPoints.can_redeem}
                onChange={(e) => setUsePoints(e.target.checked)}
                data-testid="loyalty-redeem-toggle"
                className="w-5 h-5 accent-gold"
              />
            </label>
          )}

          {/* Payment Options */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Choose Payment Method</h3>
            {hasOnwardsSelected && (
              <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">
                One or more selected services are priced as <strong>"Onwards"</strong>. Final price will be decided at the salon, so only <strong>Pay at Salon</strong> is available.
              </div>
            )}
            <div className="space-y-3">
              {/* Pay Online (Cashfree Easy Split) — only when the salon has completed KYC */}
              {!hasOnwardsSelected && inAppPayEnabled && (
              <motion.button
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => { setPaymentMode('online'); setUpiAppOpened(false); }}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center gap-4 ${
                  paymentMode === 'online' ? 'bg-gold/10 border-gold shadow-md' : 'bg-card border-border hover:border-gold/40'
                }`}
                data-testid="payment-mode-online"
              >
                <div className="p-3 bg-blue-500/10 rounded-full">
                  <Smartphone className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-foreground">Pay Online</p>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded uppercase tracking-wide">UPI first</span>
                  </div>
                  <p className="text-xs text-muted-foreground">UPI · Card · Netbanking · secured by Cashfree</p>
                </div>
                {paymentMode === 'online' && (
                  <div className="w-6 h-6 bg-gold rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-black" />
                  </div>
                )}
              </motion.button>
              )}

              {/* Wallet */}
              {!hasOnwardsSelected && (
              <motion.button
                type="button"
                whileHover={hasWallet ? { scale: 1.01 } : {}}
                whileTap={hasWallet ? { scale: 0.99 } : {}}
                onClick={() => {
                  if (!hasWallet) return;
                  if (!walletSufficient) {
                    toast.error(`Insufficient balance. Available: ₹${walletBalance}, Required: ₹${payableAmount}`);
                    return;
                  }
                  // Require OTP verification for wallet payment
                  if (!isUserOtpVerified) {
                    setShowOtpModal(true);
                    return;
                  }
                  setPaymentMode('wallet');
                  setUpiAppOpened(false);
                }}
                disabled={!hasWallet}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center gap-4 ${
                  !hasWallet
                    ? 'bg-muted/30 border-border/50 opacity-50 cursor-not-allowed'
                    : paymentMode === 'wallet'
                    ? 'bg-gold/10 border-gold shadow-md'
                    : !walletSufficient
                    ? 'bg-red-50 dark:bg-red-500/5 border-red-200 dark:border-red-500/30'
                    : 'bg-card border-border hover:border-gold/40'
                }`}
                data-testid="payment-mode-wallet"
              >
                <div className="p-3 bg-gold/10 rounded-full">
                  <Wallet className="w-6 h-6 text-gold" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-foreground">Wallet</p>
                  {hasWallet ? (
                    <>
                      <p className={`text-xs ${walletSufficient ? 'text-green-600' : 'text-red-500'}`}>
                        Balance: ₹{walletBalance} {!walletSufficient && '(Insufficient)'}
                      </p>
                      {!isUserOtpVerified && walletSufficient && (
                        <p className="text-xs text-amber-500 flex items-center gap-1 mt-0.5">
                          <Shield className="w-3 h-3" /> OTP required
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No active wallet</p>
                  )}
                </div>
                {paymentMode === 'wallet' && (
                  <div className="w-6 h-6 bg-gold rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-black" />
                  </div>
                )}
              </motion.button>
              )}

              {/* Pay at Salon — cash or UPI at the counter, not through the platform */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => { setPaymentMode('pay_at_salon'); setUpiAppOpened(false); }}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center gap-4 ${
                  paymentMode === 'pay_at_salon' ? 'bg-gold/10 border-gold shadow-md' : 'bg-card border-border hover:border-gold/40'
                }`}
                data-testid="payment-mode-pay-at-salon"
              >
                <div className="p-3 bg-purple-500/10 rounded-full">
                  <Banknote className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-foreground">Pay at Salon</p>
                  <p className="text-xs text-muted-foreground">Cash or UPI at the salon counter after your service</p>
                </div>
                {paymentMode === 'pay_at_salon' && (
                  <div className="w-6 h-6 bg-gold rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-black" />
                  </div>
                )}
              </motion.button>
            </div>
          </div>

          {/* Wallet Deduction Summary */}
          {paymentMode === 'wallet' && walletSufficient && (
            <div className="p-4 bg-gold/10 border border-gold/30 rounded-xl">
              <div className="flex justify-between items-center">
                <span className="text-sm text-foreground">Wallet Balance</span>
                <span className="font-bold text-gold">₹{walletBalance}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-sm text-foreground">Booking Amount</span>
                <span className="font-bold text-red-500">- ₹{payableAmount}</span>
              </div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-gold/20">
                <span className="text-sm font-medium text-foreground">Balance After</span>
                <span className="font-bold text-gold">₹{walletBalance - payableAmount}</span>
              </div>
            </div>
          )}

          {/* Pay-Online info */}
          {paymentMode === 'online' && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <p className="text-xs text-foreground">
                <span className="font-bold">Secure checkout</span> — pay by UPI, card or netbanking.
                Your booking will be confirmed the moment payment succeeds.
              </p>
            </div>
          )}
        </div>

        {/* Sticky Footer - Single Button that changes based on payment mode */}
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 z-30">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-foreground text-sm">{formData.selectedServices.length} service(s)</span>
              <span className="text-2xl font-bold text-gold">₹{payableAmount}</span>
            </div>
            {paymentMode === 'online' ? (
              <Button
                type="button"
                onClick={handleOnlinePay}
                disabled={onlinePayLoading}
                className="w-full bg-blue-600 text-white hover:bg-blue-700 py-5 text-base font-bold rounded-xl disabled:opacity-50"
                data-testid="online-pay-btn"
              >
                {onlinePayLoading ? 'Starting secure payment…' : (
                  <>
                    <Smartphone className="w-5 h-5 mr-2" />
                    Pay ₹{payableAmount} Securely
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  // Logged-in users go straight through. Everyone else sees
                  // the identity sheet with "Send OTP" or "Continue as Guest".
                  if (isUserLoggedIn) { handleSubmit(); return; }
                  setShowIdentitySheet(true);
                }}
                disabled={loading || !paymentMode || (paymentMode === 'wallet' && !walletSufficient)}
                className="w-full bg-gold text-black hover:bg-gold/90 py-5 text-base font-bold rounded-xl disabled:opacity-50"
                data-testid="confirm-booking-btn"
              >
                {(() => {
                  if (loading) return 'Booking...';
                  if (paymentMode === 'wallet') return `Pay ₹${payableAmount} from Wallet`;
                  return 'Confirm Booking';
                })()}
              </Button>
            )}
          </div>
        </div>

        {/* Customer Auth Modal — opened when user picks "Login to Book". */}
        <CustomerAuthModal
          open={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            setShowAuthModal(false);
            setBookingMode(null);
            // Item 10 — If the user logged in *from the sheet*, auto-continue to confirm.
            if (autoSubmitAfterLogin) {
              setAutoSubmitAfterLogin(false);
              setTimeout(() => handleSubmit(), 0);
            }
          }}
        />

        {/* Item 10 — Post-confirm identity sheet */}
        <BookingIdentitySheet
          open={showIdentitySheet}
          onClose={() => setShowIdentitySheet(false)}
          totalAmount={totalAmount}
          guestName={guestName} setGuestName={setGuestName}
          guestPhone={guestPhone} setGuestPhone={setGuestPhone}
          guestGender={guestGender} setGuestGender={setGuestGender}
          onChooseLogin={() => {
            setShowIdentitySheet(false);
            setBookingMode('login');
            setAutoSubmitAfterLogin(true);
            setShowAuthModal(true);
          }}
          onConfirmGuest={() => {
            setBookingMode('guest');
            setShowIdentitySheet(false);
            setTimeout(() => handleSubmit(), 0);
          }}
          loading={loading}
        />
      </div>
    );
  }

  // ========== SERVICES STEP (Main booking form) ==========
  // Compute salon-closed state for booking blocking UI
  const _mt = salon?.manual_toggle || {};
  const _isQrSource = ['qr', 'qr_scan', 'qr_walkin'].includes((source || '').toLowerCase());
  const _bookingBlocked = _mt.is_overridden && !_mt.is_open && (
    _mt.closed_mode === 'full' || (_mt.closed_mode === 'online_only' && !_isQrSource)
  );
  const _closedFull = _mt.is_overridden && !_mt.is_open && _mt.closed_mode === 'full';
  const _closedOnline = _mt.is_overridden && !_mt.is_open && _mt.closed_mode === 'online_only' && !_isQrSource;

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Compact Header */}
      <div className="bg-card border-b border-border sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center p-3 gap-3">
          <button onClick={() => navigate(`/salon/${salonId}`)} className="p-2 rounded-full hover:bg-muted">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            {salon?.logo_url ? (
              <img src={salon.logo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-gold" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center">
                <Scissors className="w-4 h-4 text-gold" />
              </div>
            )}
            <span className="font-bold text-foreground truncate">{salon?.salon_name}</span>
          </div>
          <button onClick={() => navigate(`/salon/${salonId}`)} className="p-2 rounded-full hover:bg-muted">
            <Home className="w-5 h-5 text-gold" />
          </button>
        </div>
      </div>

      {/* Closed banner */}
      {_bookingBlocked && (
        <div className={`max-w-2xl mx-auto mt-4 px-4`}>
          <div className={`flex items-start gap-3 p-4 rounded-xl border-2 ${
            _closedFull
              ? 'bg-red-50 border-red-300 text-red-800'
              : 'bg-amber-50 border-amber-300 text-amber-800'
          }`}>
            <div className={`w-3 h-3 mt-1 rounded-full ${_closedFull ? 'bg-red-500' : 'bg-amber-500'}`} />
            <div className="text-sm leading-tight">
              <p className="font-bold mb-1">
                {_closedFull ? 'Salon is currently closed' : 'Closed Online — Visit Salon'}
              </p>
              <p className="text-xs opacity-90">
                {_closedFull
                  ? 'Bookings are not being accepted right now. Please try again later.'
                  : 'Online bookings are temporarily paused. Please visit the salon — walk-ins are welcome.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); goToPayment(); }} className="max-w-2xl mx-auto p-4 space-y-5 pb-32">

        {/* Reschedule banner — shown only when this page was opened via a
            WhatsApp reschedule link (?modify=<token_id>) */}
        {modifyTokenId && rescheduleBooking && (
          <div
            data-testid="reschedule-banner"
            className="flex items-center gap-3 p-3 rounded-xl border border-gold/40 bg-gold/10"
          >
            <Edit className="w-5 h-5 text-gold shrink-0" />
            <div className="text-sm leading-tight">
              <p className="font-bold text-foreground">
                Modifying booking #{rescheduleBooking.token_number}
              </p>
              <p className="text-xs text-muted-foreground">
                Changes will update the same booking — no new token will be created.
              </p>
            </div>
          </div>
        )}

        {/* === A3: SECTION 1 — WHEN (date + shift) === */}
        <div className="lux-card rounded-2xl bg-card border border-border p-4 space-y-4" data-testid="booking-section-when">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-[11px] font-bold ${
                (formData.date && formData.shift) ? 'bg-sage text-white' : 'bg-brass text-espresso'
              }`}>
                {(formData.date && formData.shift) ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : '1'}
              </span>
              <h3 className="font-fraunces text-lg font-medium text-foreground">When</h3>
            </div>
            {formData.date && formData.shift && (
              <span className="text-[11px] text-sage font-semibold uppercase tracking-wider">Set</span>
            )}
          </div>
          {/* Booking For — only shown when signed in (guest checkout = self only) */}
          {isUserLoggedIn && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Booking for</p>
            <div className="flex gap-2 flex-wrap">
              <SelectChip selected={bookingForSelf} onClick={() => setBookingForSelf(true)} icon={User}>
                Myself
              </SelectChip>
              <SelectChip selected={!bookingForSelf} onClick={() => setBookingForSelf(false)} icon={User}>
                Someone Else
              </SelectChip>
            </div>
          </div>
          )}

          {/* Someone Else Details */}
          <AnimatePresence>
            {!bookingForSelf && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <input
                    type="text"
                    value={otherPersonName}
                    onChange={(e) => setOtherPersonName(e.target.value)}
                    placeholder="Their name"
                    className="w-full p-3 bg-background border border-border rounded-lg text-foreground text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">+91</span>
                    <input
                      type="tel"
                      value={otherPersonPhone}
                      onChange={(e) => setOtherPersonPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Mobile number"
                      className="flex-1 p-3 bg-background border border-border rounded-lg text-foreground text-sm"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Gender</p>
                    <div className="flex gap-2">
                      {['Men', 'Women'].map(g => (
                        <SelectChip key={g} selected={otherPersonGender === g} onClick={() => setOtherPersonGender(g)}>
                          {g}
                        </SelectChip>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Date Chips */}
          <div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {(() => {
                const today = getTodayIST();
                const tomorrow = getTomorrowIST();
                const formatDateLabel = (yyyy_mm_dd) => {
                  // Render as "Mon, 22 Apr" using IST
                  const [y, m, d] = yyyy_mm_dd.split('-').map(Number);
                  const dt = new Date(Date.UTC(y, m - 1, d));
                  return dt.toLocaleDateString('en-IN', {
                    weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC'
                  });
                };
                const dateOptions = [
                  { label: 'Today', value: today, bookingType: 'instant' },
                  { label: 'Tomorrow', value: tomorrow, bookingType: 'future' }
                ];
                return dateOptions.map(opt => {
                  const isSelected = formData.date === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev, date: opt.value, shift: '', bookingType: opt.bookingType
                      }))}
                      className={`relative flex flex-col items-center justify-center px-4 py-2 rounded-2xl border-2 transition-all ${
                        isSelected
                          ? 'bg-gold text-black border-gold shadow-lg shadow-gold/20'
                          : 'bg-background text-foreground border-border hover:border-gold/50 active:scale-[0.98]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="font-semibold text-sm">{opt.label}</span>
                      </div>
                      <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-black/70' : 'text-muted-foreground'}`}>
                        {formatDateLabel(opt.value)}
                      </span>
                      {isSelected && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          {/* === Task 4: Calendar (future dates) when a Package is being booked === */}
          {selectedPackage ? (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Pick a date</p>
              <div className="lux-card rounded-xl bg-card border border-brass/30 p-3 flex items-center gap-3" data-testid="package-date-picker">
                <Calendar className="w-5 h-5 text-brass flex-shrink-0" strokeWidth={1.7} />
                <input
                  type="date"
                  min={getTodayIST()}
                  value={formData.date || getTodayIST()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setFormData(prev => ({
                      ...prev,
                      date: v,
                      // Set shift to first available so the booking goes through;
                      // salon will call to confirm exact timing.
                      shift: shifts[0]?.id || 'morning',
                      bookingType: v === getTodayIST() ? 'instant' : 'future',
                    }));
                  }}
                  className="flex-1 bg-transparent text-foreground text-sm font-medium focus:outline-none"
                  data-testid="package-date-input"
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                <span className="inline-flex items-center gap-1 text-brass font-semibold">
                  <Sparkles className="w-3 h-3" strokeWidth={2} /> Package booking
                </span>{' '}
                · The salon will call you to confirm a convenient time. No slot needed.
              </p>
            </div>
          ) : (
            /* Time Slot Chips - Always visible, greyed if unavailable */
            <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Time Slot</p>
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              {shifts.map(shift => {
                const isAvailable = getShiftAvailability(shift.id) && (shift.is_available !== false);
                const isSelected = formData.shift === shift.id;
                return (
                  <button
                    key={shift.id}
                    type="button"
                    onClick={() => isAvailable && setFormData(prev => ({ ...prev, shift: shift.id }))}
                    disabled={!isAvailable}
                    className={`relative flex flex-col items-center justify-center px-3 py-2 rounded-xl border-2 transition-all ${
                      !isAvailable
                        ? 'bg-muted/50 text-muted-foreground/50 border-border/50 cursor-not-allowed opacity-50'
                        : isSelected
                        ? 'bg-gold text-black border-gold shadow-lg shadow-gold/20'
                        : 'bg-background text-foreground border-border hover:border-gold/50 active:scale-[0.98]'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                      <Clock className="w-3.5 h-3.5" />
                      {shift.name}
                    </span>
                    {shift.time && (
                      <span className={`text-[10px] mt-0.5 leading-none ${
                        isSelected ? 'text-black/75' : 'text-muted-foreground'
                      }`}>
                        {shift.time}
                      </span>
                    )}
                    {isSelected && isAvailable && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {formData.date === getTodayIST() && !shifts.some(s => getShiftAvailability(s.id)) && (
              <p className="text-xs text-orange-500 mt-2">All slots passed for today. Select tomorrow.</p>
            )}
          </div>
          )}
        </div>

        {/* === A3: SECTION 2 — BARBER === */}
        <div className="lux-card rounded-2xl bg-card border border-border p-4 space-y-3" data-testid="booking-section-barber">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-[11px] font-bold ${
                (formData.barberId || fastestAvailable) ? 'bg-sage text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {(formData.barberId || fastestAvailable) ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : '2'}
              </span>
              <h3 className="font-fraunces text-lg font-medium text-foreground">Barber</h3>
            </div>
            <button
              type="button"
              onClick={handleFastestAvailable}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                fastestAvailable 
                  ? 'bg-brass text-espresso border border-brass' 
                  : 'bg-muted text-muted-foreground border border-transparent hover:border-brass/40'
              }`}
              data-testid="fastest-available-btn"
            >
              <Zap className="w-3.5 h-3.5" />
              Fastest
              {fastestAvailable && <span className="w-1.5 h-1.5 bg-espresso rounded-full animate-pulse"></span>}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {barbers.map(barber => (
              <BarberChip
                key={barber.id}
                barber={barber}
                selected={!fastestAvailable && formData.barberId === barber.id}
                onSelect={handleBarberSelect}
                liveStatus={liveStatus}
                slotAvailability={slotAvailability}
              />
            ))}
          </div>
          
          {/* Show if all slots are full */}
          {slotAvailability?.all_slots_full && formData.shift && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-sm text-red-500 font-medium text-center">
                All slots are booked for this time. Please select a different time slot.
              </p>
            </div>
          )}
        </div>

        {/* === A3: SECTION 3 — SERVICES === */}
        <div className="lux-card rounded-2xl bg-card border border-border p-4 space-y-4" data-testid="booking-section-services">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-[11px] font-bold ${
                formData.selectedServices.length > 0 ? 'bg-sage text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {formData.selectedServices.length > 0 ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : '3'}
              </span>
              <h3 className="font-fraunces text-lg font-medium text-foreground">Services</h3>
            </div>
            {formData.selectedServices.length > 0 && (
              <span className="text-[11px] bg-brass-soft text-foreground border border-brass/40 px-2 py-1 rounded-full font-medium">
                {formData.selectedServices.length} added · ₹{totalAmount}
              </span>
            )}
          </div>
          
          {/* Horizontal Scrollable Category Filter with Thumbnails - dynamically filtered */}
          <div className="relative">
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {categories
                .filter(cat => {
                  // Hide "Favorites" if customer has no recent services
                  if (cat._isFavorites && (!recentServices || recentServices.length === 0)) {
                    return false;
                  }
                  // Hide "Packages" if there are no packages available
                  if (cat.name === 'Packages' && (!packages || packages.length === 0)) {
                    return false;
                  }
                  // Hide normal service categories that have no enabled services
                  if (cat.name !== 'All' && cat.name !== 'Favorites' && cat.name !== 'Packages') {
                    const hasAny = (genderFilteredServices || []).some(s => svcBucket(s) === cat.name);
                    if (!hasAny) return false;
                  }
                  return true;
                })
                .map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 min-w-[80px] transition-all ${
                    selectedCategory === cat.name ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className={`w-16 h-16 rounded-full overflow-hidden border-2 transition-all ${
                    selectedCategory === cat.name 
                      ? 'border-gold shadow-lg shadow-gold/20 bg-blue-100' 
                      : 'border-border/50'
                  }`}>
                    <img 
                      src={cat.thumbnail_url} 
                      alt={cat.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = 'https://images.unsplash.com/photo-1634449571010-02389ed0f9b0?w=200&h=200&fit=crop';
                      }}
                    />
                  </div>
                  <span className={`text-xs font-medium text-center leading-tight max-w-[80px] ${
                    selectedCategory === cat.name ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {cat.name}
                  </span>
                  {selectedCategory === cat.name && (
                    <div className="w-8 h-0.5 bg-gold rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Category Title with Search and Filter */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">{selectedCategory}</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="p-2 rounded-full border border-border hover:border-gold/50 transition-colors"
                onClick={() => document.getElementById('serviceSearch')?.focus()}
              >
                <Search className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Search Input (hidden by default, shown when search icon clicked) */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="serviceSearch"
              placeholder="Search services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10"
            />
          </div>

          {/* Services List for Selected Category */}
          <div className="space-y-2">
            {(() => {
              let displayServices = [];
              
              if (selectedCategory === 'Favorites') {
                // Show favorite/recent services
                const filteredRecent = recentServices.filter(s => {
                  const tag = (s.gender_tag || 'Unisex').toLowerCase();
                  if (tag === 'unisex') return true;
                  if (!customerGender) return true;
                  return tag.toLowerCase() === customerGender.toLowerCase();
                });
                displayServices = filteredRecent;
                
                if (displayServices.length === 0) {
                  return (
                    <div className="text-center py-8 bg-card border border-border rounded-xl">
                      <History className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">No favorites yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Your frequently used services will appear here</p>
                    </div>
                  );
                }
              } else if (selectedCategory === 'Packages') {
                // Show packages
                return packages.length > 0 ? (
                  <>
                    {selectedPackage && (
                      <div className="text-xs bg-gold/20 text-gold px-3 py-1.5 rounded-lg text-center font-medium">
                        Package Selected: {selectedPackage.package_name}
                      </div>
                    )}
                    {packages.map(pkg => {
                      const pkgPrice = pkg.total_price || pkg.total_discounted || pkg.package_price || 0;
                      const pkgOriginalPrice = pkg.total_original || pkg.original_price || null;
                      const isCustom = pkg.is_custom;
                      
                      return (
                        <motion.div
                          key={pkg.id}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => handlePackageSelect(pkg)}
                          className={`relative p-4 rounded-xl cursor-pointer transition-all border-2 ${
                            selectedPackage?.id === pkg.id
                              ? 'bg-gold/10 border-gold shadow-md'
                              : isCustom
                              ? 'bg-gradient-to-br from-gold/5 to-gold/10 border-gold/40 hover:border-gold'
                              : 'bg-card border-border hover:border-gold/40'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Package className="w-4 h-4 text-gold" />
                                <h4 className="font-bold text-foreground">{pkg.package_name}</h4>
                                {isCustom && (
                                  <span className="text-[10px] bg-gold text-black px-1.5 py-0.5 rounded-full font-bold">
                                    FOR YOU
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {pkg.description || pkg.services?.map(s => s.service_name || s.name).join(', ')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-gold">₹{pkgPrice}</p>
                              {pkgOriginalPrice && pkgOriginalPrice > pkgPrice && (
                                <p className="text-xs text-muted-foreground line-through">₹{pkgOriginalPrice}</p>
                              )}
                            </div>
                          </div>
                          {selectedPackage?.id === pkg.id && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute top-3 right-3 w-6 h-6 bg-gold rounded-full flex items-center justify-center"
                            >
                              <Check className="w-4 h-4 text-black" />
                            </motion.div>
                          )}
                        </motion.div>
                      );
                    })}
                  </>
                ) : (
                  <div className="text-center py-8 bg-card border border-border rounded-xl">
                    <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">No packages available</p>
                  </div>
                );
              } else if (selectedCategory === 'All') {
                // Show ALL services (gender-filtered + search-filtered)
                displayServices = filteredServices;
                if (searchQuery) {
                  displayServices = displayServices.filter(s =>
                    s.service_name.toLowerCase().includes(searchQuery.toLowerCase())
                  );
                }
                if (displayServices.length === 0) {
                  return (
                    <div className="text-center py-8 bg-card border border-border rounded-xl">
                      <Scissors className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">
                        {searchQuery ? 'No services match your search' : 'No services available'}
                      </p>
                    </div>
                  );
                }
              } else {
                // Show services for selected category
                displayServices = filteredServices.filter(s => svcBucket(s) === selectedCategory);
                
                // Apply search filter
                if (searchQuery) {
                  displayServices = displayServices.filter(s => 
                    s.service_name.toLowerCase().includes(searchQuery.toLowerCase())
                  );
                }
                
                if (displayServices.length === 0) {
                  return (
                    <div className="text-center py-8 bg-card border border-border rounded-xl">
                      <Scissors className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">
                        {searchQuery ? 'No services match your search' : 'No services in this category'}
                      </p>
                    </div>
                  );
                }
              }
              
              // Render service cards
              return displayServices.map(service => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  selected={formData.selectedServices.includes(service.id)}
                  onToggle={() => handleServiceToggle(service.id)}
                  price={getServicePrice(service)}
                />
              ));
            })()}
          </div>
        </div>

        {/* Section 4: Payment Mode - REMOVED, moved to separate step */}
      </form>

      {/* === A3: STICKY PERSISTENT TOTAL + CONFIRM BAR === */}
      <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-lg border-t border-brass/30 p-4 z-30 shadow-lux" data-testid="booking-persistent-total">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="min-w-0">
              <span className="eyebrow">{selectedPackage ? 'Package booking' : 'Your booking'}</span>
              <p className="text-sm text-foreground mt-0.5 leading-tight truncate">
                {selectedPackage
                  ? <>{selectedPackage.package_name}{formData.date ? ` · ${formData.date}` : ''}</>
                  : formData.selectedServices.length > 0
                    ? <>{formData.selectedServices.length} service{formData.selectedServices.length === 1 ? '' : 's'}{formData.shift ? ` · ${formData.shift}` : ''}</>
                    : 'Pick services to continue'}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="eyebrow">Total</span>
              <p className="font-bebas text-3xl brass-text leading-none mt-0.5">₹{totalAmount}</p>
            </div>
          </div>
          <Button
            type="button"
            onClick={goToPayment}
            disabled={_bookingBlocked || formData.selectedServices.length === 0 || (!selectedPackage && !formData.shift)}
            className="w-full bg-brass text-espresso hover:bg-brass-hover py-5 text-base font-bold rounded-2xl disabled:opacity-50 transition-all"
            data-testid="proceed-to-payment-btn"
          >
            {(() => {
              if (_closedFull) return 'Salon Closed';
              if (_closedOnline) return 'Online Booking Disabled';
              return (
                <>
                  {selectedPackage ? 'Book Package' : 'Proceed to Confirm'}
                  <ChevronRight className="w-5 h-5 ml-1" strokeWidth={2} />
                </>
              );
            })()}
          </Button>
        </div>
      </div>

      {/* OTP Verification Modal for Wallet Payment */}
      <AnimatePresence>
        {showOtpModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowOtpModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md"
            >
              <CustomerOtpVerification 
                showAs="card" 
                onVerified={() => {
                  setShowOtpModal(false);
                  setPaymentMode('wallet');
                  setUpiAppOpened(false);
                  toast.success('Phone verified! Wallet payment enabled.');
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
