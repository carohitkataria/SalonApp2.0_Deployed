import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Bell, User, Phone, Save, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';
import CustomerOtpVerification from '@/components/CustomerOtpVerification';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Merged notification list — each row has in-app + WhatsApp checkboxes
const NOTIFICATION_ROWS = [
  {
    key: 'booking_confirmation',
    label: 'Booking confirmation & payment',
    inapp: 'payment_confirmation',
    whatsapp: 'whatsapp_booking_confirmation',
  },
  {
    key: 'turn_approaching',
    label: "When you're 3, 2 or 1 token away",
    inapp: 'turn_approaching',
    whatsapp: 'whatsapp_turn_approaching',
  },
  {
    key: 'booking_status_change',
    label: 'Booking status changes (called, completed, cancelled, rescheduled)',
    inapp: 'booking_status_change',
    whatsapp: 'whatsapp_booking_status_change',
  },
  {
    key: 'manual_notify',
    label: 'Manual messages from the salon',
    inapp: 'manual_notify',
    whatsapp: 'whatsapp_manual_notify',
  },
  {
    key: 'membership_added',
    label: 'Membership added by salon',
    inapp: 'membership_added',
    whatsapp: 'whatsapp_membership_added',
  },
  {
    key: 'custom_package',
    label: 'Custom package created for you',
    inapp: 'custom_package',
    whatsapp: null, // no whatsapp trigger for this
  },
];

const GENDERS = ['Male', 'Female', 'Other'];

export default function CustomerProfilePage() {
  const { user, isUserOtpVerified } = useAuth();
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const phone = user?.phone
    || (() => {
      try { return JSON.parse(localStorage.getItem('salon_user') || '{}')?.phone || ''; }
      catch { return ''; }
    })();

  const cleanPhone = (phone || '').replace('+91', '');

  useEffect(() => {
    if (!phone || !isUserOtpVerified) {
      setLoading(false);
      return;
    }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, isUserOtpVerified]);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [profRes, setRes] = await Promise.all([
        axios.get(`${API}/users/by-phone/${cleanPhone}`).catch(() => ({ data: { name: user?.name || '', phone, gender: user?.gender || '' } })),
        axios.get(`${API}/customers/${cleanPhone}/notification-settings`),
      ]);
      setProfile(profRes.data);
      setSettings(setRes.data);
    } catch (e) {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSave = async () => {
    try {
      setSavingProfile(true);
      const payload = {
        name: profile.name || '',
        gender: profile.gender || '',
        dob: profile.dob || '',
        email: profile.email || '',
        address: profile.address || '',
        city: profile.city || '',
        pincode: profile.pincode || '',
        wedding_anniversary: profile.wedding_anniversary || '',
        spouse_name: profile.spouse_name || '',
        spouse_date_of_birth: profile.spouse_date_of_birth || '',
        important_dates: Array.isArray(profile.important_dates)
          ? profile.important_dates.filter(d => d && (d.label || d.date))
          : [],
      };
      const res = await axios.put(`${API}/users/by-phone/${cleanPhone}`, payload);
      setProfile(res.data);
      toast.success('Profile saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const togglePref = (key) => setSettings(prev => ({ ...prev, [key]: !prev[key] }));

  const handlePrefsSave = async () => {
    try {
      setSavingPrefs(true);
      const payload = {};
      NOTIFICATION_ROWS.forEach(row => {
        payload[row.inapp] = !!settings[row.inapp];
        if (row.whatsapp) payload[row.whatsapp] = !!settings[row.whatsapp];
      });
      await axios.put(`${API}/customers/${cleanPhone}/notification-settings`, payload);
      toast.success('Notification preferences saved');
    } catch (e) {
      toast.error('Failed to save preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  if (!phone) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Please log in to view your profile.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Require OTP verification for profile access
  if (!isUserOtpVerified) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-md mx-auto p-4 pt-20">
          <CustomerOtpVerification showAs="card" onVerified={loadAll} />
        </div>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto p-4 pt-20">
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">Loading profile...</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-4 pt-20 pb-24">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your personal information & notification preferences</p>
        </div>

        {/* Basic profile */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="w-4 h-4 text-gold" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={profile.name || ''}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="phone" className="flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Mobile Number
                </Label>
                <Input id="phone" value={profile.phone || phone} disabled className="bg-muted" />
                <p className="text-[11px] text-muted-foreground mt-1">Phone cannot be changed.</p>
              </div>
              <div>
                <Label htmlFor="gender">Gender</Label>
                <select
                  id="gender"
                  value={profile.gender || ''}
                  onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Select gender</option>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="dob">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={profile.dob || ''}
                  onChange={(e) => setProfile({ ...profile, dob: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email || ''}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  placeholder="you@example.com"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={profile.address || ''}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  placeholder="Street, locality"
                />
              </div>
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={profile.city || ''}
                  onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                  placeholder="City"
                />
              </div>
              <div>
                <Label htmlFor="pincode">PIN Code</Label>
                <Input
                  id="pincode"
                  value={profile.pincode || ''}
                  onChange={(e) => setProfile({ ...profile, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                  placeholder="6-digit PIN"
                  maxLength={6}
                />
              </div>
            </div>

            {/* Marketing / relationship fields (M1) */}
            <div className="pt-4 mt-2 border-t border-border">
              <div className="mb-2">
                <p className="text-sm font-semibold text-foreground">Special Dates</p>
                <p className="text-[11px] text-muted-foreground">
                  Optional — helps your salon send you personalised offers on the right day.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="wedding_anniversary">Wedding Anniversary</Label>
                  <Input
                    id="wedding_anniversary"
                    type="date"
                    value={profile.wedding_anniversary || ''}
                    onChange={(e) => setProfile({ ...profile, wedding_anniversary: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="spouse_name">Spouse Name</Label>
                  <Input
                    id="spouse_name"
                    value={profile.spouse_name || ''}
                    onChange={(e) => setProfile({ ...profile, spouse_name: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label htmlFor="spouse_dob">Spouse Date of Birth</Label>
                  <Input
                    id="spouse_dob"
                    type="date"
                    value={profile.spouse_date_of_birth || ''}
                    onChange={(e) => setProfile({ ...profile, spouse_date_of_birth: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <Label>Other Important Dates</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setProfile({
                        ...profile,
                        important_dates: [...(profile.important_dates || []), { label: '', date: '' }],
                      })
                    }
                  >
                    + Add
                  </Button>
                </div>
                {(profile.important_dates || []).length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    No custom dates added. Kids&apos; birthdays, engagement, etc.
                  </p>
                )}
                {(profile.important_dates || []).map((d, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <Input
                      placeholder="Label (e.g. Kid's birthday)"
                      value={d.label || ''}
                      onChange={(e) => {
                        const arr = [...(profile.important_dates || [])];
                        arr[idx] = { ...arr[idx], label: e.target.value };
                        setProfile({ ...profile, important_dates: arr });
                      }}
                    />
                    <Input
                      type="date"
                      value={d.date || ''}
                      onChange={(e) => {
                        const arr = [...(profile.important_dates || [])];
                        arr[idx] = { ...arr[idx], date: e.target.value };
                        setProfile({ ...profile, important_dates: arr });
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const arr = [...(profile.important_dates || [])];
                        arr.splice(idx, 1);
                        setProfile({ ...profile, important_dates: arr });
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <Button
              className="w-full bg-gold text-black hover:bg-gold/90"
              onClick={handleProfileSave}
              disabled={savingProfile}
            >
              <Save className="w-4 h-4 mr-2" />
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </Button>
          </CardContent>
        </Card>

        {/* Collapsible Notification Preferences */}
        <Card>
          <button
            type="button"
            onClick={() => setNotifOpen(o => !o)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/30 transition-colors rounded-t-lg"
          >
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gold" />
              <span className="font-semibold text-foreground">Notification Preferences</span>
            </div>
            {notifOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {notifOpen && settings && (
            <CardContent className="pt-0">
              {/* Column headers */}
              <div className="flex items-center gap-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                <div className="flex-1">Notification</div>
                <div className="w-14 text-center flex flex-col items-center">
                  <Bell className="w-3 h-3 mb-0.5 text-gold" />
                  In-App
                </div>
                <div className="w-14 text-center flex flex-col items-center">
                  <MessageCircle className="w-3 h-3 mb-0.5 text-green-500" />
                  WhatsApp
                </div>
              </div>

              {NOTIFICATION_ROWS.map(row => (
                <div key={row.key} className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
                  <div className="flex-1 text-sm text-foreground">{row.label}</div>
                  <div className="w-14 flex justify-center">
                    <Checkbox
                      checked={!!settings[row.inapp]}
                      onCheckedChange={() => togglePref(row.inapp)}
                      className="data-[state=checked]:bg-gold data-[state=checked]:border-gold data-[state=checked]:text-black"
                    />
                  </div>
                  <div className="w-14 flex justify-center">
                    {row.whatsapp ? (
                      <Checkbox
                        checked={!!settings[row.whatsapp]}
                        onCheckedChange={() => togglePref(row.whatsapp)}
                        className="data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500 data-[state=checked]:text-white"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              ))}

              <Button
                className="w-full mt-4 bg-gold text-black hover:bg-gold/90"
                onClick={handlePrefsSave}
                disabled={savingPrefs}
              >
                <Save className="w-4 h-4 mr-2" />
                {savingPrefs ? 'Saving...' : 'Save Preferences'}
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
