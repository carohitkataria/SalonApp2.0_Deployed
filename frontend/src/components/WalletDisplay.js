import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Crown, Wallet, Calendar, TrendingUp, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import useAutoRefresh from '@/hooks/useAutoRefresh';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function WalletDisplay({ salonId, customerPhone }) {
  const [membership, setMembership] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loyalty, setLoyalty] = useState(null);
  const [redeeming, setRedeeming] = useState(false);

  const fetchWalletData = useCallback(async (silent = false) => {
    if (!salonId || !customerPhone) return;
    if (!silent) setLoading(true);
    try {
      // Fetch membership
      const membershipResponse = await axios.get(
        `${API}/salons/${salonId}/customer-membership/${customerPhone}`
      );
      
      if (membershipResponse.data.has_membership) {
        setMembership(membershipResponse.data);
        
        // Fetch transactions
        const transactionsResponse = await axios.get(
          `${API}/salons/${salonId}/wallet-transactions/${customerPhone}`
        );
        setTransactions(transactionsResponse.data.transactions || []);
      } else {
        setMembership(null);
        setTransactions([]);
      }
      // Fetch loyalty points (independent of membership)
      try {
        const lp = await axios.get(`${API}/salons/${salonId}/customers/${customerPhone}/loyalty-points`);
        setLoyalty(lp.data);
      } catch (_) { setLoyalty(null); }
    } catch (error) {
      console.error('Error fetching wallet data:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [salonId, customerPhone]);

  const redeemPoints = useCallback(async () => {
    if (!loyalty?.can_redeem) return;
    setRedeeming(true);
    try {
      const { data } = await axios.post(
        `${API}/salons/${salonId}/customers/${customerPhone}/loyalty-points/redeem`,
        { points: 0 }
      );
      const { toast } = await import('sonner');
      toast.success(`₹${data.credited} added to your wallet from ${loyalty.points} points`);
      await fetchWalletData(true);
    } catch (err) {
      const { toast } = await import('sonner');
      toast.error(err?.response?.data?.detail || 'Could not redeem points');
    } finally {
      setRedeeming(false);
    }
  }, [loyalty, salonId, customerPhone, fetchWalletData]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  // Background refresh every 20s while the tab is visible.
  useAutoRefresh(() => fetchWalletData(true), 20000, [salonId, customerPhone]);

  const getDaysUntilExpiry = () => {
    if (!membership?.expiry_date) return 0;
    const expiry = new Date(membership.expiry_date);
    const today = new Date();
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const pointsCard = loyalty && loyalty.config?.points_enabled ? (
    <div className="relative overflow-hidden rounded-2xl p-5 border border-gold/40 bg-gradient-to-br from-amber-500/10 to-yellow-600/5" data-testid="loyalty-points-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-full bg-gold/20">
            <TrendingUp className="w-5 h-5 text-gold" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Loyalty points</p>
            <p className="text-3xl font-bold text-foreground leading-none mt-1" data-testid="loyalty-points-balance">{loyalty.points} <span className="text-base font-medium text-muted-foreground">pts</span></p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Worth</p>
          <p className="text-xl font-bold text-gold">₹{loyalty.redeemable_value}</p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Earn {loyalty.config.points_earn_per_100} pts per ₹100 spent · {loyalty.config.points_redeem_rate} pts = ₹1 · min {loyalty.config.points_min_redeem} pts to redeem
      </p>
      <button
        onClick={redeemPoints}
        disabled={!loyalty.can_redeem || redeeming}
        data-testid="loyalty-redeem-btn"
        className={`mt-3 w-full h-10 rounded-xl font-semibold text-sm transition-colors ${loyalty.can_redeem ? 'bg-gold text-white hover:bg-gold/90' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
      >
        {redeeming ? 'Converting…' : loyalty.can_redeem ? `Convert ${loyalty.points} pts → ₹${loyalty.redeemable_value} wallet` : `Need ${loyalty.config.points_min_redeem} pts to redeem`}
      </button>
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
      </div>
    );
  }

  if (!membership) {
    return (
      <div className="space-y-4">
        {pointsCard}
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Wallet className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Active Membership</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Purchase a membership to enjoy exclusive benefits and wallet credits
          </p>
        </div>
      </div>
    );
  }

  const daysUntilExpiry = getDaysUntilExpiry();
  const isExpiringSoon = daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  const isExpired = daysUntilExpiry <= 0;

  return (
    <div className="space-y-4">
      {pointsCard}
      {/* Membership Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-gradient-to-br from-gold via-yellow-600 to-amber-700 rounded-2xl p-6 text-white shadow-2xl"
      >
        {/* Decorative Background */}
        <div className="absolute top-0 right-0 opacity-20">
          <Crown className="w-48 h-48 -mr-12 -mt-12" />
        </div>

        <div className="relative z-10">
          {/* Membership Badge */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 rounded-full backdrop-blur-sm">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs opacity-90">Membership</p>
                <h3 className="text-2xl font-bold">{membership.membership_name}</h3>
              </div>
            </div>
            {isExpired ? (
              <span className="px-3 py-1 bg-red-500 rounded-full text-xs font-semibold">
                Expired
              </span>
            ) : isExpiringSoon ? (
              <span className="px-3 py-1 bg-orange-500 rounded-full text-xs font-semibold">
                Expiring Soon
              </span>
            ) : (
              <span className="px-3 py-1 bg-green-500 rounded-full text-xs font-semibold">
                Active
              </span>
            )}
          </div>

          {/* Wallet Balance */}
          <div className="mb-6">
            <p className="text-sm opacity-90 mb-1">Wallet Balance</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold">₹{membership.wallet_balance}</span>
              {membership.credit_added > 0 && (
                <span className="text-sm opacity-75">/ ₹{membership.credit_added}</span>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/20">
            <div>
              <p className="text-xs opacity-75">Member Since</p>
              <p className="font-semibold">
                {new Date(membership.purchased_at).toLocaleDateString('en-IN', { 
                  month: 'short', 
                  year: 'numeric' 
                })}
              </p>
            </div>
            <div>
              <p className="text-xs opacity-75">
                {isExpired ? 'Expired On' : 'Valid Until'}
              </p>
              <p className={`font-semibold ${isExpiringSoon ? 'text-orange-200' : ''}`}>
                {new Date(membership.expiry_date).toLocaleDateString('en-IN', { 
                  day: 'numeric',
                  month: 'short', 
                  year: 'numeric' 
                })}
              </p>
              {!isExpired && (
                <p className="text-xs opacity-75 mt-1">
                  {daysUntilExpiry} days remaining
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Transaction History */}
      {transactions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-gold" />
            <h4 className="font-semibold">Transaction History</h4>
          </div>

          <div className="space-y-3">
            {transactions.slice(0, 10).map((transaction, index) => (
              <div
                key={transaction.id || index}
                className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/70 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {transaction.transaction_type === 'credit' ? (
                    <div className="p-2 bg-green-500/20 rounded-full">
                      <ArrowUpCircle className="w-4 h-4 text-green-500" />
                    </div>
                  ) : (
                    <div className="p-2 bg-red-500/20 rounded-full">
                      <ArrowDownCircle className="w-4 h-4 text-red-500" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-sm">{transaction.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(transaction.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${
                    transaction.transaction_type === 'credit' 
                      ? 'text-green-500' 
                      : 'text-red-500'
                  }`}>
                    {transaction.transaction_type === 'credit' ? '+' : '-'}₹{transaction.amount}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Bal: ₹{transaction.balance_after}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {transactions.length > 10 && (
            <p className="text-center text-sm text-muted-foreground mt-4">
              Showing 10 of {transactions.length} transactions
            </p>
          )}
        </motion.div>
      )}

      {/* Benefits */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-xl p-6"
      >
        <h4 className="font-semibold mb-3">Membership Benefits</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <span className="text-gold">✓</span>
            Exclusive wallet credits worth ₹{membership.credit_added}
          </li>
          <li className="flex items-center gap-2">
            <span className="text-gold">✓</span>
            Use wallet balance for any service
          </li>
          <li className="flex items-center gap-2">
            <span className="text-gold">✓</span>
            Priority booking and special offers
          </li>
          <li className="flex items-center gap-2">
            <span className="text-gold">✓</span>
            No expiry on wallet balance during membership
          </li>
        </ul>
      </motion.div>
    </div>
  );
}
