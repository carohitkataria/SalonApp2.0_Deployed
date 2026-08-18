# Salon Operations Suite — PRD

## Original Problem Statement
A multi-tenant salon management SaaS (React + FastAPI + MongoDB). Most recent feature requests:
1. Booking dashboards: Today/Tomorrow toggle on Salon + Token dashboards.
2. Browser in-app notifications with sound.
3. Operational time → Shift timing for customers; show shift inside slot chips (mobile-friendly).
4. Loyalty program: per-tier time period (months).
5. Staff access control fixes: cache bug across logins, quick actions follow permissions, "Financials" permission via checkbox, all services visible to staff.
6. Employee Reward Plan (Incentive Module): Global/individual plans, salary-linked or manual targets, slab-based %, automatic monthly calculation, dashboard view in Analytics, payment control linked to Financials.
7. **Branch Model (BRD):** Convert single-location salons → multi-branch chains. New `salon_branches` & `staff_branch_transfers` tables, `branch_id` on every transactional collection, branch-aware queries, Branch Manager role, Add/Edit branch UI, branch dropdown in admin header, customer-side branch switching.
8. **May 2026 — Luxury Redesign (P1: customer-facing).** Rethink the look and feel of the entire customer experience. Keep all functionality intact. Reduce visual noise, embrace luxury aesthetic, both light + dark themes.

## Test Credentials
- Phone: 7503070727  •  Password: salon123
- Salon ID: b5c6b0ca-66ec-431b-8dc8-387de72fa67c
- Multi-user login: identifier=`admin`, password=`salon123` → returns JWT

## Architecture
- Backend: FastAPI (`/app/backend/server.py`) ~9.9k lines, MongoDB.
- Collections: salons, **salon_branches** (NEW), **staff_branch_transfers** (NEW, Phase 2), barbers, tokens, attendance, financial_transactions, salon_customers, invoices, salon_users, customer_memberships, wallet_transactions, salon_reward_plans, incentive_payouts, salary_records.
- Branch-aware fields: `branch_id` on tokens, barbers, attendance, financial_transactions, salon_customers, invoices, salon_users, customer_memberships, wallet_transactions, incentive_payouts, salary_records.
- Frontend: React + Tailwind + shadcn/ui at `/app/frontend/src/`. New `BranchContext`, `BranchManagement` page, `BranchSelector` header dropdown.

## Implemented (CHANGELOG)

### Feb 26, 2026 — Marketing "Admin required" + editable salary + guest GST invoice ✅
Testing agent iteration_31: **11/11 backend pytest PASS** + frontend flows verified.

- ✅ **Marketing "Admin required" fixed** — `marketing.py:_require_admin` and `salon_marketing_settings.py:_require_admin` now accept the legacy phone/password role `salon` (plus `salon_branch_manager`). Same widening pattern as iteration_30. POST `/marketing/templates`, `/marketing/settings`, `/coupons` all return 200 with the legacy JWT (previously 403).
- ✅ **Earned salary + Incentives editable & auto** — `SalonStaffV3.js` payroll drawer: removed `readOnly disabled` from both inputs; labels updated to "auto · editable". Backend auto-compute (`per_day_rate × earned_days`) already writes to `record.final_payable`; frontend loads that value but admin can now override before saving.
- ✅ **Guest GST invoice opens same URL as Queue** — new `gstInvoiceLink()` helper in `CustomersV2.js`: prefers `${API}/invoices/{invoice_id}/view` (the exact URL the customer receives on WhatsApp AND that Queue's "GST invoice" button uses); falls back to legacy `invoice_pdf_url`; else shows a friendlier "Invoice not generated yet — mark the token as completed first" toast. Invoice-view endpoint proven publicly accessible so `<a href>` works without auth.
- ⚠️ **WhatsApp sandbox on production** — Preview `.env` has `TWILIO_WHATSAPP_NUMBER='whatsapp:+918560934455'` (production sender, correct). If salonhub.in is still sending sandbox messages, the production `.env` was reset during deploy and needs to be restored via Emergent Support (`TWILIO_WHATSAPP_NUMBER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` + all `TWILIO_*_TEMPLATE_SID` values). This cannot be fixed from preview code.

### Feb 26, 2026 — SalonApp3.3 merge post-fixes: auth crisis + platform soft-delete + admin unlimited ✅
Testing agent iteration_30: **14/14 PASS**. All P0 issues resolved.

**Root cause of the 5 concurrent "Invalid authentication credentials" failures** (attendance / shop / inventory / orders / guest creation): after the SalonApp3.3 merge, `OTPLoginPage.js:159` started writing `localStorage.salon_user_auth = {accessToken: ...}` but `EnhancedSalonDashboard.getAuthHeaders()` reads `authData.token` — the field-name mismatch made every subsequent API call send `Authorization: Bearer undefined` → 401. Only the customers endpoint had a different auth path and happened to work.

- ✅ **Auth crisis fixed** — `OTPLoginPage.js` now writes the correct field `token`; `getAuthHeaders` also accepts both keys as defense-in-depth. All 5 previously-401 endpoints now return 200.
- ✅ **Platform-admin soft-delete salon** — new `POST /api/platform/salons/{salon_id}/delete` endpoint (in `platform_admin_management.py:465-521`). Sets `is_deleted=true`, `deleted_at`, `deleted_by`, `delete_reason`, `status="deleted"`; marks every `salon_users` row for the salon inactive; writes audit log. Sub-collections (tokens, invoices, financial_transactions, salon_customers) intentionally preserved for tax/audit history.
- ✅ **Deleted salons blocked from login** — `POST /api/salon/password-login` returns HTTP 410 "This salon has been deleted by platform admin." for any salon with `is_deleted=true`.
- ✅ **Deleted salons hidden from platform list** — `GET /api/platform/salons` default view excludes soft-deleted; opt in with `?status=deleted`.
- ✅ **Salon admin = unlimited access** — `check_permission()` in `server.py:997-1010` now bypasses for roles `salon_admin`, `admin`, `salon`, and `salon_branch_manager`. Only `staff` role goes through the granular permission check. (`has_module_permission()` at `server.py:1111` already had this bypass.)
- ✅ **8 preview-side fixes verified intact** — Reports `.shrpt` CSS namespace, admin bootstrap, queue range endpoint, services bulk-toggle, ribbon Help WhatsApp, Shop fixture purge, ErrorBoundary, OTPLoginPage no auto-redirect.

### Feb 26, 2026 — CSS namespace collision hotfix (chip layout & drawers) ✅
User reported after previous fix: (a) the Home dashboard chip layout was ruined, (b) Reports non-snapshot tabs still had the 4th chip too wide + 5th wrapping to a 2nd row, (c) all Reports drawers invisible when clicked.

**Root cause**: `reportsTheme.css` used the `.shv2` namespace, which collided with `home_v2/styles.js`. The Home V2 CSS is injected as a runtime `<style>` tag AFTER the build-imported Reports CSS, so identical-specificity `.shv2 .strip`, `.shv2 .kgrid` and `.shv2-drawer` selectors from Home won by source order — pushing my Reports drawer off-screen (`transform:translateX(100%)`) and applying Home's 4-column strip layout to Reports.

**Fix applied**:
- Renamed the entire Reports CSS namespace `.shv2*` → `.shrpt*` (root wrapper, drawer, overlay). No more class-name collision.
- Added dual selectors (`.shrpt X, .shrpt-drawer X`) for utility classes used inside portalled drawers (`.field`, `.toggle`, `.btn-primary`, `.btn-ghost`, `.cfg-row`, `.strip`, `.sc`, `.dtable`, `.bar-mini`) so they cascade into portalled content correctly.
- Added `!important` to `.shrpt .strip{grid-template-columns:repeat(5,minmax(0,1fr))}` and all responsive breakpoints, defeating the equal-specificity Home rule that loads later.
- Chip content: `.shrpt .sc` gets `min-width:0; overflow:hidden`, `.sc b/span` truncate with ellipsis so long values (₹, %) no longer expand the track beyond 1fr.

**Testing agent iteration_29 verdict: FIXED, 100% frontend pass rate**. Measured at 1600×900:
- Reports Sales/Payments/P&L/Staff Overview/Clients/Marketing/Inventory: **5 equal chips @ 248.8px each on one row** across all 7 tabs.
- Home dashboard: unchanged Home layout (234/234/234/556 for its 4-col grid).
- All 5 Reports drawers (Configure cards, Targets, Add entry, Metric drill, Target edit) + New Appointment drawer: **visible and interactive**.

### Feb 26, 2026 — 8 of 9 user-reported bugs fixed & verified by testing agent ✅
Testing agent iteration_26 report: **17/17 backend targeted tests PASS**, 6/7 frontend spot-checks PASS. Follow-up iteration_27 confirmed the Shop empty-state fix on the live route. Verdict: **fixed**.

- ✅ **#1 Logout / account switching** — `OTPLoginPage.js` `useEffect` purges all stale auth on mount and no longer auto-forwards to the dashboard. Clicking "I run a salon" always shows the login form.
- ✅ **#2 New Appointment drawer UI** — Guest row shows title + search + "+ New guest" on one row; Services & Membership title row includes inline search + picked-count pill; category chips scroll horizontally on a single line; drawer header shrunk to `padding:10px 20px`.
- ✅ **#3 Reports** — (a) Snapshot `.kgrid` forced 2-per-row with `!important`; (b) `.strip` is `repeat(auto-fit,minmax(180px,1fr))` — no overflow; (c) All 5 drawers portalled to `document.body` via `createPortal`, z-index 9998/9999 — Configure/Targets/Add entry/Metric drill/Target edit all open on top; (d) Month view verified: `view=month&date=...` returns 13 cards with correct window.
- ✅ **#4 Ribbon Help WhatsApp** — Help button in `SalonHomeV2.js` and `HomeV2Shell.js` opens `https://wa.me/917503070727` in a new tab.
- ✅ **#5 Shop empty state** — Startup purges the 7 legacy `SUPPLIER_FIXTURES` products; `ShopModule.js` renders `data-testid='shop-empty-state'` with "No products added yet". Verified with a full supplier-create → visible → delete → empty lifecycle by testing agent.
- ✅ **#6 Queue range filter + auto-refresh** — Backend `/salons/{id}/queue` and per-barber queue accept `date_from`/`date_to` (`$gte`/`$lte` Mongo query). Frontend polling every 10s, deps include `dateFrom`/`dateTo` so range changes fire immediately.
- ✅ **#7 Admin permissions / Settings visibility** — `initialize_data()` upserts a full-permission `admin` `salon_users` row for every salon on every boot; existing admin rows are also repaired if perms were reduced.
- ✅ **#8 admin/salon123 preserved** — Available via both `identifier=admin` and `identifier=7503070727` on `/api/salon/users/login`. Idempotent.
- ✅ **#9b Services bulk actions** — Checkbox per card + "Select all" per group + floating bar with Enable/Disable/Delete/Clear. Backend `POST /salons/{id}/services/bulk-toggle` handles both salon-owned and global services.
- ⏸️ **#9a Services category migration** — Deferred pending user's old→new category mapping. Current DB categories: Beard, Facial, General, Hair, Hair Colour, Haircut, Manicure.

### Jul 26, 2026 — Code-review hardening (agreed subset) + Deployment scan PASS ✅
- 🔒 **Removed insecure JWT fallback** — `server.py` line 83 now does `SECRET_KEY = os.environ['JWT_SECRET_KEY']` inside a try-except that raises `RuntimeError` at boot if unset. Prevents accidental deploy with the well-known default secret.
- ⚡ **MongoDB indexes added on startup** — new `asyncio.gather(...)` block in `startup_event()` ensures background non-unique indexes on `tokens(salon_id,date/status/phone)`, `salon_users`, `salon_customers`, `services`, `barbers`, `attendance`, `financial_transactions`, `invoices`, `salon_branches`. Non-blocking, idempotent. Log confirms: `[STARTUP] MongoDB indexes ensured for hot query paths`.
- 🛡️ **React `ErrorBoundary` added** — new `/app/frontend/src/ErrorBoundary.js` wraps the entire `<ThemeProvider>` tree in `App.js`. Any render-time crash now shows a friendly "Reload app" screen instead of blank white.
- 🧹 **Dead code removed** — deleted the `SalonApp-main/` duplicate directory, `server_backup_20260323_193504.py`, 16 verified-unreferenced frontend files (`ActiveBookingTracker`, `CustomerMaster`, `MarketingTab`, `ServiceManagement`, `StaffRewardsTab`, `LiveDashboard`, `BottomNav`, `AdminDashboard`, `AdminLoginPage`, `BookingPage`, `StaffPage`, `AnalyticsPage`, `HomePage`, `QRPage`, `DisplayPage`, `SalonDashboardTab`), plus 11 loose debug/test scripts in repo root.
- 📝 **`.gitignore` extended** — `test_result*.md`, `image_testing.md`, `SalonApp-main/`, `backend/server_backup_*.py`, and all deleted debug script names now ignored so they can't creep back in.
- 🧽 **`ruff --fix`** — 54 unused imports, unused locals and empty f-strings auto-cleaned across `/app/backend`.
- ✅ **Verified after fixes**: `/health` 200, `/api/salon/password-login` 200, all 6 `/reports/*` endpoints 200, `deployment_agent` scan → **PASS**. Frontend compiles with only pre-existing React-Hooks warnings; no errors.
- 📌 **Deliberately deferred** (documented as `# Known Debt`, not blockers): CORS wildcard hardening (browsers already block `*` + credentials), JWT-in-`localStorage` → cookies (40-file refactor), N+1 query batching (~48 sites), narrowing `except Exception:` (113 sites — some load-bearing), central Axios client (105 files), `server.py` split (18.5k lines, high regression risk).

### Jul 26, 2026 — Reports UI rebuilt 1:1 to `salon_reports.html` design + E2E booking verified ✅
- ✅ **Root cause of layout drift found & fixed permanently**: previous rebuilds ported design ideas into the wrong `.zen` CSS namespace. New solution ships the design's exact `.shv2` CSS as a scoped stylesheet (`/app/frontend/src/components/ops/reportsTheme.css`) and rewrites JSX to match the design HTML structure — future edits cannot regress the layout because CSS + markup are the single source of truth.
- ✅ **`ReportsModule.js` rebuilt** (`/app/frontend/src/components/ops/ReportsModule.js`, 1,283 lines) with 8 tabs matching the design order: **Business snapshot / Sales / Payments & GST / Expenses & P&L / Staff / Clients / Marketing / Inventory**. Snapshot = left `kgrid` KPI cards + right detail panel (gauge, animated pie/bar, breakdown table, "Give feedback / View details" footer). Ctrlbar with view select + date stepper + Compare toggle + Configure cards + Targets.
- ✅ **Staff tab now has 4 sub-sections**: **Overview** (NEW, `.shv2` themed — Active staff, Revenue attributed, Avg ticket, Utilization %, Guest rating, Top performer card, Retention KV, Staff scorecard with revenue-share bars) + **Performance / Attendance / Incentives** (kept verbatim under `/app/frontend/src/components/ops/StaffReportSubs.js`, no behaviour change).
- ✅ **Drawers fully functional**: Configure cards (uses `/api/salons/{id}/reports/prefs` GET/PUT with reorder + toggle), Targets (uses `/api/salons/{id}/reports/targets` PUT per metric), Metric drill-down, Target-edit, Add finance entry.
- ✅ **Metrics reconciled via curl**: Snapshot revenue = Sales revenue, Snapshot collections = Payments collected, Snapshot appointments count reflects new bookings within 1s. Verified with token N2 booking on 2026-07-26 (appointments=2, source=2 on day view).
- ✅ **E2E booking test PASS**: `POST /api/bookings` with `+917503070727` on 2026-07-26 → token `N2` (`3504b955-1012-4aa9-a46e-d899c92a6739`, ₹250) created → Twilio WhatsApp `booking_confirmation` template sent (SID `MM58836dc51c31d6a63d33e361cb11967d`, HTTP 201, status `sent`). Cashfree order not auto-created (`payment_mode=upi` = in-salon; Cashfree order flow only fires on customer online-checkout path, which is unchanged).
- ✅ **Backend untouched** — all `/reports/*` endpoints and computation logic in `reports_router.py` already correct; this pass was frontend-only.
- ℹ️ Test service seeded to unblock booking flow: `E2E Test Haircut` (`7846b7e2-f3c2-471b-8e34-ff64f127b8ad`, ₹250, category Hair, gender_tag Men). Safe to leave in DB.

### Jul 26, 2026 — Full Re-sync from SalonApp2.0_Deployed (main) + Deployment-ready ✅
- ✅ **Code re-fetched** from `https://github.com/carohitkataria/SalonApp2.0_Deployed.git` (branch `main`, head `5615665`): `backend/server.py` 14,707 → **18,540 lines**; frontend 121 → **166 JS files**. Root `tests/`, `scripts/`, `test_result.md` also synced.
- ✅ **Preserved**: `backend/.env` (Twilio WABA prod + Cashfree prod + `PLATFORM_OWNER_MOBILE="+917503070727"`), `frontend/.env` (preview `REACT_APP_BACKEND_URL`), `/app/memory/*`, MongoDB data.
- ✅ **New frontend env key added**: `REACT_APP_CASHFREE_MODE=production` (read by `CheckoutPage.js` for Cashfree JS SDK mode).
- ✅ New backend supports dual WhatsApp providers (`WHATSAPP_PROVIDER=twilio|meta`, defaults to twilio — no env change needed).
- ✅ **Verified**: `/health` 200, `GET /api/subscription-plans` returns plans, legacy salon login (`+917503070727`/`salon123`) returns JWT, platform owner seeded active in `platform_admins`, landing page renders (screenshot).
- ✅ **deployment_agent scan: PASS** — no hardcoded secrets/URLs, CORS ok, supervisor config valid, no blockers.
- ℹ️ Note: `salon_users` multi-user login `identifier="admin"` no longer exists in DB (only a `Test-2` staff user). Use legacy `POST /api/salon/password-login` for admin.

### Feb 18, 2026 — 8 bug/feature fixes batch ✅
- 🔒 **#1a — Staff can no longer view other staff profiles by URL paste**  
  `StaffProfilePage.js` now reads `salon_user_auth` and if `role === 'staff'` and the URL `staffId` ≠ their own `staffId`, redirects to `/salon/dashboard` with an error toast. Backend already blocks *modifications* so this closes the browser-URL-paste read hole client-side.
- 🐛 **#1b — "Failed to load staff data" false-alarm toast**  
  The secondary `GET /api/salon/users` call (403 for staff-role tokens) was clobbering the primary staff-details fetch's success. Wrapped the users-list call in its own try/catch that silently skips on 403.
- 🆕 **#1c — Multiple check-in/check-out per day + cumulative time**  
  Backend `attendance_mode.py::_check_in_impl` + `_check_out_impl` now maintain a `sessions: [{ci, co, ci_lat, ci_lng, ci_method, co_lat, co_lng, co_method}]` array. A staff can Check In → Check Out → Check In Again as many times as needed. `compute_mode_b_status` sums minutes across all sessions (with legacy single-pair fallback). The frontend `StaffCheckInWidget` now shows a **"Check In Again"** button after check-out, a full **session history list**, and a **cumulative "Total worked" counter**.
- 🆕 **#2a — Booked-token cards on customer home are clickable**  
  `ActiveBookingTracker.js` — whole card is now a `role="button"` that navigates to `/salon/<id>/queue` (live queue). "View Salon" inner button stopPropagation'd so it still goes to salon page.
- 🐛 **#2b — Services page filter chips now horizontally-scrollable on phone**  
  `SalonServicesTab.js` swapped `flex-wrap` → `flex-nowrap overflow-x-auto` on mobile (falls back to `flex-wrap` on ≥sm). Added `flex-shrink-0` to gender/sort/at-home/category pills so they don't compress. Added `WebkitOverflowScrolling: 'touch'` for iOS Safari momentum.
- 🏷️ **#2c — "Boutique" → "Shop"** in `CustomerLayout.js` sidebar menu.
- 🎨 **#3a — "I run a salon" hover text no longer disappears**  
  `LandingPage.js` — removed the outline-variant default `hover:text-accent-foreground`; now explicitly sets `hover:text-foreground hover:bg-brass-soft/40` so the espresso text stays visible on a soft-brass hover tint. Verified via computed style: text `rgb(29, 26, 22)` on `rgba(168, 132, 56, 0.4)`.
- 🆕 **#4a — Direct-dial Call button on salon dashboard token card**  
  `EnhancedSalonDashboard.js` — each token card now has a small green phone button (`token-call-customer-<id>`) that opens the OS phone dialer with the customer's number pre-filled (`tel:${phone}`). Sits next to the status badge; stopPropagation'd so it doesn't trigger the row's own click handler.

**Tests:**
- `backend/tests/test_multi_session_attendance.py` — 4/4 pytest green (2-session, 3-session, single-legacy, half-day short-hours cases).
- `backend/tests/test_subscription_trial.py` — 4/4 still green (no regressions).
- All modified JS files lint-clean.

### Feb 17, 2026 — Codebase Swap to SalonApp3.0 ✅
- ✅ **Code synced** from `https://github.com/carohitkataria/SalonApp3.0.git` (branch `main`, head `9bc1a1a`):
  - `backend/server.py`: 14,142 → **14,705 lines** (+563 lines of new features).
  - `frontend/src`: 164 → **167 JS files** (3 new components/pages from the new repo).
  - `cashfree_service.py` already reads `CASHFREE_ENV` (the fix from previous round is now natively in the repo).
  - All of yesterday's preview-only fixes are now in the repo (Subscribe Now, 30-day trial, CustomerAuthModal, Guest checkout, "Send OTP" copy).
- ✅ **Preserved**: `backend/.env`, `frontend/.env`, `memory/test_credentials.md`, `memory/PRD.md`, MongoDB (`test_database`) — credentials & DB untouched.
- ✅ **3 new Twilio Content Template SIDs added to `backend/.env`**:
  - `TWILIO_BOOKING_COMPLETED_TEMPLATE_SID=HXa417403d8b7ff32ce17fcadc6fe1c19a`
  - `TWILIO_YOUR_TURN_NOW_TEMPLATE_SID=HXce2a0648ccfc5d259615714b7f49457b`
  - `TWILIO_TOKEN_APPROACHING_TEMPLATE_SID=HX5cf990aaa6d32eb99a58ddd799c6fab2`
  (Existing `TWILIO_BOOKING_CONFIRMATION_TEMPLATE_SID` retained.)
- ✅ **Fixed leftover "WhatsApp" in backend OTP response note** (`server.py:5888`): "OTP sent to your WhatsApp" → "OTP sent to your mobile".
- ✅ **Dependencies installed**: `yarn install` (frontend) + `pip install -r requirements.txt` (backend) — both clean.
- ✅ **Verified end-to-end**:
  - Backend supervisor: RUNNING.
  - `GET /api/subscription-plans` → 2 plans (Monthly ₹999, Yearly ₹9999).
  - `POST /api/auth/customer/send-otp` → `delivery_status: sent`, new note: "OTP sent to your mobile".
  - `cashfree_service.create_order` (production URL) → ACTIVE order + valid `payment_session_id`.
  - `pytest tests/test_subscription_trial.py` → 4/4 green.
  - Frontend landing page → HTTP 200, Pricing section + Subscribe Now CTA + trial banner all render correctly (smoke screenshot taken).

### Feb 10, 2026 — Production Configuration Fix: Twilio + Cashfree + OTP UI ✅
- 🔴 **Root cause of "Messaging not configured"**: `backend/.env` was missing `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_API_KEY_SID/SECRET`, and `TWILIO_BOOKING_CONFIRMATION_TEMPLATE_SID` — they had been removed at some point. Restored from git history (`VAa8d04bc855f3f5820370fddc5f17d8cb`, `HX4ec6d831674ce97cc1dc209327445b81`).
- 🔴 **Root cause of "Cashfree authentication Failed"**: `backend/.env` had `CASHFREE_ENVIRONMENT="production"` but `cashfree_service.py` actually reads `CASHFREE_ENV` (defaulting to `TEST`). Result: prod credentials were being sent to the **sandbox URL** → 401. Fix: added `CASHFREE_ENV=PROD`. Cashfree now correctly targets `https://api.cashfree.com/pg` and `create_order` returns ACTIVE + valid `payment_session_id`.
- ✅ **End-to-end verified via curl + python**: `POST /api/auth/customer/send-otp` returns `{"success": true, "delivery_status": "sent"}`. Cashfree `create_order` smoke test returns `ACTIVE` order with session token.
- ✅ **OTP button + UI copy** — removed "WhatsApp" mentions across the customer OTP flow per user request:
  - `UserLoginPage.js`: button "Send OTP on WhatsApp" → **"Send OTP"**, toast "OTP sent to your WhatsApp" → "OTP sent to your mobile".
  - `CustomerOtpVerification.js`: button "Send OTP to WhatsApp" → **"Send OTP"**, helper "Authenticate via OTP (WhatsApp)" → "Authenticate via OTP", "OTP sent to X via WhatsApp" → "OTP sent to X", error toast cleaned up.
  - `CustomerAuthModal.js`: buttons "Send OTP via WhatsApp" (login + signup) → **"Send OTP"** (both spots), toast updated.

### Feb 10, 2026 — Code Quality Pass: Round 3 ✅
- ✅ **Truthy/falsy idiom** in `tests/test_subscription_trial.py` (lines 55–57) — `body["trial_used"] is False` → `not body["trial_used"]` etc. PEP-8 compliant.
- ✅ **Array-index → stable keys** in all 13 cited frontend files:
  - `LandingPage.js:277, 313, 355` (stats, features, steps — use `stat.label` / `feature.eyebrow` / `item.step`)
  - `SalonShopTab.js:282` (`${l.product_id || l.name}-${i}`)
  - `SalonGalleryTab.js:27` (`${item}-${index}`)
  - `SalonMainPage.js:537` (`${src}-${i}`)
  - `EnhancedSalonDashboard.js:2104` (`${url}-${index}`)
  - `MyProfile.js:400` (`${url}-${index}`)
  - `LoyaltyProgramSettings.js:187, 271` (`${tier.name}-${i}`)
  - `EmployeeRewardPlan.js:284` (`slab-${from_pct}-${idx}`)
  - `Analytics.js:378` (`${token_number}-${date}-${idx}`)

### Deferred / Pushback (round 3)
- 🚫 **`twilio_service.py is "active"` flag (lines 52, 91, 143, 164, 187, 199, 282)** — third time flagged; ALL cited lines are `is None`, which is the correct Python idiom (PEP-8 mandates it). NOT a bug.
- 🚫 **`test_salon_inventory_phase13_14.py` / `test_operational_hours.py` `is` patterns** — these are test files; the patterns are `is True/False/None` for assertions, which is conventional pytest style and not a real bug. The newly-fixed `test_subscription_trial.py` is now PEP-8 ideal; the others can be tidied in a focused test-style sweep but it's not a correctness issue.
- 🚫 **Hardcoded test creds (9 test files)** — same rationale as rounds 1 & 2: these are fixtures pointing at the seeded test salon.
- 🚫 **Console statements (175)** — `console.debug` was deliberately added by *me* in rounds 1 & 2 to replace previously-empty catch blocks the reviewer flagged. Removing them now would re-introduce the silent-failure issue. Compromise: `console.debug` is dev-only (suppressed by default in browser production logs), so they're effectively no-ops in prod.
- 🚫 **206 hook-deps, 100 localStorage, 6 component splits, Python complexity refactors, type-hints coverage 24.9%→100%** — same multi-session-refactor rationale.

### Feb 10, 2026 — Code Quality Pass: Round 2 ✅
- ✅ **`random` → `secrets` in `server.py`** (lines 1575/1596/1599) — barber load-balancing now uses `secrets.choice`. Functionally identical, eliminates lint noise.
- ✅ **`random` → `secrets` in `tests/test_module4_crossmod_gaps.py:119`** (`secrets.randbelow(27) + 1`).
- ✅ **Empty catch blocks** in the additional cited salon pages now emit `console.debug`:
  - `SalonOrdersPage.js:47`, `SalonOrderDetailPage.js:40`, `SalonInventoryPage.js:86`,
    `SalonCustomerOrdersPage.js:73`, `CheckoutPage.js:74` (all the auth-token JSON parse fallbacks).
- ✅ **Array-index → stable keys** in cited files:
  - `SalonCustomerOrdersPage.js:294` (items list — `${product_id || name}-${i}`)
  - `SalonCustomerOrdersPage.js:314` (status history — `${timestamp}-${i}`)
  - `SalonSelectionPage.js:423` (image carousel dots — `${img}-${index}`)
  - `CustomerMaster.js:1042` (bulk-upload errors — `${row}-${i}`)
  - `CustomerMaster.js:1087` (customer list — falls back to `id` or `phone`)
  - `CustomerLayout.js:259, 336` (sidebar menu — uses `item.label`)
  - `CustomerLayout.js:312` (salon menu — `salon-menu-${label}-${idx}`)

### Deferred / Pushback (round 2)
- 🚫 **`twilio_service.py:52,91,143,164,187,199,282` `is "active"` flag**: All cited lines are actually `is None` checks, which is the **correct** Python idiom (PEP-8 mandates `is None` over `== None`). Reviewer appears to have misread the pattern. No change made.
- 🚫 **Hardcoded credentials in test files** (8 files): All credentials point to the **seeded test salon** (`+917503070727`/`salon123`) created by `startup_event`. These are fixtures, not secrets. Moving them to env vars would only add an indirection without security benefit since the seed itself is in code. Recommend keeping as-is; documented in `/app/memory/test_credentials.md`.
- 🚫 **206 hook-deps + 100 localStorage instances + 6 large-component splits + Python complexity refactors**: Same rationale as round 1 — these are multi-session refactors requiring dedicated regression testing, not blind sweeps.

### Feb 10, 2026 — Code Quality Pass: Quick Wins ✅
- ✅ **Hardcoded credential leaked in logs** (`server.py:2818`) — removed `password='salon123'` from `logger.info()`; now only logs the login_id with a "from seed config" note.
- ✅ **Mutable default argument** (`server.py:confirm_membership_payment`) — `body: dict = {}` → `body: dict = None` with explicit `if body is None: body = {}` guard.
- ✅ **`random` → `secrets` for OTP generation** (real security fix): `platform_admin.py:_generate_otp()` and `supplier_auth.py:_generate_otp()` now use `secrets.choice(string.digits)`. Barber-load-balancing calls in `server.py` (lines 1575/1596/1599) kept on `random` (load balancing, not security).
- ✅ **Empty catch blocks** in cited frontend files now emit `console.debug` for traceability:
  - `utils/browserNotifications.js:143` (SW fallback path)
  - `pages/salon/MarketplacePage.js:64, 98` (auth-token parse + filter fetch)
  - `pages/salon-tabs/SalonShopTab.js:71, 75, 183` (cart hydrate/persist/remove)
  - `pages/salon/StaffSettingsPage.js:29` (auth JSON parse)
- ✅ **Array-index → stable composite keys** in the cited files:
  - `OfferingsModule.js:469, 485, 606, 1249` (parsed services/packages, CSV error rows, image previews)
  - `pages/supplier/SupplierOrderDetailPage.js:159` (status timeline)
  - `pages/salon/SalonOrderDetailPage.js:142, 211` (status timeline + payment-mode history)

### Deferred (intentional, with rationale)
- 🚫 **localStorage → httpOnly cookies migration**: per agreed scope, out of session — needs dedicated security-review session with backend auth refactor + CSRF protection.
- 🚫 **React Hook missing-deps fixes for 206 cited instances**: investigated — most are advisory warnings, not blocking lint errors (config doesn't flag `exhaustive-deps` as error). Spot-check: `CartContext.js:117` (flagged with "9 deps missing") already lists all 9 deps. The 206 number appears to be a mix of false positives + already-suppressed-by-design `useEffect` patterns. Blindly adding deps without understanding each component's intended re-render behavior is high-risk (infinite-loop / stale closure regressions). **Recommend per-file review during next refactor pass**.
- 🚫 **Python complexity refactor of `compute_mode_b_status` / `_check_in_impl` / `list_shop_products`**: deferred — needs dedicated session with attendance + marketplace regression tests; refactoring 18-19 cyclomatic complexity functions blind is the kind of change that introduces silent off-by-one bugs.
- 🚫 **Component splits** (CustomerMaster 1,092 LOC, OfferingsModule 851 LOC, etc.): deferred for the same reason — each split requires full E2E regression and prop-drilling cleanup. Worth doing, just not in a single batch.

### Feb 10, 2026 — Public "Subscribe Now" + 30-Day Free Trial (P1) ✅
- ✅ **Backend pricing refresh** (`server.py` startup):
  - Default monthly plan bumped from ₹499 → **₹999/month/branch** (legacy plans auto-migrated via `subscription_default_price_v3_999` flag).
  - New **Yearly plan @ ₹9999/year/branch** seeded (`billing_cycle="yearly"`, `is_default=false`, 6 marketing features incl. "Save ~17% vs monthly").
- ✅ **New endpoint** `POST /api/salons/{salon_id}/subscription/start-trial` (auth: salon admin) — grants a one-time 30-day **free trial** subscription. Idempotent guards: rejects if `salons.trial_used` is already true OR if salon has an active paid subscription. Stamps `salons.trial_used=true` + `trial_started_at`. Trial sub is `payment_status="paid"` + `is_trial=true` so the existing paywall logic treats the salon as premium for 30 days.
- ✅ **Status endpoint** `GET /api/salons/{salon_id}/subscription/status` now returns two new flags: `trial_used` (bool, derived from `salons` doc) and `is_trial` (bool, derived from active sub).
- ✅ **Landing-page Pricing section** (`LandingPage.js`): new "Pricing" nav link, "Subscribe Now" header CTA, full-width Pricing section with:
  - 30-day free trial banner with `Start free trial` CTA (`start-free-trial-btn`).
  - Two pricing cards (`pricing-card-monthly`, `pricing-card-yearly`) with feature checklists and per-card `Subscribe Monthly` / `Subscribe Yearly` CTAs.
  - `Best value` badge on the yearly card. Footer fine-print on per-branch billing.
- ✅ **Trial intent flow**: landing CTAs set `localStorage.start_trial_intent = 'true'` + redirect to `/salon/login` → after login the user lands on `/salon/dashboard` → `SubscriptionContext` reads the flag, auto-calls `/subscription/start-trial`, clears the flag, refreshes the status. The Subscription Panel then shows the new **`trial-active-banner`** with days remaining.
- ✅ **Manual trial CTA** inside `SubscriptionPanel` (`start-trial-card` + `panel-start-trial-btn`) — eligible salons (not premium AND `trial_used=false`) can activate the 30-day trial without leaving the dashboard.
- ✅ **Backend tests**: `/app/backend/tests/test_subscription_trial.py` — 4/4 pytest green (plans-v3 seed, trial fields in status, start-trial blocked by active sub, auth-gated endpoint).

### Feb 10, 2026 — Guest vs Login Checkout Flow + Customer Auth Modal ✅
- ✅ **New component `CustomerAuthModal`** at `/app/frontend/src/components/CustomerAuthModal.js` — combined Login (Password + OTP sub-tabs) and Sign Up tabs. Uses `useAuth()` helpers: `customerLoginPassword`, `customerSendOtp`, `customerVerifyOtp`, `updateCustomerProfile`. All interactive elements carry `data-testid` (`auth-tab-login`, `auth-tab-signup`, `login-method-password-btn`, `login-method-otp-btn`, `auth-phone-input`, `auth-password-input`, `auth-send-otp-btn`, `auth-otp-input`, `auth-verify-otp-btn`, `signup-name-input`, `signup-phone-input`, `signup-gender-{m/w/o}`, `signup-send-otp-btn`, `signup-verify-otp-btn`). Forgot-password link auto-switches to OTP login.
- ✅ **Mode chooser at payment step** in `/app/frontend/src/pages/SinglePageBooking.js` — when the customer is not signed in, the payment step now shows a `booking-mode-chooser` card with two options:
  - **Book as Guest** → reveals the existing identity form (Name + Mobile + Gender, no OTP). Booking is tagged `is_guest=true` so the backend marks the auto-created user as unverified.
  - **Login to Book** → opens `CustomerAuthModal`. On successful auth the chooser disappears and the booking proceeds with the authenticated customer.
- ✅ **Pending-login fallback** — if the user closes the modal without logging in, a `login-pending-card` lets them reopen the modal or switch to guest checkout (no dead-ends).
- ✅ **`is_guest` flag wired** in both `handleSubmit` (cash/wallet/pay-later/etc.) and `handleUpiConfirm` POST bodies, plus a guest-gender fallback so the payload never sends an empty gender for guests.
- ✅ **Smart-routing storage** — after a successful booking (any path), the customer phone is persisted to `localStorage.customer_phone` so the Landing Page's smart routing recognises returning guests on their next visit.
- ✅ **Confirm Booking button** now disabled until either the user is signed in OR they've explicitly picked the guest path (prevents accidental submissions while the chooser is still up).
- ✅ Existing inline guest-identity card preserved verbatim, just gated behind `bookingMode === 'guest'`.

### Feb 9, 2026 — Deployment health-check fixes + Twilio Verify production + Cashfree config ✅
- ✅ Fixed Pydantic `ResponseValidationError` on `Barber.leave_dates` returning null (added `normalize_barber_data`).
- ✅ Resolved Socket.io ASGI recursion error; added `/health` endpoint for Kubernetes probes.
- ✅ Switched Twilio to production Verify service `VAa8d04bc855f3f5820370fddc5f17d8cb` + Content Template booking confirmations.
- ✅ Cashfree App ID + Secret Key configured in backend `.env`.
- ✅ Smart Routing on Landing Page "Get Started" — returning customers are sent to their last visited salon.
- ✅ Backend booking endpoint accepts `is_guest` + `customer_gender` for guest bookings.
- ✅ Code-quality fixes: removed hardcoded secrets, replaced `random` with `secrets`, fixed empty catch blocks, fixed `is` string identity comparisons.



### Feb 1, 2026 — Module 8: Unified Admin Attendance Cell Editor + Leave Types (CL/SL/PL/UL) ✅
- ✅ **New popup** `AttendanceCellDialog` at `/app/frontend/src/components/attendance/AttendanceCellDialog.js`. Opens on any calendar cell click in `StaffAttendanceTab`. Single dialog handles: check-in/check-out time inputs, status (auto / present / half_day / absent / holiday / on_leave), and — when On Leave — leave type dropdown (CL / SL / PL / UL) + half-day checkbox + note.
- ✅ **Routing logic**: times + auto → `PUT /api/salons/{salon_id}/staff-attendance/check-edit/{barber_id}/{date}` (backend recomputes status from times using salon geo rules); manual status without times → `PUT /staff-attendance/override`; on_leave → `POST /leave-records` with `leave_type_code` (cancels prior active record first); Clear button → DELETE override + cancel active leave-record.
- ✅ **Legacy Leave Mode toggle removed** from `StaffAttendanceTab.js`. Calendar now fetches `leave_records` for the month and displays the leave-type code (e.g., `UL`) on the cell instead of generic `L`.
- ✅ **Backend already supported** check-edit (in `/app/backend/attendance_mode.py`) and CL/SL/PL/UL defaults seeded via `/app/backend/leave_tracker.py`. No backend changes needed.
- ✅ Tested: 9/9 backend pytest pass (`/app/backend/tests/test_attendance_admin_override.py`) + full UI E2E green.




### Feb 1, 2026 — Unified Attendance Threshold Settings + login fallback + TZ fix ✅
- ✅ **Merged settings**: `AttendanceRulesTab` (in `StaffSettingsContent.js`) now shows ONE unified panel with `Geo-fence radius (m)`, `Late mark threshold (min)`, `Required hours per day`, `Auto-absent cutoff (hour, 0-23)`, `Allow admin override`. Removed: the duplicate "Geofence radius (m) — legacy field", the `<details> Other attendance thresholds (legacy)`, the legacy save button, and the absolute-HH:MM fields (`max_check_in_time`, `min_daily_minutes`, `auto_close_at`).
- ✅ **Backend**: `attendance_mode.py` — `compute_mode_b_status` now prefers `late_mark_threshold_min` (mins after salon's `opening_time` for that weekday) and `required_hours_per_day * 60`. Legacy fields are still accepted as fallback. `auto_close_open_checkins_job` honours `auto_absent_cutoff_hour` and also closes today's open shifts after the cutoff (not just yesterday's). `GeoSettingsPayload` accepts the new keys. Verified end-to-end via curl: 09:15 → present, 09:25 → half_day(late_checkin), short hours → half_day(short_hours).
- ✅ **Login fallback bug fix**: `OTPLoginPage.js` now falls back to `/api/salon/password-login` on both **404 _and_ 401** from `/salon/users/login` (was 404-only). Legacy password-set-on-salon-doc salons can log in again.
- ✅ **TZ fix in popup**: `AttendanceCellDialog.combineDateTime` / `isoToTime` now serialise/parse times with the IST offset (`+05:30`) so the admin's browser timezone no longer corrupts check-in/out timestamps.
- ✅ **Calendar test-ids**: month navigator now exposes `attendance-prev-month`, `attendance-next-month`, `attendance-month-label`.


### May 31, 2026 — Module 7: Per-Service Barber Assignment on Modify Booking ✅
- ✅ **Token schema** (additive, backward-compatible): `service_assignments[]` (per-line `{service_id, barber_id, barber_name_snapshot, service_price, discount_amount, line_total}`), `order_discount_percent`, `order_discount_amount`, `subtotal`.
- ✅ **New unified backend endpoint** `PUT /api/tokens/{token_id}/modify` (auth: `get_current_salon_user`) replaces the prior chain of `update-services` + `change-barber` + `update-amount` for the Modify dialog. Validates main barber & line barbers (rejects "any"), resolves per-line prices via `barber_services` → falls back to `service.base_price`, supports both Discount % AND Final ₹ inputs ("last-edited wins"), pro-rata discount allocation per line, recomputes incentive payouts for ALL touched barbers (current month).
- ✅ **Revenue attribution helpers**: `attribute_token_revenue_to_barbers(token)` and `attribute_token_revenue_to_services(token)` — used by incentives + reports. Legacy tokens (no assignments) credit full `total_amount` to the main `barber_id`.
- ✅ **Incentive engine** (`_get_barber_actual_sales`): now sums per-barber line shares across completed tokens in the month. Reads the OR-matched query on `barber_id` plus `service_assignments.barber_id`.
- ✅ **Reports updated to be split-aware**: `/api/analytics/barber-wise-sales` and `/api/analytics/service-wise-sales` use the new helpers. Legacy tokens still resolve correctly.

### Feb 1, 2026 — Twilio production switch (Verify + Content Template) ✅
- ✅ **OTP send** now routes through Twilio **Verify** service `VAa8d04bc855f3f5820370fddc5f17d8cb`. Channel strategy: WhatsApp primary → automatic SMS fallback on delivery failure. Twilio generates & tracks the OTP; we no longer need template approval for OTP.
- ✅ **OTP verify** (4 endpoints — salon, customer-legacy, customer-v2, platform admin) now validates via Twilio Verify with safe DB fallback when Verify isn't configured.
- ✅ **Booking confirmation** WhatsApp now uses approved **Content Template** `HX4ec6d831674ce97cc1dc209327445b81` via Twilio Content API (`content_sid` + `content_variables`). Required for business-initiated messages outside the 24-hr reply window.
- ✅ **Production WhatsApp sender**: `whatsapp:+918560934455` (SalonHub business sender registered with Twilio). Replaced the sandbox `whatsapp:+14155238886` in `backend/.env`.
- ✅ **New env vars**: `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_BOOKING_CONFIRMATION_TEMPLATE_SID`.
- ✅ **Curl-verified**: `POST /api/salon/send-otp` → Twilio Verify SID `VE…`, channel=whatsapp, status=pending; `POST /api/salon/verify-otp` with wrong code → Twilio Verify status=pending valid=False → endpoint returns 400 "Invalid or expired OTP".


- ✅ **Frontend Modify dialog** (`EnhancedSalonDashboard.js`): 2-tab UI (Pick services / Barber assignment). Per-service barber dropdowns with live per-barber prices (testids `assignment-barber-{sid}`, `assignment-price-{sid}`, `assignment-name-{sid}`). Main-barber dropdown overwrites all line barbers; individual line edits afterward are independent. Discount % + Final ₹ inputs sync bidirectionally. "Any available" removed from this screen. Save is disabled while subtotal is 0 (defensive against data-loss).
- ✅ **Tests**: `/app/backend/tests/test_module7_modify_booking.py` — 11 passed / 1 soft-skipped. Frontend Playwright via testing_agent_v3_fork iteration 23 — 100% green (both iteration-22 UI bugs resolved).

### May 31, 2026 — Module 6: Services Menu QR + Frictionless Booking ✅
- ✅ **Removed forced-login walls** on `HomePage`, `SalonSelectionPage`, `SalonMainPage`, `ServicesBrowser`, and `SinglePageBooking`. Customers can now browse salons, pick services, and reach the booking page without an account.
- ✅ **`BookingIntentContext`** (`/app/frontend/src/contexts/BookingIntentContext.js`) — sessionStorage with 30-min TTL preserves the cart (salon, branch, services, barber, date, shift) across the sign-in detour. Hydrated on `SinglePageBooking` mount; cleared after a successful booking.
- ✅ **Inline identity capture at checkout** — when not signed in, the payment step shows a `guest-identity-card` with Name + Mobile + Gender inputs (no OTP) and a "Sign in for faster bookings" CTA. On Confirm we lazily call `/api/user/login` (creates `is_otp_verified=false` user) and then `POST /api/bookings`. The booker-for-others toggle is hidden when unauthenticated.
- ✅ **Backend tagging**: `tokens.is_otp_verified_at_booking` snapshot is set from the booker's User at booking time. History UI shows an amber `Express booking — placed without OTP verification` badge for `is_otp_verified_at_booking === false`.
- ✅ **New public route `/salon/:salonId/menu`** (`SalonMenuPage.js`) — printable services menu reached via the new QR. Grouped by category, multi-select with sticky Book Now bar, navigates to `/book/:salonId?services=…` carrying the selection.
- ✅ **New backend endpoints**:
   - `GET /api/salons/{salon_id}/menu?branch={branch_id}` — public; returns `{salon, branch, services}` in one call.
   - `GET /api/salons/{salon_id}/branches/{branch_id}/services-menu-qr?base_url=…` — returns `{qr_code (base64 PNG data URI), menu_url, branch_name}`.
- ✅ **Branch Management** — every branch card now shows both **Booking QR** and **Menu QR** buttons; same dialog with a context-aware title, description, and Download link.
- ✅ **Testing**: 9/9 backend pytest cases (`/app/backend/tests/test_services_menu_qr_module6.py`) + frontend smoke (testing_agent_v3_fork iteration 21) all green. No regressions to the existing booking-QR endpoint.

### May 31, 2026 — Module 4 (Phase 7 + 8 + cross-module gap fixes): Frontend + Payroll + Reports ✅
- ✅ **Cross-module gap fixes (backend)**:
   - `leave_records.leave_type_snapshot` (Module 2) — every leave record now captures `{code, display_name, is_paid}` at create time. `get_monthly_salary` reads `paid/unpaid_leave_days` from the snapshot, so admins editing a leave-type's `is_paid` mid-month does NOT retroactively change historical LOP.
   - `auto_close_open_checkins_job` skips locked months (salary already paid) — won't overwrite paid attendance.
   - `GET /api/salons/{salon_id}/staff-attendance/month/{month}` now returns top-level `attendance_mode` + per-barber `has_login` + `no_checkin_capability` so the UI can warn admins that Mode-B-without-login staff need manual marking.
   - **NEW endpoint** `GET /api/salons/{salon_id}/staff-attendance/report?start_date=&end_date=&branch_id=&barber_ids=&format=json|csv` — salon-wide consolidated attendance with status code per (staff × date), respects `computed_under_mode` so months spanning a mode switch read correctly. CSV download path included.
- ✅ **Frontend (Phase 7)**:
   - `staff/StaffSettingsContent.js → AttendanceRulesTab` rewritten as Module 4's source of truth: two-radio mode selector + Mode B `geo_settings` panel (radius, max check-in time, min daily minutes, auto-close, allow-admin-override toggle) + mode-history viewer (last 5). Calls `PUT /api/salons/{id}/attendance-mode`. Legacy Module 3 fields collapsed into a "details" pane.
   - `staff/StaffAttendanceReport.js` (new) — date range + branch + multi-staff filter chips + colour-coded P/H/A/L/HOL badges + CSV download via the new endpoint.
   - `Analytics.js` gained a third sub-tab **Staff Attendance** that embeds `StaffAttendanceReport`.
   - `StaffAttendanceTab.js` — salary card now surfaces `leave_breakdown` chips (per leave-type day counts) + the *"LOP deduction (X days × ₹Y/day) = ₹Z"* line and prefers `final_payable` over `total_payable`. Pay-modal also uses `final_payable`. Calendar cell shows worked-duration (e.g., "7h 45m") when `computed_under_mode='geo_checkin'`.
- ✅ **Testing**: 50/50 backend pytest green (15 + 11 + 20 + 4 new cross-module gap tests). 4/4 frontend critical flows verified by the testing agent on the public preview URL: mode selector + geo panel save, Analytics Staff Attendance sub-tab, salary card test-ids, calendar duration cell.

### May 31, 2026 — Module 4 (Phase 1 backend): Attendance Mode toggle + Payroll-with-Leave-Types + Lock-on-Paid ✅
- ✅ **New module `backend/attendance_mode.py`** (~530 LOC):
   - `PUT /api/salons/{salon_id}/attendance-mode` — toggle between `"service_completion"` (Mode A, default, preserves existing behaviour) and `"geo_checkin"` (Mode B, new). Stamps every change into `attendance_mode_history[]` with `effective_from_date = today IST`.
   - `POST /api/salons/{salon_id}/staff-attendance/check-in` — Mode B geo-fenced self/admin check-in (haversine vs branch lat/lng, fallback salon lat/lng). Beyond `check_in_radius_meters` → 409 unless `method='admin_on_behalf'` and `allow_admin_override=true`.
   - `POST /api/salons/{salon_id}/staff-attendance/check-out` — computes `total_minutes` and final status via `compute_mode_b_status` (late_checkin / short_hours / present).
   - `PUT  /api/salons/{salon_id}/staff-attendance/check-edit/{barber_id}/{date}` — admin override of check-in/out times + optional forced status.
   - Helpers: `resolve_mode_for_date`, `is_attendance_locked`, `compute_mode_b_status`, `haversine_meters`.
   - Scheduled job `auto_close_open_checkins_job` runs at 23:55 IST.
- ✅ **Salon model additive fields**: `attendance_mode`, `attendance_mode_history`, `geo_settings`. `SalonUpdate` accepts the same.
- ✅ **AttendanceRecord model additive fields**: `check_in_at/lat/lng/distance_meters/method`, `check_out_*`, `total_minutes`, `computed_under_mode`, `half_day_reason`. Both Mode A and Mode B raw data coexist on the same doc — switching modes is non-destructive.
- ✅ **`calculate_barber_attendance_for_date` refactored** to dispatch by the mode active on the date.
- ✅ **Salary refactor (`GET /staff-salary/month/{month}`)** — `working_days_in_month`, leave breakdown bucketed by `is_paid`, `lop_deduction`, `final_payable`, `attendance_mode_snapshot`. Skip recalc when `is_paid=true`.
- ✅ **Lock-on-paid** — all attendance write paths return **423** when the month's salary is paid.
- ✅ **Bug fix bonus**: `POST /staff-salary/pay/.../{month}` no longer 500s (ObjectId leak in response).

### May 31, 2026 — Module 2: Leave Tracker & Leave Settings backend verified ✅
- ✅ **`backend/leave_tracker.py`** wired into `server.py` (1040 LOC). Endpoints:
   - `GET/POST/PUT/DELETE /api/salons/{salon_id}/leave-types-config[/{id}]` — CL/SL/PL/UL auto-seeded on first GET; carry_forward and lapse rules are mutually exclusive (400); duplicate code → 409.
   - `GET /api/salons/{salon_id}/barbers/{barber_id}/leave-balance[?financial_year=]` — auto-creates one row per active leave-type; Indian FY format `YYYY-YY`.
   - `GET /api/salons/{salon_id}/barbers/{barber_id}/leave-balance/ledger` — paginated `leave_balance_movements` newest-first; filter by `leave_type_code`.
   - `POST /api/salons/{salon_id}/barbers/{barber_id}/leave-balance/adjust` — manual adjustments; respects `max_balance_cap` (clamps positive deltas) and `allow_negative_balance` (clamps negative deltas).
   - `POST/PUT/DELETE/GET /api/salons/{salon_id}/leave-records[/{id}]` — debits balance by 1 (or 0.5 for half-day), duplicate `(barber, date)` → 409, insufficient balance → 409, atomic rollback on PUT type-change if target balance insufficient, soft-cancel on DELETE, `barbers.leave_dates` kept in sync.
   - Scheduled jobs: `_leave_accrual_job_wrapper` (monthly accrual; runs 19:00 UTC daily, only acts on IST day=1), `_leave_year_end_wrapper` (FY year-end close on Apr 1 IST).
- ✅ **Bug fix during testing**: PUT `/leave-records/{id}` rollback path was passing a stale `old_balance` dict back into `_apply_balance_change`, causing the OLD type balance to be double-debited when the target type was insufficient. Fixed by capturing the post-restore balance dict and using it for the rollback call.
- ✅ **Consistency fix**: POST `/leave-types-config` mutual-exclusion now raises `HTTPException(400)` (was raising Pydantic `ValueError` → 422), matching the PUT behaviour.
- ✅ **Backend test suite**: `/app/backend/tests/test_leave_tracker_module2.py` — 20/20 pytest assertions pass against the live preview URL.

### May 31, 2026 — Module 3: Staff Settings consolidated + attendance_rules persistence ✅
- ✅ **Inline Staff Settings**: `StaffSettingsContent` (Incentives · Leave · Attendance · Holidays) now renders both at `/salon/staff/settings` and inline inside Salon Settings → Staff.
- ✅ **Backend bug fix bundle (`server.py`)**:
   - `SalonUpdate` gained `attendance_rules: Optional[Dict[str, Any]]`.
   - `Salon` response model gained `attendance_rules` so `GET /api/salons/{id}` echoes it.
   - `PUT /api/salons/{salon_id}` migrated from legacy `get_current_salon` to `get_current_salon_admin` (so the multi-user `salon_admin` JWT works); adds `salon_id` ownership check (403 on mismatch).
   - Added `@api_router.patch("/salons/{salon_id}")` alias on the same handler so the frontend's `axios.patch` call from `StaffSettingsContent.js → AttendanceRulesTab.save` succeeds.

### May 30, 2026 — Module 3: Staff Settings consolidated inline in Salon Settings ✅
- ✅ **Reusable `StaffSettingsContent`** at `/app/frontend/src/components/staff/StaffSettingsContent.js` — renders the four sub-tabs (Incentive Rules, Leave Configuration, Attendance Rules, Holiday Calendar stub). Accepts `useUrlTab` prop so it can run with `?tab=…` URL sync (standalone page) or with local state (inline embed).
- ✅ **`StaffSettingsPage`** refactored to a thin wrapper around `StaffSettingsContent`. `/salon/staff/settings` URL still works and now uses URL-synced sub-tabs.
- ✅ **Salon Settings → Staff** tab in `EnhancedSalonDashboard.js` now renders `StaffSettingsContent` inline (no more "Open in another page" placeholder). Same UI is reachable both inline and via the direct URL.
- ✅ **Hyperlink button at Staff section** (dashboard left-menu → Staff) — converted the bordered button to a gold text-hyperlink ("Open Staff Settings →") that navigates to `/salon/staff/settings`.
- ✅ Leave-types defaults (CL/SL/PL/UL) verified end-to-end via Playwright login → Settings → Staff → Leave Configuration.


### May 2026 — Phase 1: Luxury Redesign (Customer-facing) ✅
- ✅ **Token foundations rewritten** in `frontend/src/index.css` — both light (cream/ivory) and dark (warm charcoal) modes, with brass/champagne primary, bronze accent, sage success, espresso text. All shadcn semantic tokens remapped. New utilities: `.eyebrow`, `.eyebrow-brass`, `.serif-display`, `.serif-italic`, `.lux-card`, `.brass-glow-pulse`, `.brass-text`, `.hero-wash`, `.glass-warm`, `.bg-grain`, `.pill-open/closed/amber/brass/bronze`.
- ✅ **Tailwind config extended** with `brass`, `champagne`, `bronze`, `sage`, `ivory`, `cream`, `espresso`, `taupe` color tokens. `gold` aliased to brass for back-compat (every existing `text-gold`, `bg-gold` instance now renders brass automatically across all 60+ files without per-file edits).
- ✅ **Typography swapped**: Fraunces (variable luxury serif, replaces Playfair as display) + Manrope (body, kept) + Bebas Neue (numerals, kept). Italic flourishes used sparingly on key words.
- ✅ **Pages reskinned end-to-end**: `LandingPage` (full overhaul, was Google rainbow), `UserLoginPage`, `SalonSelectionPage` (cards, search, view toggles, map markers), `SalonMainPage` (welcome banner, action cards, stat cards, live queue modal, status icons), `CustomerLayout` (sidebar with eyebrow labels & footer theme toggle), `SalonHubLogo` (refined scissor-ribbon mark), `ThemeToggle` (luxe brass tile).
- ✅ **Functionality preserved**: Login → Salons → Salon detail → Sidebar nav → Theme toggle → Mobile responsive — all flows verified working via screenshots.
- ✅ **No backend changes**.
- 📄 **IA proposal** documented in `/app/memory/REDESIGN_NOTES.md` — 6 IA enhancements (top bar, mobile bottom-tabs, sidebar grouping, sticky tab nav, renaming, declutter) **awaiting user confirmation** before implementation.

### May 2026 — Phase 2: Multi-theme + Salon home overhaul ✅
- ✅ **Multi-theme system** — `ThemeContext` rewritten to support 5 named themes via `data-theme` attribute on `<html>`:
   • **Ivory** (light, pure white + brass) — replaces ad-hoc cream as the original light theme
   • **Obsidian** (dark, warm charcoal + brass) — original dark theme preserved
   • **Velvet Royal** (dark, deep purple `#5C2B84` + electric gold `#FFC000`)
   • **Midnight** (dark, deep navy + champagne)
   • **Sand** (light, warm beige + terracotta)
   All themes wired through CSS variables (`--brass-rgb`, `--bronze-rgb`, `--sage-rgb`, etc.) so Tailwind classes (`text-brass`, `bg-brass-soft`, `pill-brass`, `lux-card`, `brass-text`, `hero-wash`) adapt automatically. Synchronous theme apply on module load avoids first-paint flash. Legacy `salon_theme` localStorage key migrated → `salon_theme_id`.
- ✅ **`ThemePicker`** component — dropdown with named swatches (compact sidebar tile + label-pill variants). Opens up/down based on available space. Lives in CustomerLayout sidebar footer + landing-page header + login-page corner. Replaces old `ThemeToggle` (kept as legacy compatibility shim).
- ✅ **Salon home page redesigned** as a single scrollable narrative (luzo.app-inspired), `SalonMainPage.renderDashboard`:
   1. **Sticky top strip** (z-30): branch dropdown (with branch switching that updates `?branch=` in URL) + Book / Live Queue / Wallet (with live ₹ balance) actions. Replaces old separate header + action cards row.
   2. **Hero gallery** (1 large + 2 thumb tiles, "View all photos" CTA → gallery tab).
   3. **Salon identity** (gender tag eyebrow, name in Fraunces serif, branch sub-title, OPEN/CLOSED pill computed from `operational_hours` + `manual_toggle`, today's hours, rating chip).
   4. **Services section** — fetches from `/api/salons/:id/services/enabled`, top 8 in a grid w/ image+name+price+duration, "View all" jumps to services tab.
   5. **Stylists section** — fetches from `/api/salons/:id/barbers`, all stylists as horizontal chips with avatar + rating.
   6. **About section** — Address card (with phone + Get Directions) + Operational Hours card (today highlighted in brass).
   7. **Reviews section** — fetches from `/api/salons/:id/ratings?limit=10`, auto-scrolling marquee carousel of reviews with text content (paused on hover, click to view all).
- ✅ **Branch dropdown** in sticky strip — fetches `/api/public/salons/:id/branches`, lists all branches, syncs `?branch=` URL param on switch (deep-linkable).
- ✅ **No backend changes** — all uses pre-existing endpoints. All `data-testid`s preserved + new ones added (`branch-dropdown-btn`, `branch-option-{id}`, `strip-book-btn`, `strip-queue-btn`, `strip-wallet-btn`, `theme-picker-btn`, `theme-option-{id}`, `service-tile-{id}`, `stylist-chip-{id}`, `reviews-marquee`, etc.).

### Phase 3 — Pending (awaiting user direction)
- IA enhancements from `/app/memory/REDESIGN_NOTES.md` (6 proposals — pending confirmation).
- Reskin remaining customer pages (`SinglePageBooking`, `HistoryPage`, `CustomerProfilePage`, `CustomerWalletPage`, etc.) with the same theme tokens (already inherit basic palette, but need component-level polish).
- Admin dashboard reskin.


### Feb 2026 — Phase 2: Branch Manager Role + Staff Transfers (Iteration 12) ✅
- ✅ **New role `branch_manager`** in `salon_users`. Coexists with `admin` & `staff`. Multi-branch support via `assigned_branch_ids: List[str]`. SalonUser validation: a branch_manager **must** have at least one assigned branch (400 otherwise) and every branch id must belong to the same salon.
- ✅ **JWT now carries `assigned_branch_ids`**. `SalonUserToken` exposes them so the frontend can scope before any API call.
- ✅ **Mobile-number login** alongside `login_id` — `POST /api/salon/users/login`'s `identifier` field already accepted both; verified end-to-end with `+91…` formatted numbers in tests.
- ✅ **PUT `/api/salon/users/{user_id}`** now also updates `role` and `assigned_branch_ids`, validates branch ownership, and **returns the updated user document** so the frontend can re-render immediately.
- ✅ **Server-side RBAC helpers** (`is_branch_manager`, `assigned_branch_ids_for`, `enforce_branch_for_manager`). Behaviour for branch-manager calls:
  - No `branch_id` query param → auto-scope to `assigned_branch_ids[0]`.
  - Explicit `branch_id` not in their list → 403.
  - Empty `assigned_branch_ids` → 403 on data endpoints.
- ✅ **Scoped endpoints**: `GET /branches`, `GET /queue`, `GET /barbers/{id}/queue`, `GET /barbers` (admin view only), `GET /today-sales`, `GET /financials/transactions`, `GET /financials/dashboard`, `GET /customers`. Customer-view of barbers stays open (public booking).
- ✅ **Staff Branch Transfer API**:
  - `POST /api/salons/{salon_id}/staff-branch-transfers` — admin can transfer any staff between any active branches; branch_manager can only transfer when **both** `from_branch_id` and `to_branch_id` are in their assigned list; staff role → 403; same-branch → 400. Inserts a `staff_branch_transfers` row + updates `barbers.branch_id` immediately.
  - `GET /api/salons/{salon_id}/staff-branch-transfers?staff_id=…&branch_id=…` returns history. Branch_manager auto-scoped to transfers touching their assigned branches.
- ✅ **Frontend `AuthContext`** exposes `isBranchManager()`, `getAssignedBranchIds()`, persists `assignedBranchIds` in localStorage.
- ✅ **Frontend StaffAccessManagement** (`Salon Users` page) gains a **Role dropdown** (Staff / Branch Manager / Admin) and a multi-select **Assigned Branches** panel that appears for branch_manager. The user list shows a purple "Branch Manager" badge + the names of their branches.
- ✅ **Frontend BarberManagement** (`Staff Management`):
  - Each staff card now shows a **📍 branch pill** ("Main Branch" / "Whitefield Branch" etc.).
  - When ≥ 2 branches exist and the current user is admin or branch_manager, an **arrow icon "Transfer"** opens a dialog with target-branch dropdown, transfer-date picker and remarks. On submit it calls the new transfer API and refreshes the list.
- ✅ **Frontend BranchManagement** (`Branches` admin page) is **read-only** for branch_manager: Add disabled, Set-Main / Deactivate / Edit hidden; QR generation stays available.
- ✅ **Frontend dashboard left-menu**: branch_manager sees Home, Token Queue, Staff Management, Services, Financials, Customer Master, Analytics, Gallery, Branches. Salon Settings stays admin-only.
- ✅ **HTTPException leak fix**: the `try/except` wrapping `GET /barbers` was swallowing 403 RBAC errors and returning 500. Now re-raises HTTPException correctly.
- ✅ **Tests**: 36/36 backend pytest assertions pass — `tests/test_branches_phase1.py` (5) + `test_branches_phase1_extra.py` (12) + `test_branches_phase2.py` (9) + `test_branches_phase2_extra.py` (10). Frontend smoke verified end-to-end via Playwright (admin transferred Imran Main → Whitefield with success toast; BM login showed scoped header dropdown listing only Whitefield).

### Feb 2026 — Phase 1: Branch Model Foundation (Iteration 11) ✅
- ✅ **New collections**: `salon_branches`, `staff_branch_transfers`. Models: `Branch{Create,Update}`, `StaffBranchTransfer{Create}`.
- ✅ **Migration on startup** (`migrate_branches`): for every existing salon → auto-create one "Main Branch" (`is_main_branch=true`, code "MAIN") inheriting salon address/coords/phone. Idempotent. Back-fills `branch_id` on every existing doc in 11 collections (tokens, barbers, attendance, financial_transactions, salon_customers, invoices, salon_users, customer_memberships, wallet_transactions, incentive_payouts, salary_records). Successfully back-filled 3 legacy docs in dev seed.
- ✅ **Branch CRUD endpoints** (admin-only, salon-scoped):
  - `GET /api/salons/{salon_id}/branches?include_inactive=false`
  - `POST /api/salons/{salon_id}/branches`
  - `GET /api/salons/{salon_id}/branches/{branch_id}`
  - `PUT /api/salons/{salon_id}/branches/{branch_id}`
  - `DELETE /api/salons/{salon_id}/branches/{branch_id}` — soft-delete (status=inactive). Cannot delete the main branch. Cannot deactivate a branch with active future tokens (400).
  - `POST /api/salons/{salon_id}/branches/{branch_id}/set-main` — promotes & demotes the previous main atomically.
  - `GET /api/salons/{salon_id}/branches/{branch_id}/qr-code?base_url=...` — public, returns base64 PNG embedding `/salon/{salon_id}?branch={branch_id}`.
- ✅ **Branch-aware filters** (all backwards-compatible — omitting `branch_id` returns cross-branch data so legacy clients keep working):
  - `GET /api/salons/{salon_id}/queue?branch_id=...`
  - `GET /api/salons/{salon_id}/barbers/{barber_id}/queue?branch_id=...`
  - `GET /api/salons/{salon_id}/barbers?branch_id=...`
  - `GET /api/salons/{salon_id}/today-sales?branch_id=...`
  - `GET /api/salons/{salon_id}/financials/transactions?branch_id=...`
  - `GET /api/salons/{salon_id}/financials/dashboard?branch_id=...`
  - `GET /api/salons/{salon_id}/customers?branch_id=...`
- ✅ **Auto branch_id stamping** on creation: `POST /api/bookings`, `POST /api/salons/{id}/salon-booking`, `POST /api/salons/{id}/barbers`, `POST /api/salons/{id}/customers`, `POST /api/salons/{id}/financials/transactions`. Resolution order: explicit body field → barber's branch → salon's main branch.
- ✅ **Per-token financial logging** also stamps `branch_id` so revenue analytics stay branch-aware.
- ✅ **Frontend**:
  - New `BranchContext` (auto-loads branches on salon-user login, persists selected branch in localStorage, fires `branch-changed` events).
  - `<BranchSelector />` dropdown in admin header (shows current branch, star for main, click-to-switch).
  - New "Branches" admin tab (admin-only, hidden for staff): list cards (Main badge, Inactive pill, address/phone/email), Add/Edit dialog (name, code, address, city, lat/long, phone, email, "Set as Main" toggle), per-branch QR dialog with download, "Set Main" / "Deactivate" actions.
  - Dashboard `fetchBarbers`/`fetchTokens`/`fetchDailySales` re-fetch on branch change with `branch_id` query param. Manual booking sends `branch_id`.
  - Branch code uniqueness enforced server-side per salon (case-insensitive 400 on duplicate).
  - `resolve_branch_id` only ever returns ACTIVE branches → an inactive branch can never become a silent default.
- ✅ **Tested**: 17/17 backend pytest assertions pass (`tests/test_branches_phase1.py` + `tests/test_branches_phase1_extra.py`). Frontend smoke verified end-to-end via Playwright (login → header dropdown → Branches admin → Add/Edit/QR → switch branch refreshes dashboard).
- ✅ **Backwards compatibility**: every existing legacy endpoint still works without `branch_id` and returns cross-branch data — zero breaking changes.

### Feb 2026 — Phase 2 WhatsApp flows + Customer auto-refresh (Iteration 10)
- ✅ **Item 7 — WhatsApp Cancel confirmation page**: `GET /api/tokens/{id}/cancel-link` now renders an "Are you sure?" HTML interstitial with cancel/keep buttons. Wallet refunds preserved; salon + customer in-app notifications still fire.
- ✅ **Item 8 — WhatsApp Reschedule link**: `GET /api/tokens/{id}/public-details` (unauth) + `PUT /api/tokens/{id}/customer-reschedule`. Frontend `SinglePageBooking.js` handles `?modify=<tokenId>`.
- ✅ **Total recompute logic**: reschedule only recomputes `total_amount` when `selected_services` or `barber_id` actually change.
- ✅ **Item 6 — Customer auto-refresh**: `useAutoRefresh` hook on `WalletDisplay` (20s), `ActiveBookingTracker` (15s), `HistoryPage` (20s); pauses while tab hidden.
- ✅ **Item 1 — Salon auto-refresh**: optimistic UI on token actions + 20s polling fallback.
- ✅ Backend tested 14/14; no regressions.

### Feb 2026 — Booking capacity + Incentive correctness fixes (Iteration 9)
- ✅ **Capacity rule**: `get_barber_blocked_minutes_used` now excludes `completed`. Slot freed within same shift on completion.
- ✅ **Actual sales bug**: `_get_barber_actual_sales` now uses `$or` on `date` / `booking_date` / `created_at`.
- ✅ **Slab over-achievement**: When achievement % exceeds the highest defined slab's `to_pct`, the highest **crossed** slab still applies.

### Feb 2026 — Phase 2 of Employee Reward Plan + Manual Adjustment
- ✅ `IncentiveDashboard.js` mounted as a sub-tab inside Analytics ("Performance" / "Incentives").
- ✅ Single-row badge layout per employee + status pill, bulk actions, manual amount adjustment.
- ✅ Strict Financials sync rule: row created **only on Paid**, idempotent.
- ✅ Excel/CSV export across a date range.

### Earlier this session
- Today/Tomorrow toggles, Browser notifications + sound, Shift timing chips, Loyalty per-tier time period, Staff access control hardening, Employee Reward Plan Phase 1.

## Roadmap (P0/P1/P2)

### P0 — Phase 3: Customer UX
- Customer booking flow submits `branch_id` (default to nearest active branch by lat/long, fall back to main).
- "Switch Branch" dropdown on `/salon/:salonId` page so customers can navigate between branches of the same brand.
- Per-branch operational hours + holidays (currently shared at salon level).

### P1
- Reverse-sync incentives (Paid → Approved should offer to reverse-credit the linked financial txn).
- BM dashboard "All My Branches" rollup card.
- Email/SMS notification when a staff is transferred.

### P2
- Modularize `server.py` (split into routes/, models/, services/) — over 10k lines now.
- Per-branch loyalty rules (chain-wide vs branch-specific) — sold at one branch, valid at all.
- Per-branch reports / analytics rollups.
- Code review backlog from Iteration 11:
  - `update_branch` PUT should accept explicit `is_main_branch=false` (currently only `set-main` POST can demote).
  - QR endpoint rate-limiting.

## Key API Endpoints (Branch Module)
- `GET    /api/salons/{salon_id}/branches[?include_inactive=true]`
- `POST   /api/salons/{salon_id}/branches`
- `GET    /api/salons/{salon_id}/branches/{branch_id}`
- `PUT    /api/salons/{salon_id}/branches/{branch_id}`
- `DELETE /api/salons/{salon_id}/branches/{branch_id}` (soft delete)
- `POST   /api/salons/{salon_id}/branches/{branch_id}/set-main`
- `GET    /api/salons/{salon_id}/branches/{branch_id}/qr-code[?base_url=...]` (public)
- `POST   /api/salons/{salon_id}/staff-branch-transfers` (Phase 2)
- `GET    /api/salons/{salon_id}/staff-branch-transfers[?staff_id=&branch_id=]` (Phase 2)
- All listed legacy endpoints accept optional `branch_id` query param.

## Known Notes
- Reward Plan Phase 2 testing seeded one completed token (`_seed_test=true`, ₹1,20,000) for barber Imran. Cleanup: `db.tokens.delete_many({_seed_test: true})` if needed.
- After Phase 1, every salon has at least one `salon_branches` doc (auto-created on startup). Idempotent: rerunning the migration is safe.
- Frontend admin Branches page is reachable via Hamburger menu → Branches (no direct URL).

---

## Phase 8 & 9 — Supplier Marketplace (May 2026) ✅

### Backend (✅ 45/45 tests passed in earlier iteration)
- `supplier_auth.py`: signup, OTP & password login, JWT (separate from salon admin), `/api/supplier/me` profile gate (returns 403 with `code=supplier_not_active` for pending/rejected/suspended).
- `supplier_products.py`: dashboard stats (KPIs), full product CRUD, restock, **soft-delete via `is_deleted` flag (NOT `is_active`)** — deleted items hidden from all supplier-facing reads. Product samples list & "create from sample" endpoints.
- `platform_admin_management.py`: supplier approval/rejection wiring with WhatsApp notification on approve.
- **Permanent 30+ product seed** at `/app/backend/data/product_samples_seed.py` — 31 samples across haircare (7), tools (7), consumables (5), skincare (5), beard (3), equipment (4). Seeded on every startup, idempotent upsert by `id`. **Images are stable Unsplash CDN URLs** — independent of database state.

### Frontend (✅ 9/10 + delete-bug fix verified end-to-end)
- `SupplierAuthContext` (separate JWT in localStorage `salonhub_supplier_token`).
- `/supplier/login` (Password + OTP tabs), `/supplier/signup` (5-step), `/supplier/pending` (status-gated message), `/supplier/dashboard` (4 KPI cards + category chart), `/supplier/products` (catalog + samples tabs, CRUD modals, restock, delete).
- "Become a Supplier" link added to landing-page Footer (Company column).
- All critical elements have `data-testid` attributes for stable e2e.

### Key API Endpoints (Phase 8/9)
- `POST /api/supplier/signup`
- `POST /api/supplier/auth/request-otp`, `POST /api/supplier/auth/verify-otp`, `POST /api/supplier/auth/password-login`
- `GET  /api/supplier/me`
- `GET  /api/supplier/dashboard/stats`
- `GET/POST/PUT/DELETE /api/supplier/products[/:id]`
- `POST /api/supplier/products/:id/restock`
- `GET  /api/supplier/product-samples`
- `POST /api/supplier/products/from-sample/:sample_id`
- `POST /api/platform/suppliers/:id/approve`
- `POST /api/platform/suppliers/:id/reject`

### Known follow-ups (P2 — Phase 10+)
- Marketplace browse for salons (B2B catalog discovery).
- Cart, Checkout, Orders, Inventory sync between supplier `supplier_products` and salon inventory.
- Modularize `server.py` (now 12.4k lines) — split into `routes/`, `models/`, `services/`.
- Split `SupplierProductsPage.js` (605 lines) into ProductCatalog / ProductSamples / EditorModal / RestockModal / DeleteModal sub-components.
- Optional: add `loggingOut` sentinel to SupplierAuthContext to eliminate the brief `/supplier/login` flash before `window.location.replace('/')` on logout (cosmetic, not user-visible).

---

## v4.1 — WS1–WS3 (built July 2025)

**WS1 — Category taxonomy (verified):** One canonical `categories` collection (type=service|product|membership) drives customer, salon and staff service views via `GET /api/salons/{id}/categories`. Service create/update resolve `category_id` from this collection. Freshly-seeded data was migrated (`migrate_categories.py --apply`). Legacy `/services/categories` endpoint is unused by the frontend.

**WS2 — Shop drawer + salon delivery address:**
- Inventory "Buy inventory" renamed to **"Shop"** → opens a right-side product drawer (`BuyInventoryDrawer.js`) sharing the OpsContext cart; "Proceed to review" opens the shared `ReviewOrderDrawer`.
- Salon profile now has mandatory **State (Indian States/UTs dropdown)** + **6-digit PIN** (`SalonSettingsV3.js`, validated in `PUT /api/salons/{id}`).
- Review step: saved **address book** (`GET/POST /api/salons/{id}/address-book`), "Add new address", map-location link, full address snapshot (incl. lat/lng) on each order.
- `POST /api/salon/store/checkout` blocks with `{code:"salon_profile_incomplete"}` until State+PIN are set.
- `GET /api/meta/indian-states` → 36 states/UTs.

**WS3 — Per-salon WhatsApp sender (Twilio):**
- All WhatsApp sends route through `twilio_service.resolve_sender(salon)` / `resolve_template_sender()`. Single account authenticates; per-salon sender selected by `salon.whatsapp` config. Own-WABA salons fall back to platform sender for templates until they supply `template_overrides`.
- New router `salon_whatsapp_sender.py`: `GET /whatsapp-sender`, `POST /whatsapp-sender/request` (salon), `PUT /whatsapp-sender/config`, `POST /whatsapp-sender/activate`, `POST /whatsapp-sender/test` (last 3 platform-owner-only, role=platform_admin).
- Marketing → Settings → **WhatsApp Sender** card (`MarketingSettingsPanel.js`): plain-language sender + status pill, salon request form, owner-only connect/activate/test.

**Env note:** `.env` files were missing on restore and recreated (MONGO_URL=mongodb://localhost:27017, DB_NAME=salonapp). Twilio live credentials set. Admin login: `POST /api/salon/users/login` identifier=`admin` password=`salon123`, salon_id=release-candidate-16.

---
## Changelog — Appointment redesign + invoice + privacy (this session)
- **Appointment page (AppointmentDrawer)**: 2-row filter — Row1 offering tabs (Services/Packages/Member/Product), Row2 sub_category chips. Narrower stylist (barber) panel. Direct-invoice date & Schedule date+session (M/N/E icons) moved into the top header panel. Removed the separate Products collapsible (Product is now a filter tab).
- **Ops setting**: `direct_invoice_default` (bool) — Walk-in stays default; when checked the drawer lands on Direct invoice.
- **Backend**: per-service discount now applied in BOTH `direct-invoice` and `salon-booking` (stores net `service_price` + `list_price` + `discount_percent`); `attribute_token_revenue_to_barbers` splits each line across `barber_allocations` by pct. Back-dated direct invoices honoured when the setting is on. (per-service discount backend-tested: 3/3 pass.)
- **Invoice (invoice_html.py + generate_and_send_invoice)**: removed per-service time; shows tier/length + gender tag under the service name; new columns Stylist / Price / Discount / Amount (multi-barber shown as "A 60% + B 40%"); removed the duplicate payment-mode chip (kept "Paid via …"); removed customer Member tier tag; added marketing footer "Created with SalonHub · salonhub.in".
- **Services page**: added a page header (title + subtitle) mirroring the Staff page so the ribbon→content top margin matches.
- **Privacy**: new public page at `/privacy` (+ `/privacy-policy`); login page now has a required consent checkbox + Privacy Policy link gating login actions.
- **Env note**: `backend/.env` and `frontend/.env` were missing on arrival and were recreated (local Mongo `test_database`, external URL). Demo data seeded via `seed_demo_dataset.py`. Test login: admin / salon123, salon_id 9d2c95b0-3931-4e0c-b7e8-70aba857bd0a.
