"""
Global Salon Search (Jul 2026 — continuation_request).

One authenticated endpoint the whole salon-side app can hit from the ribbon:

    GET  /api/salons/{salon_id}/search?q=<free text>[&limit=<int>]

Searches across:
    - customers           (name / phone / email / notes)
    - services            (service name / category / description)
    - staff               (barber name / specialty / phone)
    - membership plans    (plan name / description)
    - store products      (product name / brand / category)

Matching rules (both are tried; a hit on either qualifies):
    1. Space-insensitive match — the query with all whitespace stripped
       must be a substring of the target text with whitespace stripped.
       Handles "hair cut" ↔ "haircut" both ways.
    2. All-tokens-in-order-agnostic — every whitespace-delimited token from
       the query must be a substring of the target text (independent of
       order & regardless of intervening words).  Handles
       "dettol cream" → "Dettol Shaving Cream".

The endpoint returns a flat, typed result list so the ribbon overlay can
render groups without a second round-trip.
"""
from __future__ import annotations

import re
import logging
from typing import Optional, List, Dict, Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

_db = None
_get_current_salon_user: Optional[Callable] = None
_bearer = HTTPBearer(auto_error=False)

search_router = APIRouter(prefix="/api/salons", tags=["salon-search"])


def init_search_router(*, db, get_current_salon_user):
    """Wired by server.py at startup so we can share the app's Motor db + auth dep."""
    global _db, _get_current_salon_user
    _db = db
    _get_current_salon_user = get_current_salon_user


async def _auth(credentials: HTTPAuthorizationCredentials = Depends(_bearer)):
    if _get_current_salon_user is None:
        raise HTTPException(status_code=500, detail="search_not_initialised")
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return await _get_current_salon_user(credentials)


# ---------------------------------------------------------------------------
# Matching helpers
# ---------------------------------------------------------------------------

_WORD_SPLIT = re.compile(r"\s+")


def _norm(s: Any) -> str:
    """Lower-cased, punctuation-safe copy for substring matching."""
    if s is None:
        return ""
    if not isinstance(s, str):
        s = str(s)
    return s.lower()


def _compact(s: str) -> str:
    """Strip all whitespace (for "haircut"↔"hair cut" matching)."""
    return re.sub(r"\s+", "", s)


def _match(text: str, q_norm: str, q_tokens: List[str], q_compact: str) -> bool:
    """True if the target text matches under either matching rule."""
    if not text:
        return False
    t = _norm(text)
    if not q_norm:
        return False
    # Rule 1 — direct substring (fastest short-circuit)
    if q_norm in t:
        return True
    # Rule 2 — space-insensitive substring
    if q_compact and q_compact in _compact(t):
        return True
    # Rule 3 — all tokens present (order agnostic)
    if q_tokens and all(tok in t for tok in q_tokens):
        return True
    return False


def _prepare_query(q: str):
    q_norm = _norm(q).strip()
    q_tokens = [t for t in _WORD_SPLIT.split(q_norm) if t]
    q_compact = _compact(q_norm)
    return q_norm, q_tokens, q_compact


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

async def _salon_user_dep():
    if _get_current_salon_user is None:
        raise HTTPException(status_code=500, detail="search_not_initialised")
    # Real dep is injected via FastAPI Depends() below.
    return None


@search_router.get("/{salon_id}/search")
async def global_search(
    salon_id: str,
    q: str = Query("", description="Free-text query"),
    limit: int = Query(6, ge=1, le=25, description="Max hits per category"),
    current_user = Depends(_auth),
):
    """Return grouped search hits across customers, services, staff, memberships, products."""
    if _db is None:
        raise HTTPException(status_code=500, detail="search_not_initialised")

    q_norm, q_tokens, q_compact = _prepare_query(q or "")
    if len(q_norm) < 2:
        # Too-short queries would flood results — return empty payload.
        return {"query": q, "results": [], "total": 0}

    results: List[Dict[str, Any]] = []

    # -----------------------------------------------------------------
    # 1. Customers  (docs live in `customers` — top-level, not per-salon;
    #    we scope by `last_booking_salon_id == salon_id` where present, and
    #    also include walk-ins tied to this salon via `salon_id` field.)
    # -----------------------------------------------------------------
    try:
        cust_filter = {
            "$or": [
                {"last_booking_salon_id": salon_id},
                {"salon_id": salon_id},
            ]
        }
        # We deliberately fetch a wider net (limit*20) and filter in-python so
        # we can honour the fuzzy rules.  Payload is small.
        async for c in _db.customers.find(cust_filter, {"_id": 0}).limit(500):
            hay = " ".join(str(c.get(k) or "") for k in ("name", "phone", "email", "notes"))
            if _match(hay, q_norm, q_tokens, q_compact):
                results.append({
                    "type": "customer",
                    "id": c.get("id") or c.get("phone") or c.get("_id"),
                    "title": c.get("name") or "(unnamed customer)",
                    "subtitle": c.get("phone") or c.get("email") or "",
                    "route": f"/salon/dashboard?tab=guests&phone={c.get('phone') or ''}",
                    "icon": "user",
                })
                if len([r for r in results if r["type"] == "customer"]) >= limit:
                    break
    except Exception as e:
        logger.warning(f"[search] customers scan failed: {e}")

    # -----------------------------------------------------------------
    # 2. Services  (`services` — one doc per service, keyed by salon)
    # -----------------------------------------------------------------
    try:
        svc_filter = {"salon_id": salon_id, "is_active": {"$ne": False}}
        async for s in _db.services.find(svc_filter, {"_id": 0}).limit(400):
            hay = " ".join(str(s.get(k) or "") for k in ("service_name", "category", "description", "gender_tag"))
            if _match(hay, q_norm, q_tokens, q_compact):
                price = s.get("base_price") or s.get("price") or 0
                results.append({
                    "type": "service",
                    "id": s.get("id"),
                    "title": s.get("service_name") or "(unnamed service)",
                    "subtitle": f"{s.get('category') or ''} · ₹{price}".strip(" ·"),
                    "route": f"/salon/dashboard?tab=services&service_id={s.get('id') or ''}",
                    "icon": "scissors",
                })
                if len([r for r in results if r["type"] == "service"]) >= limit:
                    break
    except Exception as e:
        logger.warning(f"[search] services scan failed: {e}")

    # -----------------------------------------------------------------
    # 3. Staff / barbers
    # -----------------------------------------------------------------
    try:
        async for b in _db.barbers.find({"salon_id": salon_id}, {"_id": 0}).limit(200):
            hay = " ".join(str(b.get(k) or "") for k in ("name", "specialty", "phone"))
            if _match(hay, q_norm, q_tokens, q_compact):
                results.append({
                    "type": "staff",
                    "id": b.get("id"),
                    "title": b.get("name") or "(unnamed staff)",
                    "subtitle": (b.get("specialty") or "").title() or (b.get("phone") or ""),
                    "route": f"/salon/dashboard?tab=staff&barber_id={b.get('id') or ''}",
                    "icon": "user",
                })
                if len([r for r in results if r["type"] == "staff"]) >= limit:
                    break
    except Exception as e:
        logger.warning(f"[search] staff scan failed: {e}")

    # -----------------------------------------------------------------
    # 4. Membership plans
    # -----------------------------------------------------------------
    try:
        async for m in _db.membership_plans.find({"salon_id": salon_id}, {"_id": 0}).limit(200):
            hay = " ".join(str(m.get(k) or "") for k in ("plan_name", "name", "description"))
            if _match(hay, q_norm, q_tokens, q_compact):
                results.append({
                    "type": "membership",
                    "id": m.get("id"),
                    "title": m.get("plan_name") or m.get("name") or "(unnamed plan)",
                    "subtitle": f"₹{m.get('price', 0)} · {m.get('duration_months', '?')} mo",
                    "route": f"/salon/dashboard?tab=memberships&plan_id={m.get('id') or ''}",
                    "icon": "badge",
                })
                if len([r for r in results if r["type"] == "membership"]) >= limit:
                    break
    except Exception as e:
        logger.warning(f"[search] memberships scan failed: {e}")

    # -----------------------------------------------------------------
    # 5. Store products.  We look at the salon store's live catalog
    #    (`supplier_products`) plus the sample catalog salons browse when
    #    a supplier hasn't added their own SKU yet (`supplier_product_samples`).
    # -----------------------------------------------------------------
    seen_product_ids = set()
    for coll_name, is_sample in (("supplier_products", False), ("supplier_product_samples", True)):
        if len([r for r in results if r["type"] == "product"]) >= limit:
            break
        try:
            base_filter = {} if is_sample else {"is_active": True, "is_deleted": {"$ne": True}}
            async for p in _db[coll_name].find(base_filter, {"_id": 0}).limit(400):
                pid = p.get("id")
                if pid and pid in seen_product_ids:
                    continue
                hay = " ".join(str(p.get(k) or "") for k in ("name", "brand", "category", "description"))
                if _match(hay, q_norm, q_tokens, q_compact):
                    seen_product_ids.add(pid)
                    results.append({
                        "type": "product",
                        "id": pid,
                        "title": p.get("name") or "(unnamed product)",
                        "subtitle": f"{p.get('brand') or p.get('category') or ''} · ₹{p.get('price', 0)}".strip(" ·"),
                        "route": f"/salon/marketplace?product_id={pid or ''}",
                        "icon": "shop",
                    })
                    if len([r for r in results if r["type"] == "product"]) >= limit:
                        break
        except Exception as e:
            logger.warning(f"[search] {coll_name} scan failed: {e}")

    return {"query": q, "results": results, "total": len(results)}


# ---------------------------------------------------------------------------
# Trending endpoint — for the empty-state of the dropdown ("what's popular")
# ---------------------------------------------------------------------------

@search_router.get("/{salon_id}/search/trending")
async def trending(
    salon_id: str,
    current_user = Depends(_auth),
):
    """Return a small set of popular services + products for the dropdown's
    empty-state.  We rank services by booking-count over the last 60 days
    (falling back to any enabled service if no bookings) and products by
    stored `popularity_score` / `view_count` if present, else the first N.
    """
    if _db is None:
        raise HTTPException(status_code=500, detail="search_not_initialised")

    # ---- Trending services ----
    trending_services: List[Dict[str, Any]] = []
    try:
        pipeline = [
            {"$match": {"salon_id": salon_id}},
            {"$unwind": {"path": "$services", "preserveNullAndEmptyArrays": False}},
            {"$group": {"_id": "$services.service_id", "bookings": {"$sum": 1}, "name": {"$first": "$services.service_name"}}},
            {"$sort": {"bookings": -1}},
            {"$limit": 5},
        ]
        async for row in _db.tokens.aggregate(pipeline):
            sid = row.get("_id")
            if not sid:
                continue
            svc = await _db.services.find_one({"id": sid}, {"_id": 0}) or {}
            trending_services.append({
                "type": "service",
                "id": sid,
                "title": svc.get("service_name") or row.get("name") or "Service",
                "subtitle": f"{svc.get('category') or ''} · ₹{svc.get('base_price', svc.get('price', 0))}".strip(" ·"),
                "route": f"/salon/dashboard?tab=services&service_id={sid}",
                "bookings": int(row.get("bookings") or 0),
            })
    except Exception as e:
        logger.warning(f"[search/trending] services aggregate failed: {e}")

    if not trending_services:
        # Fallback — any 4 active salon services
        try:
            async for s in _db.services.find({"salon_id": salon_id, "is_active": {"$ne": False}}, {"_id": 0}).limit(4):
                trending_services.append({
                    "type": "service",
                    "id": s.get("id"),
                    "title": s.get("service_name"),
                    "subtitle": f"{s.get('category') or ''} · ₹{s.get('base_price', 0)}".strip(" ·"),
                    "route": f"/salon/dashboard?tab=services&service_id={s.get('id')}",
                    "bookings": 0,
                })
        except Exception as e:
            logger.warning(f"[search/trending] services fallback failed: {e}")

    # ---- Trending products (across catalog; not salon-specific) ----
    trending_products: List[Dict[str, Any]] = []
    try:
        # Prefer view_count / popularity_score if the schema has them; else first N
        cursor = _db.supplier_product_samples.find({}, {"_id": 0})
        cursor = cursor.sort([("view_count", -1), ("popularity_score", -1)]).limit(5)
        async for p in cursor:
            trending_products.append({
                "type": "product",
                "id": p.get("id"),
                "title": p.get("name"),
                "subtitle": f"{p.get('brand') or p.get('category') or ''} · ₹{p.get('price', 0)}".strip(" ·"),
                "route": f"/salon/marketplace?product_id={p.get('id') or ''}",
            })
    except Exception as e:
        logger.warning(f"[search/trending] products cursor failed: {e}")

    return {
        "trending_services": trending_services,
        "trending_products": trending_products,
    }
