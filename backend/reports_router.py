"""
Reports Router — merged Financials + Analytics.
Implements the "Business Snapshot" (15 metric cards) plus section endpoints.
Reads existing collections (tokens, financial_transactions, ratings, ...) and never writes
business data. Only writes to two prefs collections: report_card_prefs and report_targets.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field


def init_reports_router(*, db, get_current_salon_user, has_module_permission,
                        is_branch_manager, enforce_branch_for_manager,
                        attribute_token_revenue_to_barbers=None,
                        attribute_token_revenue_to_services=None):
    router = APIRouter(prefix="/api", tags=["reports"])

    DEFAULT_CARDS = [
        "appointments", "collections", "revenue", "source", "guests", "avgticket",
        "utilization", "wait", "products", "addons", "noshow", "rebooking", "feedback",
    ]
    ALL_CARDS = DEFAULT_CARDS + ["membership", "discounts"]

    CARD_LABELS = {
        "appointments": "Appointments",
        "collections": "Collections (₹)",
        "revenue": "Revenue (₹)",
        "source": "Booking by source",
        "guests": "Guest visits",
        "avgticket": "Avg ticket (₹)",
        "utilization": "Staff utilization (%)",
        "wait": "Wait time (mins)",
        "products": "Products (₹)",
        "addons": "Service add-ons (₹)",
        "noshow": "No-show rate (%)",
        "rebooking": "Rebooking rate (%)",
        "feedback": "Guest feedback (★)",
        "membership": "Membership liability (₹)",
        "discounts": "Discounts given (₹)",
    }
    MONEY_CARDS = {"collections", "revenue", "avgticket", "products", "addons", "membership", "discounts"}
    BAR_CARDS = {"wait", "feedback", "utilization"}
    LOWER_BETTER = {"wait", "noshow", "discounts"}
    STOCK_CARDS = {"membership"}  # no projection

    # ---------- date helpers ----------
    def _parse_date(s: str) -> datetime:
        return datetime.strptime(s, "%Y-%m-%d")

    def _fmt(d: datetime) -> str:
        return d.strftime("%Y-%m-%d")

    def resolve_window(view: str, anchor: str) -> Tuple[str, str, str, str]:
        """Returns (start, end, prev_start, prev_end) all as YYYY-MM-DD."""
        d = _parse_date(anchor)
        if view == "day":
            start = end = d
            prev_start = prev_end = d - timedelta(days=1)
        elif view == "week":
            # Sunday-Saturday containing d
            offset = (d.weekday() + 1) % 7  # 0=Sun
            start = d - timedelta(days=offset)
            end = start + timedelta(days=6)
            prev_start = start - timedelta(days=7)
            prev_end = end - timedelta(days=7)
        else:  # month
            start = d.replace(day=1)
            if start.month == 12:
                end = start.replace(year=start.year + 1, month=1) - timedelta(days=1)
            else:
                end = start.replace(month=start.month + 1) - timedelta(days=1)
            # previous month
            prev_end = start - timedelta(days=1)
            prev_start = prev_end.replace(day=1)
        return _fmt(start), _fmt(end), _fmt(prev_start), _fmt(prev_end)

    # ---------- Prefs & Targets ----------
    class PrefsIn(BaseModel):
        cards: List[str] = Field(default_factory=list)
        order: List[str] = Field(default_factory=list)

    class TargetIn(BaseModel):
        metric_id: str
        period_type: str = "month"
        target: float = 0
        branch_id: Optional[str] = None

    @router.get("/salons/{salon_id}/reports/prefs")
    async def get_prefs(salon_id: str, current_user=Depends(get_current_salon_user)):
        if not has_module_permission(current_user, "reports", "view"):
            raise HTTPException(403, "Permission denied")
        doc = await db.report_card_prefs.find_one({"salon_id": salon_id}, {"_id": 0})
        if not doc:
            doc = {"salon_id": salon_id, "cards": DEFAULT_CARDS, "order": DEFAULT_CARDS}
        return {
            "all_cards": [{"id": c, "label": CARD_LABELS.get(c, c), "money": c in MONEY_CARDS}
                          for c in ALL_CARDS],
            "cards": doc.get("cards", DEFAULT_CARDS),
            "order": doc.get("order", DEFAULT_CARDS),
        }

    @router.put("/salons/{salon_id}/reports/prefs")
    async def put_prefs(salon_id: str, payload: PrefsIn,
                        current_user=Depends(get_current_salon_user)):
        if not has_module_permission(current_user, "reports", "edit_prefs"):
            raise HTTPException(403, "Permission denied")
        cards = [c for c in payload.cards if c in ALL_CARDS]
        order = [c for c in payload.order if c in cards] or cards
        await db.report_card_prefs.update_one(
            {"salon_id": salon_id},
            {"$set": {"cards": cards, "order": order,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        return {"success": True, "cards": cards, "order": order}

    @router.put("/salons/{salon_id}/reports/targets")
    async def put_target(salon_id: str, payload: TargetIn,
                         current_user=Depends(get_current_salon_user)):
        if not has_module_permission(current_user, "reports", "edit_targets"):
            raise HTTPException(403, "Permission denied")
        if payload.metric_id not in ALL_CARDS:
            raise HTTPException(400, "Unknown metric_id")
        if payload.period_type not in ("day", "week", "month"):
            raise HTTPException(400, "Bad period_type")
        query = {"salon_id": salon_id, "metric_id": payload.metric_id,
                 "period_type": payload.period_type,
                 "branch_id": payload.branch_id}
        await db.report_targets.update_one(query, {
            "$set": {**query, "target": float(payload.target),
                     "updated_at": datetime.now(timezone.utc).isoformat()}
        }, upsert=True)
        return {"success": True}

    async def _get_target(salon_id: str, metric_id: str, period_type: str,
                          branch_id: Optional[str]) -> Optional[float]:
        doc = await db.report_targets.find_one({
            "salon_id": salon_id, "metric_id": metric_id,
            "period_type": period_type, "branch_id": branch_id
        }, {"_id": 0})
        if doc:
            return float(doc.get("target", 0))
        return None

    # ---------- Metric computation ----------
    async def _fetch_tokens(salon_id: str, start: str, end: str,
                            branch_id: Optional[str] = None) -> List[dict]:
        q: Dict[str, Any] = {"salon_id": salon_id, "date": {"$gte": start, "$lte": end}}
        if branch_id:
            q["branch_id"] = branch_id
        return await db.tokens.find(q, {"_id": 0}).to_list(50000)

    async def _fetch_finance(salon_id: str, start: str, end: str,
                             branch_id: Optional[str] = None) -> List[dict]:
        q: Dict[str, Any] = {"salon_id": salon_id, "date": {"$gte": start, "$lte": end}}
        if branch_id:
            q["branch_id"] = branch_id
        return await db.financial_transactions.find(q, {"_id": 0}).to_list(50000)

    def _norm_source(s: str) -> str:
        s = (s or "").lower()
        if s in ("salon_booking", "menu_parse", "online", "customer_app"):
            return "Online"
        if s in ("qr",):
            return "QR scan"
        if s in ("owner", "staff", "branch", "manual", "salon"):
            return "By owner"
        if s in ("edited", "csv_upload", "bulk_upload", "invoice"):
            return "Direct invoice"
        return "Other"

    def _derive_no_show(t: dict, today: str) -> bool:
        # Booking whose date has passed, was never checked-in, and did not complete.
        try:
            if t.get("date", "") >= today:
                return False
        except Exception:
            return False
        if t.get("check_in_at") or t.get("called_at") or t.get("completed_at"):
            return False
        st = t.get("status", "waiting")
        if st in ("completed", "cancelled"):
            return False
        return True

    def _svc_revenue(t: dict) -> List[Tuple[str, float]]:
        """[(service_name, line_total)] from selected_services / service_assignments."""
        out = []
        assigns = t.get("service_assignments") or []
        if assigns:
            for a in assigns:
                out.append((a.get("service_name") or a.get("name") or "Service",
                            float(a.get("line_total") or a.get("price") or 0)))
            return out
        sel = t.get("selected_services") or []
        total = float(t.get("total_amount") or 0)
        if not sel:
            return [("Service", total)]
        each = total / max(1, len(sel))
        for s in sel:
            nm = s.get("name") or s.get("service_name") or "Service"
            out.append((nm, float(s.get("price") or each)))
        return out

    def _elapsed_fraction(view: str, start: str, end: str, today_str: str) -> float:
        """Fraction (0..1) of the window that has already elapsed as of today.
        For closed past windows returns 1.0; for future windows returns a small
        floor (0.05) so we never divide by zero and never over-project."""
        try:
            s = _parse_date(start).date()
            e = _parse_date(end).date()
            t = _parse_date(today_str).date()
        except Exception:
            return 1.0
        if t > e:
            return 1.0
        if t < s:
            return 0.05
        days_elapsed = (t - s).days + 1
        days_total = (e - s).days + 1
        return max(0.05, min(1.0, days_elapsed / max(1, days_total)))

    async def _compute_snapshot(salon_id: str, view: str, start: str, end: str,
                                branch_id: Optional[str],
                                prefs_cards: List[str], prefs_order: List[str],
                                today_str: str) -> List[dict]:
        tokens = await _fetch_tokens(salon_id, start, end, branch_id)
        finance = await _fetch_finance(salon_id, start, end, branch_id)
        # Ratings + attendance are targeted (fetched only when needed).

        results: Dict[str, dict] = {}

        # 1. appointments
        if "appointments" in prefs_cards:
            counts = {"Pending": 0, "In Progress": 0, "Serviced": 0, "No Show": 0, "Cancelled": 0}
            for t in tokens:
                st = t.get("status", "waiting")
                if st in ("waiting", "called"):
                    counts["Pending"] += 1
                elif st == "in_progress":
                    counts["In Progress"] += 1
                elif st == "completed":
                    counts["Serviced"] += 1
                elif st == "cancelled":
                    counts["Cancelled"] += 1
                if _derive_no_show(t, today_str):
                    counts["No Show"] += 1
            results["appointments"] = {
                "total": len(tokens),
                "chart": {"title": "By status", "kind": "pie",
                          "data": [[k, v] for k, v in counts.items() if v > 0]},
            }

        # 2. collections
        if "collections" in prefs_cards:
            total_in = 0.0
            by_mode = {"cash": 0.0, "upi": 0.0, "card": 0.0, "wallet": 0.0}
            for tx in finance:
                if tx.get("type") in ("inflow", "deposit"):
                    amt = float(tx.get("amount") or 0)
                    total_in += amt
                    mode = tx.get("payment_mode", "cash")
                    by_mode[mode] = by_mode.get(mode, 0) + amt
            results["collections"] = {
                "total": round(total_in, 2),
                "chart": {"title": "By payment mode", "kind": "pie",
                          "data": [[k.capitalize(), round(v, 2)] for k, v in by_mode.items() if v > 0]},
            }

        # 3. revenue
        completed = [t for t in tokens if t.get("status") == "completed"]
        if "revenue" in prefs_cards:
            total_rev = sum(float(t.get("total_amount") or 0) for t in completed)
            by_cat: Dict[str, float] = {}
            # attempt to bucket by service category via services collection
            svc_ids = set()
            for t in completed:
                for a in (t.get("service_assignments") or []):
                    if a.get("service_id"):
                        svc_ids.add(a["service_id"])
            svc_cat_map: Dict[str, str] = {}
            if svc_ids:
                async for s in db.services.find({"id": {"$in": list(svc_ids)}},
                                                {"_id": 0, "id": 1, "sub_category": 1, "category": 1}):
                    # Guide: prefer category (Hair/Spa/Beard/Facial), fallback to sub_category
                    svc_cat_map[s["id"]] = s.get("category") or s.get("sub_category") or "Services"
            for t in completed:
                assigns = t.get("service_assignments") or []
                if assigns:
                    for a in assigns:
                        # Product/retail lines get their own bucket per guide
                        if a.get("is_retail") or a.get("kind") == "product" or a.get("product_id"):
                            cat = "Retail"
                        else:
                            cat = svc_cat_map.get(a.get("service_id"), "Services")
                        by_cat[cat] = by_cat.get(cat, 0) + float(a.get("line_total") or a.get("price") or 0)
                else:
                    by_cat["Services"] = by_cat.get("Services", 0) + float(t.get("total_amount") or 0)
            results["revenue"] = {
                "total": round(total_rev, 2),
                "chart": {"title": "By category", "kind": "pie",
                          "data": [[k, round(v, 2)] for k, v in sorted(by_cat.items(), key=lambda x: -x[1])[:8]]},
            }

        # 4. source
        if "source" in prefs_cards:
            src: Dict[str, int] = {}
            for t in tokens:
                key = _norm_source(t.get("source", ""))
                src[key] = src.get(key, 0) + 1
            results["source"] = {
                "total": len(tokens),
                "chart": {"title": "By channel", "kind": "pie",
                          "data": [[k, v] for k, v in src.items() if v > 0]},
            }

        # 5. guests
        if "guests" in prefs_cards or "avgticket" in prefs_cards:
            phones_this = {t.get("phone") for t in completed if t.get("phone")}
            # returning if they have earlier completed tokens
            new_c, ret_c = 0, 0
            for ph in phones_this:
                prev = await db.tokens.find_one(
                    {"salon_id": salon_id, "phone": ph, "status": "completed",
                     "date": {"$lt": start}}, {"_id": 0, "id": 1})
                if prev:
                    ret_c += 1
                else:
                    new_c += 1
            guest_count = len(phones_this)
            if "guests" in prefs_cards:
                results["guests"] = {
                    "total": guest_count,
                    "chart": {"title": "New vs returning", "kind": "pie",
                              "data": [["New", new_c], ["Returning", ret_c]]},
                }

        # 6. avgticket
        if "avgticket" in prefs_cards:
            rev = sum(float(t.get("total_amount") or 0) for t in completed)
            gcount = len({t.get("phone") for t in completed if t.get("phone")})
            avg = (rev / gcount) if gcount else 0
            by_staff: Dict[str, Tuple[float, int]] = {}
            for t in completed:
                bn = t.get("barber_name") or "Unassigned"
                cur = by_staff.get(bn, (0.0, 0))
                by_staff[bn] = (cur[0] + float(t.get("total_amount") or 0), cur[1] + 1)
            data = [[nm, round((r / max(1, c)), 2)] for nm, (r, c) in by_staff.items()]
            results["avgticket"] = {
                "total": round(avg, 2),
                "chart": {"title": "By staff", "kind": "pie", "data": data[:8]},
            }

        # 7. utilization — booked min / worked min (approximation using service durations)
        if "utilization" in prefs_cards:
            booked_min = 0
            for t in tokens:
                for a in (t.get("service_assignments") or []):
                    booked_min += int(a.get("duration") or a.get("default_duration") or 0)
                if not (t.get("service_assignments") or []):
                    booked_min += int(t.get("total_duration") or 30)
            att = await db.attendance.find(
                {"salon_id": salon_id, "date": {"$gte": start, "$lte": end}},
                {"_id": 0, "worked_minutes": 1, "staff_id": 1}
            ).to_list(20000)
            worked = sum(int(a.get("worked_minutes") or 0) for a in att)
            util = round((booked_min / worked) * 100, 1) if worked else 0
            # per barber
            per_staff: Dict[str, Dict[str, int]] = {}
            for t in tokens:
                bn = t.get("barber_name") or "Unassigned"
                m = 0
                for a in (t.get("service_assignments") or []):
                    m += int(a.get("duration") or 0)
                per_staff.setdefault(bn, {"booked": 0})
                per_staff[bn]["booked"] = per_staff[bn].get("booked", 0) + m
            data = [[nm, v["booked"]] for nm, v in per_staff.items()]
            results["utilization"] = {
                "total": util,
                "chart": {"title": "By staff (booked mins)", "kind": "bar",
                          "data": sorted(data, key=lambda x: -x[1])[:8]},
            }

        # 8. wait time — avg (called_at - check_in_at) in mins, by hour
        if "wait" in prefs_cards:
            waits = []
            by_hour: Dict[int, List[float]] = {}
            for t in tokens:
                ci = t.get("check_in_at"); ca = t.get("called_at")
                if ci and ca:
                    try:
                        ci_dt = datetime.fromisoformat(ci.replace("Z", "+00:00"))
                        ca_dt = datetime.fromisoformat(ca.replace("Z", "+00:00"))
                        m = max(0, (ca_dt - ci_dt).total_seconds() / 60.0)
                        waits.append(m)
                        by_hour.setdefault(ci_dt.hour, []).append(m)
                    except Exception:
                        continue
            avg_wait = round(sum(waits) / max(1, len(waits)), 1) if waits else 0
            data = [[f"{h}:00", round(sum(v) / max(1, len(v)), 1)]
                    for h, v in sorted(by_hour.items())]
            results["wait"] = {"total": avg_wait,
                               "chart": {"title": "By hour", "kind": "bar", "data": data}}

        # 9. products (retail sales) — inventory sell movements or retail lines
        if "products" in prefs_cards:
            movs = await db.salon_inventory_movements.find(
                {"salon_id": salon_id, "date": {"$gte": start, "$lte": end},
                 "type": "out"}, {"_id": 0}
            ).to_list(20000)
            total = 0.0
            by_name: Dict[str, float] = {}
            for m in movs:
                if m.get("reference_type") in ("sale", "pos", "retail"):
                    amt = float(m.get("amount") or 0)
                    total += amt
                    by_name[m.get("item_name") or "Product"] = by_name.get(m.get("item_name") or "Product", 0) + amt
            data = sorted([[k, round(v, 2)] for k, v in by_name.items()], key=lambda x: -x[1])[:8]
            results["products"] = {"total": round(total, 2),
                                   "chart": {"title": "Top products", "kind": "pie", "data": data}}

        # 10. addons
        if "addons" in prefs_cards:
            total_a = 0.0
            by_name: Dict[str, float] = {}
            for t in completed:
                for a in (t.get("service_assignments") or []):
                    if a.get("is_addon"):
                        v = float(a.get("line_total") or a.get("price") or 0)
                        total_a += v
                        by_name[a.get("service_name") or "Add-on"] = by_name.get(a.get("service_name") or "Add-on", 0) + v
            data = sorted([[k, round(v, 2)] for k, v in by_name.items()], key=lambda x: -x[1])[:8]
            results["addons"] = {"total": round(total_a, 2),
                                 "chart": {"title": "Top add-ons", "kind": "pie", "data": data}}

        # 11. noshow
        if "noshow" in prefs_cards:
            ns = sum(1 for t in tokens if _derive_no_show(t, today_str))
            rate = round((ns / max(1, len(tokens))) * 100, 1)
            by_src: Dict[str, int] = {}
            for t in tokens:
                if _derive_no_show(t, today_str):
                    by_src[_norm_source(t.get("source", ""))] = by_src.get(_norm_source(t.get("source", "")), 0) + 1
            results["noshow"] = {"total": rate,
                                 "chart": {"title": "By source", "kind": "pie",
                                           "data": [[k, v] for k, v in by_src.items() if v > 0]}}

        # 12. rebooking
        if "rebooking" in prefs_cards:
            phones_served = {t.get("phone") for t in completed if t.get("phone")}
            rebooked = 0
            per_staff: Dict[str, Dict[str, int]] = {}
            for t in completed:
                ph = t.get("phone"); bn = t.get("barber_name") or "Unassigned"
                per_staff.setdefault(bn, {"served": 0, "rebooked": 0})
                per_staff[bn]["served"] += 1
                if not ph:
                    continue
                future = await db.tokens.find_one({
                    "salon_id": salon_id, "phone": ph,
                    "date": {"$gt": t.get("date")}
                }, {"_id": 0, "id": 1})
                if future:
                    rebooked += 1
                    per_staff[bn]["rebooked"] += 1
            rate = round((rebooked / max(1, len(phones_served))) * 100, 1) if phones_served else 0
            data = [[nm, round((v["rebooked"] / max(1, v["served"])) * 100, 1)]
                    for nm, v in per_staff.items()]
            results["rebooking"] = {"total": rate,
                                    "chart": {"title": "By staff (%)", "kind": "pie", "data": data[:8]}}

        # 13. feedback (avg rating + spread bar)
        if "feedback" in prefs_cards:
            ratings = await db.ratings.find(
                {"salon_id": salon_id},
                {"_id": 0, "rating": 1, "created_at": 1}
            ).to_list(5000)
            # filter by window on created_at
            in_win = []
            for r in ratings:
                ca = r.get("created_at", "")
                if ca and ca[:10] >= start and ca[:10] <= end:
                    in_win.append(int(r.get("rating") or 0))
            avg_r = round(sum(in_win) / len(in_win), 1) if in_win else 0
            spread = {"1★": 0, "2★": 0, "3★": 0, "4★": 0, "5★": 0}
            for r in in_win:
                if 1 <= r <= 5:
                    spread[f"{r}★"] += 1
            results["feedback"] = {"total": avg_r,
                                   "chart": {"title": "Rating spread", "kind": "bar",
                                             "data": [[k, v] for k, v in spread.items()]}}

        # 14. membership liability (point-in-time as of end_date)
        if "membership" in prefs_cards:
            mems = await db.customer_memberships.find(
                {"salon_id": salon_id, "status": {"$in": ["active", None]}},
                {"_id": 0, "wallet_balance": 1, "membership_balance": 1, "plan_name": 1}
            ).to_list(50000)
            total_m = sum(float(m.get("wallet_balance") or 0) + float(m.get("membership_balance") or 0)
                          for m in mems)
            by_type = {"Memberships": sum(float(m.get("membership_balance") or 0) for m in mems),
                       "Wallet": sum(float(m.get("wallet_balance") or 0) for m in mems)}
            results["membership"] = {"total": round(total_m, 2),
                                     "chart": {"title": "By type", "kind": "pie",
                                               "data": [[k, round(v, 2)] for k, v in by_type.items()]}}

        # 15. discounts
        if "discounts" in prefs_cards:
            disc = sum(float(t.get("discount_amount") or 0) for t in tokens)
            results["discounts"] = {"total": round(disc, 2),
                                    "chart": {"title": "By source", "kind": "pie",
                                              "data": [["Manual discount", round(disc, 2)]]}}

        # ---- Build cards in preferred order ----
        # Ratio/stock metrics do NOT get elapsed-fraction projection
        RATIO_STOCK = {"utilization", "noshow", "rebooking", "feedback",
                       "avgticket", "membership"}
        elapsed = _elapsed_fraction(view, start, end, today_str)
        cards_out = []
        for cid in prefs_order:
            if cid not in prefs_cards or cid not in results:
                continue
            r = results[cid]
            target = await _get_target(salon_id, cid, view, branch_id)
            # Projection — flow metrics use elapsed-fraction; ratios/stock don't project.
            if cid in RATIO_STOCK or cid in STOCK_CARDS:
                proj = r["total"]
            else:
                proj = round(r["total"] / max(elapsed, 0.05), 2)
            cards_out.append({
                "id": cid, "label": CARD_LABELS.get(cid, cid),
                "money": cid in MONEY_CARDS,
                "total": r["total"], "projected": proj,
                # target may be None → resolved after we know previous
                "target": target,
                "trend": None, "up": None,
                "chart": r["chart"],
                "lower_is_better": cid in LOWER_BETTER,
            })
        return cards_out

    @router.get("/salons/{salon_id}/reports/snapshot")
    async def snapshot(salon_id: str,
                       view: str = Query("month", pattern="^(day|week|month)$"),
                       date: Optional[str] = None,
                       branch_id: Optional[str] = None,
                       compare: bool = False,
                       current_user=Depends(get_current_salon_user)):
        if not has_module_permission(current_user, "reports", "view"):
            raise HTTPException(403, "Permission denied")
        if is_branch_manager(current_user):
            branch_id = enforce_branch_for_manager(current_user, branch_id)
        anchor = date or datetime.now().strftime("%Y-%m-%d")
        start, end, pstart, pend = resolve_window(view, anchor)
        today_str = datetime.now().strftime("%Y-%m-%d")

        # load prefs
        prefs = await db.report_card_prefs.find_one({"salon_id": salon_id}, {"_id": 0})
        cards_on = (prefs or {}).get("cards") or DEFAULT_CARDS
        order = (prefs or {}).get("order") or cards_on

        cards = await _compute_snapshot(salon_id, view, start, end, branch_id,
                                        cards_on, order, today_str)

        # Compare / target resolution — we compute previous either way so we can
        # (a) use its actual × 1.1 as a target default and (b) build trend when
        # compare=true.
        prev = await _compute_snapshot(salon_id, view, pstart, pend, branch_id,
                                       cards_on, order, today_str)
        prev_by_id = {c["id"]: c for c in prev}
        for c in cards:
            pv_total = prev_by_id.get(c["id"], {}).get("total") or 0
            # Target: user-set > previous × 1.1 > current × 1.1 (bootstrap first-run)
            if c["target"] is None:
                if pv_total > 0:
                    c["target"] = round(pv_total * 1.1, 2)
                else:
                    c["target"] = round(max(c["total"] * 1.1, 0), 2) if c["total"] else 0
            if compare:
                if pv_total > 0:
                    delta = ((c["total"] - pv_total) / pv_total) * 100
                    c["trend"] = f"{'+' if delta >= 0 else ''}{round(delta)}%"
                    # invert semantics for lower_is_better
                    if c.get("lower_is_better"):
                        c["up"] = delta < 0
                    else:
                        c["up"] = delta >= 0
                else:
                    c["trend"] = None
                    c["up"] = None
        return {
            "window": {"view": view, "start": start, "end": end,
                       "previous": {"start": pstart, "end": pend}},
            "cards": cards,
        }

    # ---------- Drill-down (single metric detail) ----------
    @router.get("/salons/{salon_id}/reports/metric/{metric_id}")
    async def metric_detail(salon_id: str, metric_id: str,
                            view: str = Query("month", pattern="^(day|week|month)$"),
                            date: Optional[str] = None,
                            branch_id: Optional[str] = None,
                            current_user=Depends(get_current_salon_user)):
        if not has_module_permission(current_user, "reports", "view"):
            raise HTTPException(403, "Permission denied")
        anchor = date or datetime.now().strftime("%Y-%m-%d")
        start, end, _, _ = resolve_window(view, anchor)
        cards = await _compute_snapshot(salon_id, view, start, end, branch_id,
                                        [metric_id], [metric_id],
                                        datetime.now().strftime("%Y-%m-%d"))
        if not cards:
            raise HTTPException(404, "Metric not found")
        card = cards[0]
        rows = card["chart"]["data"]
        total = card["total"] or 1
        breakdown = [{"label": r[0], "value": r[1],
                      "share": round((float(r[1]) / total) * 100, 1) if total else 0}
                     for r in rows]
        return {"metric": card, "breakdown": breakdown,
                "window": {"view": view, "start": start, "end": end}}

    # ---------- Section: Sales ----------
    @router.get("/salons/{salon_id}/reports/sales")
    async def section_sales(salon_id: str,
                            view: str = Query("month", pattern="^(day|week|month)$"),
                            date: Optional[str] = None,
                            branch_id: Optional[str] = None,
                            current_user=Depends(get_current_salon_user)):
        if not has_module_permission(current_user, "reports", "view"):
            raise HTTPException(403, "Permission denied")
        anchor = date or datetime.now().strftime("%Y-%m-%d")
        start, end, _, _ = resolve_window(view, anchor)
        tokens = await _fetch_tokens(salon_id, start, end, branch_id)
        completed = [t for t in tokens if t.get("status") == "completed"]

        # day-wise line
        by_day: Dict[str, float] = {}
        for t in completed:
            by_day[t.get("date")] = by_day.get(t.get("date"), 0) + float(t.get("total_amount") or 0)
        line = [{"date": d, "revenue": round(v, 2)} for d, v in sorted(by_day.items())]

        # by staff
        by_staff: Dict[str, Dict[str, Any]] = {}
        for t in completed:
            bn = t.get("barber_name") or "Unassigned"
            by_staff.setdefault(bn, {"revenue": 0, "bookings": 0})
            by_staff[bn]["revenue"] += float(t.get("total_amount") or 0)
            by_staff[bn]["bookings"] += 1
        by_staff_rows = sorted(
            [{"name": k, "revenue": round(v["revenue"], 2),
              "bookings": v["bookings"]}
             for k, v in by_staff.items()],
            key=lambda r: -r["revenue"])

        # by service
        by_svc: Dict[str, Dict[str, Any]] = {}
        for t in completed:
            for a in (t.get("service_assignments") or []):
                nm = a.get("service_name") or "Service"
                by_svc.setdefault(nm, {"revenue": 0, "count": 0})
                by_svc[nm]["revenue"] += float(a.get("line_total") or a.get("price") or 0)
                by_svc[nm]["count"] += 1
        by_svc_rows = sorted(
            [{"name": k, "revenue": round(v["revenue"], 2), "count": v["count"]}
             for k, v in by_svc.items()],
            key=lambda r: -r["revenue"])

        return {"window": {"view": view, "start": start, "end": end},
                "line": line, "by_staff": by_staff_rows, "by_service": by_svc_rows,
                "total_revenue": round(sum(float(t.get("total_amount") or 0) for t in completed), 2),
                "bookings": len(completed)}

    # ---------- Section: Payments & GST ----------
    @router.get("/salons/{salon_id}/reports/payments-gst")
    async def section_payments(salon_id: str,
                               view: str = Query("month", pattern="^(day|week|month)$"),
                               date: Optional[str] = None,
                               branch_id: Optional[str] = None,
                               current_user=Depends(get_current_salon_user)):
        if not has_module_permission(current_user, "reports", "view_dashboard"):
            raise HTTPException(403, "Permission denied")
        anchor = date or datetime.now().strftime("%Y-%m-%d")
        start, end, _, _ = resolve_window(view, anchor)
        finance = await _fetch_finance(salon_id, start, end, branch_id)
        tokens = await _fetch_tokens(salon_id, start, end, branch_id)
        completed = [t for t in tokens if t.get("status") == "completed"]

        by_mode = {"cash": 0.0, "upi": 0.0, "card": 0.0, "wallet": 0.0}
        total_in = 0.0
        for tx in finance:
            if tx.get("type") in ("inflow", "deposit"):
                v = float(tx.get("amount") or 0)
                total_in += v
                by_mode[tx.get("payment_mode", "cash")] = by_mode.get(tx.get("payment_mode", "cash"), 0) + v

        # GST estimate — assume 18% inclusive on services revenue (salon default)
        gross = sum(float(t.get("total_amount") or 0) for t in completed)
        taxable = round(gross / 1.18, 2)
        tax = round(gross - taxable, 2)
        return {"window": {"view": view, "start": start, "end": end},
                "total_collected": round(total_in, 2),
                "by_mode": [{"mode": k.capitalize(), "amount": round(v, 2)} for k, v in by_mode.items() if v > 0],
                "gst": {"gross": round(gross, 2), "taxable": taxable,
                        "cgst": round(tax / 2, 2), "sgst": round(tax / 2, 2),
                        "igst": 0, "total_tax": tax}}

    # ---------- Section: Expenses & P&L ----------
    @router.get("/salons/{salon_id}/reports/pnl")
    async def section_pnl(salon_id: str,
                          view: str = Query("month", pattern="^(day|week|month)$"),
                          date: Optional[str] = None,
                          branch_id: Optional[str] = None,
                          current_user=Depends(get_current_salon_user)):
        if not has_module_permission(current_user, "reports", "view_dashboard"):
            raise HTTPException(403, "Permission denied")
        anchor = date or datetime.now().strftime("%Y-%m-%d")
        start, end, _, _ = resolve_window(view, anchor)
        finance = await _fetch_finance(salon_id, start, end, branch_id)
        tokens = await _fetch_tokens(salon_id, start, end, branch_id)
        completed = [t for t in tokens if t.get("status") == "completed"]

        revenue = sum(float(t.get("total_amount") or 0) for t in completed)
        out_by_cat: Dict[str, float] = {}
        total_out = 0.0
        for tx in finance:
            if tx.get("type") in ("outflow", "withdrawal"):
                v = float(tx.get("amount") or 0)
                total_out += v
                out_by_cat[tx.get("category", "other")] = out_by_cat.get(tx.get("category", "other"), 0) + v
        profit = revenue - total_out
        return {"window": {"view": view, "start": start, "end": end},
                "revenue": round(revenue, 2),
                "expenses_total": round(total_out, 2),
                "expenses_by_category": sorted(
                    [{"category": k, "amount": round(v, 2)} for k, v in out_by_cat.items()],
                    key=lambda x: -x["amount"]),
                "profit": round(profit, 2)}

    # ---------- Section: Clients ----------
    @router.get("/salons/{salon_id}/reports/clients")
    async def section_clients(salon_id: str,
                              view: str = Query("month", pattern="^(day|week|month)$"),
                              date: Optional[str] = None,
                              branch_id: Optional[str] = None,
                              current_user=Depends(get_current_salon_user)):
        if not has_module_permission(current_user, "reports", "view"):
            raise HTTPException(403, "Permission denied")
        anchor = date or datetime.now().strftime("%Y-%m-%d")
        start, end, _, _ = resolve_window(view, anchor)
        tokens = await _fetch_tokens(salon_id, start, end, branch_id)
        completed = [t for t in tokens if t.get("status") == "completed"]
        by_phone: Dict[str, Dict[str, Any]] = {}
        for t in completed:
            ph = t.get("phone")
            if not ph:
                continue
            by_phone.setdefault(ph, {"name": t.get("customer_name") or "Guest",
                                      "phone": ph, "visits": 0, "spend": 0})
            by_phone[ph]["visits"] += 1
            by_phone[ph]["spend"] += float(t.get("total_amount") or 0)
        rows = sorted(by_phone.values(), key=lambda x: -x["spend"])
        new_c = ret_c = 0
        for ph in by_phone.keys():
            prev = await db.tokens.find_one(
                {"salon_id": salon_id, "phone": ph, "status": "completed",
                 "date": {"$lt": start}}, {"_id": 0, "id": 1})
            if prev:
                ret_c += 1
            else:
                new_c += 1
        return {"window": {"view": view, "start": start, "end": end},
                "unique_guests": len(by_phone),
                "new_guests": new_c, "returning_guests": ret_c,
                "top_spenders": [{**r, "spend": round(r["spend"], 2)} for r in rows[:20]]}

    # ---------- Section: Marketing ----------
    @router.get("/salons/{salon_id}/reports/marketing")
    async def section_marketing(salon_id: str,
                                view: str = Query("month", pattern="^(day|week|month)$"),
                                date: Optional[str] = None,
                                branch_id: Optional[str] = None,
                                current_user=Depends(get_current_salon_user)):
        if not has_module_permission(current_user, "reports", "view"):
            raise HTTPException(403, "Permission denied")
        anchor = date or datetime.now().strftime("%Y-%m-%d")
        start, end, _, _ = resolve_window(view, anchor)
        # marketing_messages counts (best-effort)
        try:
            msgs = await db.marketing_messages.find(
                {"salon_id": salon_id, "created_at": {"$gte": start + "T00:00:00", "$lte": end + "T23:59:59"}},
                {"_id": 0, "status": 1, "channel": 1, "cost": 1}
            ).to_list(20000)
        except Exception:
            msgs = []
        sent = sum(1 for m in msgs)
        delivered = sum(1 for m in msgs if m.get("status") in ("delivered", "sent"))
        cost = sum(float(m.get("cost") or 0) for m in msgs)
        try:
            redemps = await db.salon_coupon_redemptions.find(
                {"salon_id": salon_id, "date": {"$gte": start, "$lte": end}},
                {"_id": 0, "discount_amount": 1}
            ).to_list(20000)
        except Exception:
            redemps = []
        coupon_value = sum(float(r.get("discount_amount") or 0) for r in redemps)
        return {"window": {"view": view, "start": start, "end": end},
                "messages_sent": sent, "delivered": delivered,
                "cost": round(cost, 2), "coupon_redemptions": len(redemps),
                "coupon_value": round(coupon_value, 2)}

    # ---------- Section: Inventory ----------
    @router.get("/salons/{salon_id}/reports/inventory")
    async def section_inventory(salon_id: str,
                                view: str = Query("month", pattern="^(day|week|month)$"),
                                date: Optional[str] = None,
                                branch_id: Optional[str] = None,
                                current_user=Depends(get_current_salon_user)):
        if not has_module_permission(current_user, "reports", "view"):
            raise HTTPException(403, "Permission denied")
        anchor = date or datetime.now().strftime("%Y-%m-%d")
        start, end, _, _ = resolve_window(view, anchor)
        try:
            movs = await db.salon_inventory_movements.find(
                {"salon_id": salon_id, "date": {"$gte": start, "$lte": end}},
                {"_id": 0}
            ).to_list(30000)
        except Exception:
            movs = []
        consumed = sum(float(m.get("amount") or 0) for m in movs if m.get("type") in ("out", "consume"))
        purchases = sum(float(m.get("amount") or 0) for m in movs if m.get("type") == "in")
        items = await db.salon_inventory.find({"salon_id": salon_id}, {"_id": 0}).to_list(20000)
        on_hand_value = sum(float(i.get("qty_total") or 0) * float(i.get("cost_price") or 0)
                            for i in items)
        low = [{"name": i.get("name"), "qty": i.get("qty_total"),
                "reorder_level": i.get("low_stock_threshold")}
               for i in items
               if (i.get("qty_total") or 0) <= (i.get("low_stock_threshold") or 0)]
        return {"window": {"view": view, "start": start, "end": end},
                "consumed_value": round(consumed, 2),
                "purchases_value": round(purchases, 2),
                "on_hand_value": round(on_hand_value, 2),
                "below_reorder": low[:30]}

    return router
