import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Users, Search, ArrowLeft, Plus, Calendar, Package, Percent, IndianRupee, Save, Crown, Wallet, CreditCard,
  Edit2, Check, X, ArrowUpCircle, ArrowDownCircle, Upload, FileSpreadsheet, Download, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MembershipManagement from './MembershipManagement';
import SellMembershipModal from './SellMembershipModal';
import MembershipBadge from './MembershipBadge';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CustomerMaster({ salonId, getAuthHeaders }) {
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const filterMode = urlParams.get('filter') || 'all';
  const autoOpen = urlParams.get('autoOpen'); // 'add' | null

  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerBookings, setCustomerBookings] = useState([]);
  const [customerPackages, setCustomerPackages] = useState([]);
  const [customerMembership, setCustomerMembership] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPackageForm, setShowPackageForm] = useState(false);
  const [showMembershipModal, setShowMembershipModal] = useState(false);
  const [showMembershipManagement, setShowMembershipManagement] = useState(false);
  const [services, setServices] = useState([]);
  const [editingPackage, setEditingPackage] = useState(null);
  const [combinedHistory, setCombinedHistory] = useState([]);
  const [editingWallet, setEditingWallet] = useState(false);
  const [walletEditValue, setWalletEditValue] = useState(0);
  const [walletEditReason, setWalletEditReason] = useState('');
  
  // Add Customer Modal State
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: '',
    phone: '',
    gender: 'Men'
  });

  // Bulk Upload Modal State
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [bulkUploadFile, setBulkUploadFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkUploadResult, setBulkUploadResult] = useState(null);

  // Item 5b — inline edit of customer master fields
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editCustomerForm, setEditCustomerForm] = useState({ name: '', phone: '', date_of_birth: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Item 5a — delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Item 5c — service search inside custom package
  const [packageServiceSearch, setPackageServiceSearch] = useState('');

  // Item 5d — rebook in place
  const [rebookData, setRebookData] = useState(null);
  const [showRebookModal, setShowRebookModal] = useState(false);
  const [barbers, setBarbers] = useState([]);
  const [rebookForm, setRebookForm] = useState({ barber_id: '', date: '', time_slot: 'Morning' });
  const [submittingRebook, setSubmittingRebook] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      const response = await axios.get(
        `${API}/salons/${salonId}/customers/template`,
        { headers: getAuthHeaders(), responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'customer_upload_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch (error) {
      toast.error('Failed to download template');
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkUploadFile) {
      toast.error('Please select a file');
      return;
    }
    setBulkUploading(true);
    setBulkUploadResult(null);
    try {
      const fd = new FormData();
      fd.append('file', bulkUploadFile);
      const response = await axios.post(
        `${API}/salons/${salonId}/customers/bulk-upload`,
        fd,
        {
          headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' },
        }
      );
      setBulkUploadResult(response.data);
      toast.success(response.data.message || 'Customers imported');
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Bulk upload failed');
    } finally {
      setBulkUploading(false);
    }
  };

  
  const [packageForm, setPackageForm] = useState({
    package_name: '',
    services: [],
    discount_percentage: 0,
    final_amount: null,  // New: manual final amount override
    pricing_mode: 'discount', // 'discount' or 'manual'
    notes: ''
  });

  useEffect(() => {
    if (salonId) {
      fetchCustomers();
      fetchServices();
    }
  }, [salonId]);

  useEffect(() => {
    if (selectedCustomer) {
      fetchCustomerBookings(selectedCustomer.phone);
      fetchCustomerPackages(selectedCustomer.phone);
      fetchCustomerMembership(selectedCustomer.phone);
      fetchCombinedHistory(selectedCustomer.phone);
    }
  }, [selectedCustomer]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/salons/${salonId}/customers`, {
        headers: getAuthHeaders()
      });
      setCustomers(response.data.customers || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerBookings = async (phone) => {
    try {
      const response = await axios.get(`${API}/salons/${salonId}/customers/${phone}/bookings`, {
        headers: getAuthHeaders()
      });
      setCustomerBookings(response.data.bookings || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    }
  };

  const fetchCustomerPackages = async (phone) => {
    try {
      const response = await axios.get(`${API}/salons/${salonId}/customer-packages/${phone}`, {
        headers: getAuthHeaders()
      });
      setCustomerPackages(response.data.packages || []);
    } catch (error) {
      console.error('Error fetching packages:', error);
    }
  };

  const fetchCustomerMembership = async (phone) => {
    try {
      const response = await axios.get(`${API}/salons/${salonId}/customer-membership/${phone}`);
      if (response.data.has_membership) {
        setCustomerMembership(response.data);
      } else {
        setCustomerMembership(null);
      }
    } catch (error) {
      console.error('Error fetching membership:', error);
      setCustomerMembership(null);
    }
  };

  const fetchServices = async () => {
    try {
      const response = await axios.get(`${API}/salons/${salonId}/services/enabled`);
      setServices(response.data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const fetchCombinedHistory = async (phone) => {
    try {
      const response = await axios.get(`${API}/salons/${salonId}/customers/${phone}/combined-history`);
      setCombinedHistory(response.data.history || []);
    } catch (error) {
      console.error('Error fetching combined history:', error);
      setCombinedHistory([]);
    }
  };

  const handleWalletUpdate = async () => {
    if (walletEditValue < 0) {
      toast.error('Wallet balance cannot be negative');
      return;
    }

    const confirmed = window.confirm(
      `Update wallet balance?\n\nCurrent: ₹${customerMembership.wallet_balance}\nNew: ₹${walletEditValue}\nReason: ${walletEditReason || 'Manual adjustment by admin'}`
    );
    if (!confirmed) return;

    try {
      await axios.put(
        `${API}/salons/${salonId}/customers/${selectedCustomer.phone}/wallet-balance`,
        {
          wallet_balance: parseFloat(walletEditValue),
          reason: walletEditReason || 'Manual adjustment by admin'
        },
        { headers: getAuthHeaders() }
      );
      toast.success('Wallet balance updated');
      setEditingWallet(false);
      setWalletEditReason('');
      fetchCustomerMembership(selectedCustomer.phone);
      fetchCombinedHistory(selectedCustomer.phone);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update wallet balance');
    }
  };

  const handleRebook = async (booking) => {
    // Item 5d — Rebook in place (no navigation).
    // Pre-fill barber + services + today's date; admin picks the shift.
    const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    setRebookData(booking);
    setRebookForm({
      barber_id: booking.barber_id || '',
      date: todayIST,
      time_slot: 'Morning',
    });
    // Load barbers list (idempotent — cached after first call)
    if (!barbers.length) {
      try {
        const res = await axios.get(`${API}/salons/${salonId}/barbers`, { headers: getAuthHeaders() });
        setBarbers(res.data || []);
      } catch (e) {
        console.error('Failed to load barbers for rebook', e);
      }
    }
    setShowRebookModal(true);
  };

  const handleSubmitRebook = async () => {
    if (!rebookData) return;
    if (!rebookForm.barber_id) {
      toast.error('Please select a stylist');
      return;
    }
    if (!rebookForm.date) {
      toast.error('Please pick a date');
      return;
    }
    setSubmittingRebook(true);
    try {
      const selectedServices = (rebookData.selected_services || []).map((s) =>
        typeof s === 'string' ? s : (s.service_id || s.id),
      ).filter(Boolean);
      const payload = {
        salon_id: salonId,
        customer_name: selectedCustomer.name,
        phone: selectedCustomer.phone,
        barber_id: rebookForm.barber_id,
        selected_services: selectedServices,
        date: rebookForm.date,
        time_slot: rebookForm.time_slot,
        payment_mode: 'pay_later',
        is_rebook: true,
      };
      await axios.post(`${API}/bookings`, payload, { headers: getAuthHeaders() });
      toast.success('Rebooking placed — visible in Queue');
      setShowRebookModal(false);
      setRebookData(null);
      // Refresh customer's history so the new booking shows up
      fetchCustomerBookings(selectedCustomer.phone);
      fetchCombinedHistory(selectedCustomer.phone);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create rebooking');
    } finally {
      setSubmittingRebook(false);
    }
  };

  const handleStartEditCustomer = () => {
    setEditCustomerForm({
      name: selectedCustomer.name || '',
      phone: (selectedCustomer.phone || '').replace(/^\+91/, ''),
      date_of_birth: selectedCustomer.date_of_birth || '',
    });
    setEditingCustomer(true);
  };

  const handleSaveEditCustomer = async () => {
    const name = editCustomerForm.name.trim();
    const phone = editCustomerForm.phone.replace(/\D/g, '');
    const dob = editCustomerForm.date_of_birth;
    if (!name) { toast.error('Name is required'); return; }
    if (phone && phone.length !== 10) { toast.error('Enter a valid 10-digit mobile'); return; }
    setSavingEdit(true);
    try {
      const res = await axios.put(
        `${API}/salons/${salonId}/customers/${encodeURIComponent(selectedCustomer.phone)}`,
        { name, phone: phone, date_of_birth: dob || null },
        { headers: getAuthHeaders() },
      );
      toast.success('Customer details updated');
      const updated = res.data?.customer || {};
      setSelectedCustomer((prev) => ({ ...prev, ...updated }));
      setEditingCustomer(false);
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update customer');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteCustomer = async () => {
    try {
      await axios.delete(
        `${API}/salons/${salonId}/customers/${encodeURIComponent(selectedCustomer.phone)}`,
        { headers: getAuthHeaders() },
      );
      toast.success('Customer deleted');
      setShowDeleteConfirm(false);
      setSelectedCustomer(null);
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete customer');
    }
  };

  const toggleServiceSelection = (serviceId) => {
    setPackageForm(prev => {
      const services = prev.services.includes(serviceId)
        ? prev.services.filter(id => id !== serviceId)
        : [...prev.services, serviceId];
      return { ...prev, services };
    });
  };

  const calculatePackageTotal = () => {
    const selectedServices = services.filter(s => packageForm.services.includes(s.id));
    const total = selectedServices.reduce((sum, s) => sum + (s.price || s.base_price || 0), 0);
    const discount = (total * packageForm.discount_percentage) / 100;
    return {
      original: total,
      discount: discount,
      final: total - discount
    };
  };

  const handleCreatePackage = async () => {
    if (!packageForm.package_name || packageForm.services.length === 0) {
      toast.error('Please enter package name and select at least one service');
      return;
    }

    try {
      const selectedServices = services.filter(s => packageForm.services.includes(s.id));
      const totals = calculatePackageTotal();
      
      // Calculate final price based on pricing mode
      let finalPrice;
      if (packageForm.pricing_mode === 'manual' && packageForm.final_amount !== null) {
        finalPrice = packageForm.final_amount;
      } else {
        finalPrice = totals.final;
      }
      
      // Calculate discount percentage for display
      const discountPercentage = packageForm.pricing_mode === 'manual' && packageForm.final_amount !== null
        ? ((totals.original - packageForm.final_amount) / totals.original * 100)
        : packageForm.discount_percentage;
      
      const packageData = {
        salon_id: salonId,
        customer_phone: selectedCustomer.phone,
        customer_name: selectedCustomer.name,
        package_name: packageForm.package_name,
        services: selectedServices.map(s => ({
          service_id: s.id,
          service_name: s.service_name,
          original_price: s.price || s.base_price || 0,
          discounted_price: (s.price || s.base_price || 0) * (1 - discountPercentage / 100)
        })),
        total_original: totals.original,
        discount_percentage: discountPercentage,
        total_discounted: finalPrice,
        pricing_mode: packageForm.pricing_mode,
        notes: packageForm.notes
      };

      if (editingPackage) {
        await axios.put(
          `${API}/salons/${salonId}/customer-packages/${editingPackage.id}`,
          packageData,
          { headers: getAuthHeaders() }
        );
        toast.success('Package updated successfully');
      } else {
        await axios.post(
          `${API}/salons/${salonId}/customer-packages`,
          packageData,
          { headers: getAuthHeaders() }
        );
        toast.success('Custom package created successfully');
      }

      setShowPackageForm(false);
      setEditingPackage(null);
      setPackageForm({
        package_name: '',
        services: [],
        discount_percentage: 0,
        final_amount: null,
        pricing_mode: 'discount',
        notes: ''
      });
      fetchCustomerPackages(selectedCustomer.phone);
    } catch (error) {
      toast.error('Failed to create package');
    }
  };

  const handleEditPackage = (pkg) => {
    setEditingPackage(pkg);
    setPackageForm({
      package_name: pkg.package_name,
      services: pkg.services.map(s => s.service_id),
      discount_percentage: pkg.discount_percentage || 0,
      final_amount: pkg.pricing_mode === 'manual' ? pkg.total_discounted : null,
      pricing_mode: pkg.pricing_mode || 'discount',
      notes: pkg.notes || ''
    });
    setShowPackageForm(true);
  };

  const handleDeletePackage = async (packageId) => {
    if (!window.confirm('Delete this custom package?')) return;

    try {
      await axios.delete(`${API}/salons/${salonId}/customer-packages/${packageId}`, {
        headers: getAuthHeaders()
      });
      toast.success('Package deleted');
      fetchCustomerPackages(selectedCustomer.phone);
    } catch (error) {
      toast.error('Failed to delete package');
    }
  };

  const handleAddCustomer = async () => {
    if (!newCustomerForm.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    try {
      await axios.post(
        `${API}/salons/${salonId}/customers`,
        {
          name: newCustomerForm.name.trim(),
          phone: newCustomerForm.phone.trim(),
          gender: newCustomerForm.gender
        },
        { headers: getAuthHeaders() }
      );
      toast.success('Customer added successfully');
      setShowAddCustomerModal(false);
      setNewCustomerForm({ name: '', phone: '', gender: 'Men' });
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add customer');
    }
  };

  const todayISO = new Date().toISOString().slice(0, 10);
  const filteredCustomers = customers.filter(c => {
    const matches = c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone?.includes(searchQuery);
    if (!matches) return false;
    if (filterMode === 'new') {
      const created = String(c.created_at || '').slice(0, 10);
      return created === todayISO;
    }
    return true;
  });

  // Auto-open Add Customer modal when navigated with ?autoOpen=add
  useEffect(() => {
    if (autoOpen === 'add' && !showAddCustomerModal) {
      setShowAddCustomerModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  // Show membership management view
  if (showMembershipManagement) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMembershipManagement(false)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Customers
            </Button>
            <h2 className="text-2xl font-bold">Membership Plans</h2>
          </div>
        </div>
        <MembershipManagement salonId={salonId} getAuthHeaders={getAuthHeaders} />
      </div>
    );
  }

  if (selectedCustomer) {
    return (
      <div className="space-y-6">
        {/* Customer Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedCustomer(null)}
              className="flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Back</span>
            </Button>
            <div className="min-w-0 flex-1">
              {editingCustomer ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2" data-testid="customer-edit-row">
                  <Input
                    value={editCustomerForm.name}
                    onChange={(e) => setEditCustomerForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Name"
                    className="h-9"
                    data-testid="customer-edit-name"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">+91</span>
                    <Input
                      value={editCustomerForm.phone}
                      onChange={(e) => setEditCustomerForm((p) => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                      placeholder="10-digit mobile"
                      inputMode="numeric"
                      className="h-9"
                      data-testid="customer-edit-phone"
                    />
                  </div>
                  <Input
                    type="date"
                    value={editCustomerForm.date_of_birth || ''}
                    onChange={(e) => setEditCustomerForm((p) => ({ ...p, date_of_birth: e.target.value }))}
                    className="h-9"
                    data-testid="customer-edit-dob"
                  />
                </div>
              ) : (
                <>
                  <h2 className="text-lg md:text-2xl font-bold truncate">{selectedCustomer.name}</h2>
                  <p className="text-muted-foreground text-xs md:text-sm">
                    {selectedCustomer.phone}
                    {selectedCustomer.date_of_birth && (
                      <span className="ml-2 text-muted-foreground">· DOB {selectedCustomer.date_of_birth}</span>
                    )}
                  </p>
                </>
              )}
            </div>
            {editingCustomer ? (
              <div className="flex gap-1 flex-shrink-0">
                <Button size="sm" onClick={handleSaveEditCustomer} disabled={savingEdit} className="bg-green-600 text-white hover:bg-green-700" data-testid="customer-edit-save">
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingCustomer(false)} data-testid="customer-edit-cancel">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-1 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={handleStartEditCustomer} title="Edit details" data-testid="customer-edit-start">
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-red-500 border-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                  title="Delete customer"
                  data-testid="customer-delete-btn"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setShowMembershipModal(true)}
              variant="outline"
              className="border-gold text-gold hover:bg-gold/10 text-xs md:text-sm h-8 md:h-9"
            >
              <Crown className="w-4 h-4 mr-1 md:mr-2" />
              Sell Membership
            </Button>
            <Button
              onClick={() => setShowPackageForm(!showPackageForm)}
              className="bg-gold text-black hover:bg-gold/90 text-xs md:text-sm h-8 md:h-9"
            >
              <Package className="w-4 h-4 mr-1 md:mr-2" />
              {showPackageForm ? 'Cancel' : 'Create Custom Package'}
            </Button>
          </div>
        </div>

        {/* Sell Membership Modal */}
        <SellMembershipModal
          isOpen={showMembershipModal}
          onClose={() => setShowMembershipModal(false)}
          customer={selectedCustomer}
          salonId={salonId}
          getAuthHeaders={getAuthHeaders}
          onSuccess={() => {
            fetchCustomerMembership(selectedCustomer.phone);
            toast.success('Membership updated');
          }}
        />

        {/* Customer Membership Display */}
        {customerMembership && (
          <div className="bg-gradient-to-br from-gold/10 to-gold/5 border-2 border-gold/30 rounded-xl p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gold/20 rounded-full">
                  <Crown className="w-6 h-6 text-gold" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold">{customerMembership.membership_name} Member</h3>
                    <MembershipBadge tier={customerMembership.tier} color={customerMembership.color} name={customerMembership.membership_name} size="sm" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Expires: {new Date(customerMembership.expiry_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Wallet Balance</p>
                {editingWallet ? (
                  <div className="space-y-2 mt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold text-gold">₹</span>
                      <Input
                        type="number"
                        value={walletEditValue}
                        onChange={(e) => setWalletEditValue(e.target.value)}
                        className="w-32 text-right text-xl font-bold border-gold"
                        min="0"
                        autoFocus
                      />
                    </div>
                    <Input
                      placeholder="Reason for change..."
                      value={walletEditReason}
                      onChange={(e) => setWalletEditReason(e.target.value)}
                      className="w-full text-sm"
                    />
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        onClick={handleWalletUpdate}
                        className="bg-green-600 text-white hover:bg-green-700 h-7 px-2"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingWallet(false); setWalletEditReason(''); }}
                        className="h-7 px-2"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-3xl font-bold text-gold">₹{customerMembership.wallet_balance}</p>
                    <button
                      onClick={() => {
                        setWalletEditValue(customerMembership.wallet_balance);
                        setEditingWallet(true);
                      }}
                      className="p-1.5 rounded-full hover:bg-gold/20 transition-colors"
                      title="Edit wallet balance"
                    >
                      <Edit2 className="w-4 h-4 text-gold" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gold/20">
              <div>
                <p className="text-xs text-muted-foreground">Purchased</p>
                <p className="text-sm font-semibold">
                  {new Date(customerMembership.purchased_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Payment Mode</p>
                <p className="text-sm font-semibold capitalize">{customerMembership.payment_mode}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Amount Paid</p>
                <p className="text-sm font-semibold">₹{customerMembership.paid_amount}</p>
              </div>
            </div>
          </div>
        )}

        {/* Custom Package Form */}
        <AnimatePresence>
          {showPackageForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-card border border-border rounded-lg p-6 space-y-4"
            >
              <h3 className="font-semibold text-lg">Create Custom Package</h3>
              
              <div>
                <Label htmlFor="package_name">Package Name *</Label>
                <Input
                  id="package_name"
                  value={packageForm.package_name}
                  onChange={(e) => setPackageForm({ ...packageForm, package_name: e.target.value })}
                  placeholder="e.g., Premium Hair Care"
                />
              </div>

              <div>
                <Label className="mb-3 block">Select Services *</Label>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={packageServiceSearch}
                    onChange={(e) => setPackageServiceSearch(e.target.value)}
                    placeholder="Search services by name or category…"
                    className="pl-8 h-9"
                    data-testid="package-service-search"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {(() => {
                    const q = packageServiceSearch.trim().toLowerCase();
                    const matches = (s) => {
                      if (!q) return true;
                      return (
                        (s.service_name || '').toLowerCase().includes(q) ||
                        (s.category || '').toLowerCase().includes(q)
                      );
                    };
                    // Keep selected services pinned to the top
                    const selectedFirst = [...services].sort((a, b) => {
                      const sa = packageForm.services.includes(a.id) ? -1 : 0;
                      const sb = packageForm.services.includes(b.id) ? -1 : 0;
                      return sa - sb;
                    });
                    return selectedFirst.filter(matches).map((service) => (
                    <div
                      key={service.id}
                      className="flex items-center space-x-2 p-2 border rounded hover:bg-muted cursor-pointer"
                      onClick={() => toggleServiceSelection(service.id)}
                    >
                      <Checkbox
                        checked={packageForm.services.includes(service.id)}
                        onCheckedChange={() => toggleServiceSelection(service.id)}
                        className="data-[state=checked]:bg-gold data-[state=checked]:border-gold"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{service.service_name}</p>
                        <p className="text-xs text-muted-foreground">₹{service.price || service.base_price}</p>
                      </div>
                    </div>
                  ));
                  })()}
                </div>
              </div>

              {/* Pricing Mode Selector */}
              <div className="border border-border rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-4">
                  <Label className="font-semibold">Pricing Method:</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={packageForm.pricing_mode === 'discount'}
                        onChange={() => setPackageForm({ ...packageForm, pricing_mode: 'discount', final_amount: null })}
                        className="text-gold"
                      />
                      <span className="text-sm">Discount %</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={packageForm.pricing_mode === 'manual'}
                        onChange={() => setPackageForm({ ...packageForm, pricing_mode: 'manual', discount_percentage: 0 })}
                        className="text-gold"
                      />
                      <span className="text-sm">Manual Amount</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {packageForm.pricing_mode === 'discount' ? (
                    <div>
                      <Label htmlFor="discount">Discount Percentage</Label>
                      <div className="flex items-center">
                        <Input
                          id="discount"
                          type="number"
                          min="0"
                          max="100"
                          value={packageForm.discount_percentage}
                          onChange={(e) => setPackageForm({ ...packageForm, discount_percentage: parseFloat(e.target.value) || 0 })}
                        />
                        <Percent className="w-4 h-4 ml-2 text-muted-foreground" />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor="final_amount">Final Amount (₹)</Label>
                      <Input
                        id="final_amount"
                        type="number"
                        min="0"
                        value={packageForm.final_amount || ''}
                        onChange={(e) => setPackageForm({ ...packageForm, final_amount: parseFloat(e.target.value) || null })}
                        placeholder="Enter custom price"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Original total: ₹{calculatePackageTotal().original.toFixed(2)}
                      </p>
                    </div>
                  )}

                  <div>
                    <Label>Package Summary</Label>
                    <div className="p-3 bg-muted rounded-lg space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Original Total:</span>
                        <span>₹{calculatePackageTotal().original.toFixed(2)}</span>
                      </div>
                      {packageForm.pricing_mode === 'discount' && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Discount ({packageForm.discount_percentage}%):</span>
                          <span>- ₹{calculatePackageTotal().discount.toFixed(2)}</span>
                        </div>
                      )}
                      {packageForm.pricing_mode === 'manual' && packageForm.final_amount !== null && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Discount:</span>
                          <span>- ₹{(calculatePackageTotal().original - packageForm.final_amount).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-gold border-t pt-1">
                        <span>Final Total:</span>
                        <span>₹{
                          packageForm.pricing_mode === 'manual' && packageForm.final_amount !== null
                            ? packageForm.final_amount.toFixed(2)
                            : calculatePackageTotal().final.toFixed(2)
                        }</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Input
                  id="notes"
                  value={packageForm.notes}
                  onChange={(e) => setPackageForm({ ...packageForm, notes: e.target.value })}
                  placeholder="Any special notes..."
                />
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowPackageForm(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreatePackage}
                  className="bg-gold text-black hover:bg-gold/90"
                  disabled={!packageForm.package_name || packageForm.services.length === 0}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Create Package
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Customer Packages */}
        {customerPackages.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4">Custom Packages</h3>
            <div className="space-y-3">
              {customerPackages.map(pkg => (
                <div key={pkg.id} className="p-4 bg-muted rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold">{pkg.package_name}</h4>
                      <p className="text-sm text-muted-foreground">{pkg.services.length} services</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right mr-3">
                        <p className="text-sm line-through text-muted-foreground">₹{pkg.total_original}</p>
                        <p className="text-lg font-bold text-gold">₹{pkg.total_discounted}</p>
                        <p className="text-xs text-green-600">{pkg.discount_percentage.toFixed(1)}% off</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditPackage(pkg)}
                        className="text-blue-500 border-blue-500"
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeletePackage(pkg.id)}
                        className="text-red-500 border-red-500"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {pkg.notes && (
                    <p className="text-xs text-muted-foreground mt-2">Note: {pkg.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Combined Transaction & Booking History */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold text-lg mb-4">
            Transaction & Booking History ({combinedHistory.length})
          </h3>
          <div className="space-y-3">
            {combinedHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No history found</p>
            ) : (
              combinedHistory.map((item, idx) => (
                <div key={item.id || idx} className={`p-4 border rounded-lg hover:border-gold transition-all ${
                  item.history_type === 'transaction' ? 'border-l-4 border-l-gold/60' : ''
                }`}>
                  {item.history_type === 'booking' ? (
                    /* Booking Item */
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-500">
                            Booking
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            item.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                            item.status === 'waiting' ? 'bg-yellow-500/20 text-yellow-500' :
                            item.status === 'cancelled' ? 'bg-red-500/20 text-red-500' :
                            'bg-blue-500/20 text-blue-500'
                          }`}>
                            {item.status}
                          </span>
                          <span className="text-sm text-muted-foreground">Token: {item.token_number}</span>
                        </div>
                        <p className="font-medium">{item.barber_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString()} - {item.shift}
                        </p>
                        <p className="text-sm mt-1">
                          {item.selected_services?.length || 0} service(s) - ₹{item.total_amount}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleRebook(item)}
                        className="bg-gold text-black hover:bg-gold/90"
                      >
                        <Calendar className="w-4 h-4 mr-1" />
                        Rebook
                      </Button>
                    </div>
                  ) : (
                    /* Transaction Item (Membership Purchase / Wallet Activity) */
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {item.transaction_type === 'credit' ? (
                          <div className="p-2 bg-green-500/20 rounded-full">
                            <ArrowUpCircle className="w-4 h-4 text-green-500" />
                          </div>
                        ) : (
                          <div className="p-2 bg-red-500/20 rounded-full">
                            <ArrowDownCircle className="w-4 h-4 text-red-500" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              item.description?.toLowerCase().includes('membership')
                                ? 'bg-gold/20 text-gold'
                                : 'bg-purple-500/20 text-purple-500'
                            }`}>
                              {item.description?.toLowerCase().includes('membership') ? 'Membership' : 'Wallet'}
                            </span>
                          </div>
                          <p className="font-medium text-sm">{item.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(item.created_at).toLocaleString('en-IN', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${
                          item.transaction_type === 'credit' ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {item.transaction_type === 'credit' ? '+' : '-'}₹{item.amount}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Bal: ₹{item.balance_after}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Delete confirm dialog — Item 5a */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="max-w-md" data-testid="customer-delete-confirm">
            <DialogHeader>
              <DialogTitle>Delete this customer?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{selectedCustomer?.name}</span> ({selectedCustomer?.phone}) will be removed from your Customer Master. Past booking history is preserved.
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} data-testid="customer-delete-cancel">Cancel</Button>
                <Button
                  onClick={handleDeleteCustomer}
                  className="bg-red-600 hover:bg-red-700 text-white"
                  data-testid="customer-delete-confirm-btn"
                >
                  Delete customer
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Rebook modal — Item 5d (in-place) */}
        <Dialog open={showRebookModal} onOpenChange={(open) => { if (!open) { setShowRebookModal(false); setRebookData(null); } }}>
          <DialogContent className="max-w-md" data-testid="rebook-modal">
            <DialogHeader>
              <DialogTitle>Rebook for {selectedCustomer?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <p className="text-xs text-muted-foreground">
                Services and stylist are pre-filled from the past booking. Pick a date and shift to drop the new booking straight into the Queue.
              </p>
              <div>
                <Label className="text-sm">Stylist</Label>
                <select
                  className="w-full mt-1 h-9 rounded-md border border-border bg-background text-sm px-2"
                  value={rebookForm.barber_id}
                  onChange={(e) => setRebookForm((p) => ({ ...p, barber_id: e.target.value }))}
                  data-testid="rebook-barber-select"
                >
                  <option value="">Select stylist…</option>
                  {barbers.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-sm">Date</Label>
                  <Input
                    type="date"
                    value={rebookForm.date}
                    min={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())}
                    onChange={(e) => setRebookForm((p) => ({ ...p, date: e.target.value }))}
                    className="h-9"
                    data-testid="rebook-date-input"
                  />
                </div>
                <div>
                  <Label className="text-sm">Shift</Label>
                  <select
                    className="w-full mt-1 h-9 rounded-md border border-border bg-background text-sm px-2"
                    value={rebookForm.time_slot}
                    onChange={(e) => setRebookForm((p) => ({ ...p, time_slot: e.target.value }))}
                    data-testid="rebook-shift-select"
                  >
                    <option value="Morning">Morning</option>
                    <option value="Afternoon">Afternoon</option>
                    <option value="Evening">Evening</option>
                  </select>
                </div>
              </div>
              <div className="bg-muted/50 rounded-md p-3 text-xs">
                <p className="font-semibold mb-1">Services from last booking:</p>
                <p className="text-muted-foreground">
                  {(rebookData?.selected_services || []).length} service(s) · ₹{rebookData?.total_amount || 0}
                </p>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => { setShowRebookModal(false); setRebookData(null); }} data-testid="rebook-cancel">Cancel</Button>
                <Button
                  onClick={handleSubmitRebook}
                  disabled={submittingRebook}
                  className="bg-gold text-black hover:bg-gold/90"
                  data-testid="rebook-confirm"
                >
                  {submittingRebook ? 'Booking…' : 'Confirm rebook'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <Users className="w-6 h-6 text-gold" />
          <h2 className="text-2xl font-bold">Customer Master</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setShowAddCustomerModal(true)}
            className="bg-gold text-black hover:bg-gold/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Customer
          </Button>
          <Button
            onClick={() => { setBulkUploadFile(null); setBulkUploadResult(null); setShowBulkUploadModal(true); }}
            variant="outline"
            className="border-gold text-gold hover:bg-gold/10"
          >
            <Upload className="w-4 h-4 mr-2" />
            Bulk Upload
          </Button>
          <Button
            onClick={() => setShowMembershipManagement(true)}
            variant="outline"
            className="border-gold text-gold hover:bg-gold/10"
          >
            <Crown className="w-4 h-4 mr-2" />
            Manage Memberships
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or phone..."
          className="pl-10"
        />
      </div>

      {/* Add Customer Modal */}
      <Dialog open={showAddCustomerModal} onOpenChange={setShowAddCustomerModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Customer Manually</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="customer-name">Customer Name *</Label>
              <Input
                id="customer-name"
                value={newCustomerForm.name}
                onChange={(e) => setNewCustomerForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter customer name"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="customer-phone">Mobile Number</Label>
              <Input
                id="customer-phone"
                value={newCustomerForm.phone}
                onChange={(e) => setNewCustomerForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="e.g., +919876543210"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Optional - for walk-in customers without phone</p>
            </div>
            <div>
              <Label htmlFor="customer-gender">Gender *</Label>
              <div className="flex gap-2 mt-2">
                {['Men', 'Women', 'Kids'].map((gender) => (
                  <button
                    key={gender}
                    onClick={() => setNewCustomerForm(prev => ({ ...prev, gender }))}
                    className={`flex-1 px-4 py-2 rounded-lg border transition-colors ${
                      newCustomerForm.gender === gender
                        ? 'bg-gold text-black border-gold font-semibold'
                        : 'bg-card border-border hover:bg-muted'
                    }`}
                  >
                    {gender}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleAddCustomer}
                className="flex-1 bg-gold text-black hover:bg-gold/90"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Customer
              </Button>
              <Button
                onClick={() => {
                  setShowAddCustomerModal(false);
                  setNewCustomerForm({ name: '', phone: '', gender: 'Men' });
                }}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Customers Modal */}
      <Dialog open={showBulkUploadModal} onOpenChange={(open) => {
        setShowBulkUploadModal(open);
        if (!open) { setBulkUploadFile(null); setBulkUploadResult(null); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-gold" />
              Bulk Upload Customers
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-800">
              <p className="font-semibold mb-1">How it works</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Download the Excel template below.</li>
                <li>Fill in <b>Name</b>, <b>Mobile No.</b>, <b>Gender</b>, <b>Date of Birth</b> (YYYY-MM-DD).</li>
                <li>Mobile number is the unique key — duplicates are skipped automatically.</li>
              </ul>
            </div>

            <Button
              onClick={handleDownloadTemplate}
              variant="outline"
              className="w-full border-gold text-gold hover:bg-gold/10"
              type="button"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Excel Template
            </Button>

            <div>
              <Label htmlFor="bulk-file" className="text-sm font-medium">Upload filled Excel (.xlsx / .xls / .csv)</Label>
              <Input
                id="bulk-file"
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                onChange={(e) => { setBulkUploadFile(e.target.files?.[0] || null); setBulkUploadResult(null); }}
                className="mt-2"
              />
              {bulkUploadFile && (
                <p className="text-xs text-muted-foreground mt-1">Selected: {bulkUploadFile.name}</p>
              )}
            </div>

            {bulkUploadResult && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-900 dark:bg-green-900/20 dark:text-green-200 dark:border-green-800">
                <p className="font-semibold mb-1">Result</p>
                <ul className="text-xs space-y-0.5">
                  <li>✓ Imported: <b>{bulkUploadResult.inserted}</b></li>
                  <li>↩ Skipped (duplicate phone): <b>{bulkUploadResult.skipped_duplicate}</b></li>
                  <li>⚠ Invalid rows: <b>{bulkUploadResult.skipped_invalid}</b></li>
                </ul>
                {bulkUploadResult.errors && bulkUploadResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-amber-700">View {bulkUploadResult.errors.length} errors</summary>
                    <ul className="text-[11px] mt-1 max-h-32 overflow-auto pr-2">
                      {bulkUploadResult.errors.map((er, i) => (
                        <li key={`${er.row}-${i}`}>Row {er.row}: {er.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleBulkUpload}
                disabled={!bulkUploadFile || bulkUploading}
                className="flex-1 bg-gold text-black hover:bg-gold/90"
              >
                {bulkUploading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" /> Upload &amp; Import</>
                )}
              </Button>
              <Button
                onClick={() => { setShowBulkUploadModal(false); setBulkUploadFile(null); setBulkUploadResult(null); }}
                variant="outline"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer List */}
      <div className="bg-card border border-border rounded-lg">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold mx-auto"></div>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {searchQuery ? 'No customers found matching your search' : 'No customers yet. Customers who book will appear here.'}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredCustomers.map((customer, index) => (
              <div
                key={customer.id || customer.phone || `cust-${index}`}
                onClick={() => setSelectedCustomer(customer)}
                className="p-4 hover:bg-muted cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{customer.name}</h3>
                    <p className="text-sm text-muted-foreground">{customer.phone}</p>
                    {customer.gender && (
                      <span className="text-xs px-2 py-0.5 bg-muted rounded mt-1 inline-block">
                        {customer.gender}
                      </span>
                    )}
                  </div>
                  <Button size="sm" variant="outline">
                    View Details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
