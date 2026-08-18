import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { BranchProvider } from '@/contexts/BranchContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SupplierAuthProvider } from '@/contexts/SupplierAuthContext';
import { CartProvider } from '@/contexts/CartContext';
import { BookingIntentProvider } from '@/contexts/BookingIntentContext';
import { Toaster } from '@/components/ui/sonner';
import ErrorBoundary from '@/ErrorBoundary';

// Layout
import CustomerLayout from '@/components/CustomerLayout';

// Landing Page
import LandingPage from '@/pages/LandingPage';

// User Pages
import UserLoginPage from '@/pages/UserLoginPage';
import PrivacyPolicyPage from '@/pages/PrivacyPolicyPage';
import AuthCallback from '@/pages/AuthCallback';
import SalonSelectionPage from '@/pages/SalonSelectionPage';
import SalonMainPage from '@/pages/SalonMainPage';
import SinglePageBooking from '@/pages/SinglePageBooking';
import HistoryPage from '@/pages/HistoryPage';
import TokenDashboard from '@/pages/TokenDashboard';
import ServicesBrowser from '@/pages/ServicesBrowser';
import SalonMenuPage from '@/pages/SalonMenuPage';
import BarberProfilePage from '@/pages/BarberProfilePage';
import SalonRatingsPage from '@/pages/SalonRatingsPage';
import CustomerWalletPage from '@/pages/CustomerWalletPage';
import CustomerNotificationsPage from '@/pages/CustomerNotificationsPage';
import CustomerProfilePage from '@/pages/CustomerProfilePage';
import ReelsFeed from '@/pages/ReelsFeed';

// Salon Pages
import OTPLoginPage from '@/pages/OTPLoginPage';
import SalonSignupPage from '@/pages/SalonSignupPage';
import EnhancedSalonDashboard from '@/pages/EnhancedSalonDashboard';
import StaffPortal from '@/pages/salon/StaffPortal';
import QuickInvoicePage from '@/pages/salon/QuickInvoicePage';
import AddCustomerPage from '@/pages/salon/AddCustomerPage';
import SellMembershipPage from '@/pages/salon/SellMembershipPage';
import StaffProfilePage from '@/pages/StaffProfilePage';
import PaymentCallbackPage from '@/pages/PaymentCallbackPage';
import ServicePaymentCallbackPage from '@/pages/ServicePaymentCallbackPage';

// Platform Admin (HIDDEN — bookmark /platform/login only, no links from landing)
import PlatformLoginPage from '@/pages/PlatformLoginPage';
import PlatformDashboardPage from '@/pages/PlatformDashboardPage';

// Supplier (Phase 8 & 9) — Marketplace seller portal
import SupplierLoginPage from '@/pages/supplier/SupplierLoginPage';
import SupplierSignupPage from '@/pages/supplier/SupplierSignupPage';
import SupplierPendingPage from '@/pages/supplier/SupplierPendingPage';
import SupplierDashboardPage from '@/pages/supplier/SupplierDashboardPage';
import SupplierProductsPage from '@/pages/supplier/SupplierProductsPage';
import SupplierOrdersPage from '@/pages/supplier/SupplierOrdersPage';
import SupplierOrderDetailPage from '@/pages/supplier/SupplierOrderDetailPage';

// Salon-side Marketplace (Phase 10–12) + Inventory (Phase 14)
import MarketplacePage from '@/pages/salon/MarketplacePage';
import CheckoutPage from '@/pages/salon/CheckoutPage';
import SalonOrdersPage from '@/pages/salon/SalonOrdersPage';
import SalonOrderDetailPage from '@/pages/salon/SalonOrderDetailPage';
import SalonCustomerOrdersPage from '@/pages/salon/SalonCustomerOrdersPage';
import StaffSettingsPage from '@/pages/salon/StaffSettingsPage';

import '@/App.css';

function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider>
        <BranchProvider>
          <WebSocketProvider>
            <SupplierAuthProvider>
            <CartProvider>
            <BookingIntentProvider>
            <div className="App">
              <Toaster position="top-center" richColors />
              <BrowserRouter>
                <Routes>
                  {/* Landing Page */}
                  <Route path="/" element={<LandingPage />} />
                  
                  {/* User Routes */}
                  <Route path="/login" element={<UserLoginPage />} />
                  <Route path="/privacy" element={<PrivacyPolicyPage />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                  <Route path="/data-deletion" element={<PrivacyPolicyPage />} />
                  <Route path="/user/login" element={<Navigate to="/login" replace />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  
                  {/* Customer Routes with Layout */}
                  <Route path="/salons" element={<CustomerLayout><SalonSelectionPage /></CustomerLayout>} />
                  <Route path="/history" element={<CustomerLayout><HistoryPage /></CustomerLayout>} />
                  <Route path="/reels" element={<CustomerLayout><ReelsFeed /></CustomerLayout>} />
                  <Route path="/profile" element={<CustomerLayout><CustomerProfilePage /></CustomerLayout>} />
                  
                  {/* Salon Main Page - New Hub after selecting a salon */}
                  <Route path="/salon/:salonId" element={<CustomerLayout><SalonMainPage /></CustomerLayout>} />
                  
                  {/* Booking Routes (with persistent sidebar) */}
                  <Route path="/book/:salonId" element={<CustomerLayout><SinglePageBooking /></CustomerLayout>} />
                  <Route path="/salon/:salonId/queue" element={<CustomerLayout><TokenDashboard /></CustomerLayout>} />
                  <Route path="/salon/:salonId/services" element={<CustomerLayout><ServicesBrowser /></CustomerLayout>} />
                  <Route path="/salon/:salonId/menu" element={<SalonMenuPage />} />
                  <Route path="/salon/:salonId/barber/:barberId" element={<CustomerLayout><BarberProfilePage /></CustomerLayout>} />
                  <Route path="/salon/:salonId/ratings" element={<CustomerLayout><SalonRatingsPage /></CustomerLayout>} />
                  <Route path="/salon/:salonId/wallet" element={<CustomerLayout><CustomerWalletPage /></CustomerLayout>} />
                  <Route path="/notifications" element={<CustomerLayout><CustomerNotificationsPage /></CustomerLayout>} />
                  
                  {/* Salon Admin Routes */}
                  <Route path="/salon/login" element={<OTPLoginPage />} />
                  <Route path="/salon/signup" element={<SalonSignupPage />} />
                  <Route path="/salon/dashboard" element={<EnhancedSalonDashboard />} />
                  <Route path="/salon/staff-portal" element={<StaffPortal />} />
                  <Route path="/salon/dashboard/quick-invoice" element={<QuickInvoicePage />} />
                  <Route path="/salon/dashboard/add-customer" element={<AddCustomerPage />} />
                  <Route path="/salon/dashboard/sell-membership" element={<SellMembershipPage />} />
                  <Route path="/salon/staff/:staffId" element={<StaffProfilePage />} />
                  <Route path="/salon/marketplace" element={<MarketplacePage />} />
                  <Route path="/salon/checkout" element={<CheckoutPage />} />
                  <Route path="/salon/orders" element={<SalonOrdersPage />} />
                  <Route path="/salon/orders/:orderId" element={<SalonOrderDetailPage />} />
                  <Route path="/salon/inventory" element={<Navigate to="/salon/dashboard?tab=inventory" replace />} />
                  <Route path="/salon/customer-orders" element={<SalonCustomerOrdersPage />} />
                  <Route path="/salon/staff/settings" element={<StaffSettingsPage />} />

                  {/* Subscription / Payment */}
                  <Route path="/subscription/callback" element={<PaymentCallbackPage />} />
                  <Route path="/pay/callback" element={<ServicePaymentCallbackPage />} />

                  {/* HIDDEN — Platform Admin (Part A). Not linked from anywhere. */}
                  <Route path="/platform/login" element={<PlatformLoginPage />} />
                  <Route path="/platform" element={<PlatformDashboardPage />} />
                  <Route path="/platform/dashboard" element={<Navigate to="/platform" replace />} />

                  {/* Supplier Marketplace (Phase 8 & 9) */}
                  <Route path="/supplier" element={<Navigate to="/supplier/login" replace />} />
                  <Route path="/supplier/login" element={<SupplierLoginPage />} />
                  <Route path="/supplier/signup" element={<SupplierSignupPage />} />
                  <Route path="/supplier/pending" element={<SupplierPendingPage />} />
                  <Route path="/supplier/dashboard" element={<SupplierDashboardPage />} />
                  <Route path="/supplier/products" element={<SupplierProductsPage />} />
                  <Route path="/supplier/orders" element={<SupplierOrdersPage />} />
                  <Route path="/supplier/orders/:orderId" element={<SupplierOrderDetailPage />} />

                  {/* Redirect old routes */}
                  <Route path="/admin/login" element={<Navigate to="/salon/login" replace />} />
                  <Route path="/admin/dashboard" element={<Navigate to="/salon/dashboard" replace />} />
                  <Route path="/book" element={<Navigate to="/salons" replace />} />
                </Routes>
              </BrowserRouter>
            </div>
            </BookingIntentProvider>
            </CartProvider>
            </SupplierAuthProvider>
          </WebSocketProvider>
        </BranchProvider>
      </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
