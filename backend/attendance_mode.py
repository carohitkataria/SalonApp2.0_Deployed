"""
Module 4 — Attendance Criteria Selection (Mode A / Mode B) + Geo-Check-in.

Two mutually exclusive attendance modes per salon:
  • "service_completion" (Mode A — existing behaviour, kept verbatim in
    `server.calculate_barber_attendance_for_date`).
  • "geo_checkin" (Mode B — geo-fenced check-in / check-out, this module).

Switching modes is non-destructive:
  • Both Mode A and Mode B raw fields live on the same `attendance` doc.
  • `attendance_mode_history` on the salon records every switch.
  • Each attendance day is stamped with `computed_under_mode` so historical
    days keep the status they were computed under — switching modes does
    NOT silently rewrite last month's attendance.

This file owns:
  • PUT  /api/salons/{salon_id}/attendance-mode
  • POST /api/salons/{salon_id}/staff-attendance/check-in
  • POST /api/salons/{salon_id}/staff-attendance/check-out
  • PUT  /api/salons/{salon_id}/staff-attendance/check-edit/{barber_id}/{date}
  • Helpers consumed by server.py:
       - resolve_mode_for_date(salon, date_str)
       - compute_mode_b_status(salon, barber_id, date_str, attendance_doc)
       - is_attendance_locked(db, salon_id, barber_id, date_str)
       - haversine_meters(lat1, lng1, lat2, lng2)
       - default_geo_settings() / current_ist_date()
       - auto_close_open_checkins_job(db)
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

# Module globals injected by init_attendance_mode().
_db = None
_get_current_salon_user = None
_get_current_salon_admin = None

IST = timezone(timedelta(hours=5, minutes=30))

DEFAULT_GEO_SETTINGS = {
    "check_in_radius_meters": 50,
    # New unified threshold fields (preferred).
    "late_mark_threshold_min": 15,       # mins after salon opening_time before "late"
    "required_hours_per_day": 8.0,       # working hours required to count as full day
    "auto_absent_cutoff_hour": 23,       # 0-23 IST; open check-ins auto-closed after this
    "allow_admin_override": True,
    # Legacy fields (kept for backward-compat with existing salon docs).
    "max_check_in_time": "10:30",
    "min_daily_minutes": 480,
    "auto_close_at": "23:59",
}


# Map of weekday-index → operational_hours sub-doc key.
_WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def _opening_time_for_date(salon: dict, date_str: str) -> str:
    """Return the opening_time (HH:MM) configured for the given date.
    Falls back to "09:00" if operational_hours not set."""
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
        day_key = _WEEKDAYS[d.weekday()]
        hours = (salon.get("operational_hours") or {}).get(day_key) or {}
        return hours.get("opening_time") or "09:00"
    except Exception:
        return "09:00"


# ============================================================
# Helpers (also imported by server.py for salary / attendance refactor)
# ============================================================

def current_ist_date() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d")


def current_ist_iso() -> str:
    return datetime.now(IST).isoformat()


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres."""
    r = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def default_geo_settings() -> dict:
    return DEFAULT_GEO_SETTINGS.copy()


def resolve_mode_for_date(salon: dict, date_str: str) -> str:
    """Look up which mode was active on the given date.

    The salon's `attendance_mode_history` is a list of
        {mode, changed_by, changed_at, effective_from_date}
    entries (newest at the end, but we sort defensively).  We pick the
    latest entry whose `effective_from_date <= date_str`.  If no history
    exists, we fall back to the current `attendance_mode` (or
    "service_completion" by default — preserves legacy behaviour).
    """
    hist = salon.get("attendance_mode_history") or []
    hist_sorted = sorted(
        [h for h in hist if h.get("effective_from_date")],
        key=lambda h: h["effective_from_date"],
    )
    active = None
    for entry in hist_sorted:
        if entry["effective_from_date"] <= date_str:
            active = entry.get("mode")
    if active:
        return active
    return salon.get("attendance_mode") or "service_completion"


async def _get_branch_center(salon: dict, barber: dict) -> tuple[Optional[float], Optional[float], Optional[str]]:
    """Return (lat, lng, source) for the geo-fence centre of this barber's
    branch.  Falls back to the salon's own lat/lng if no branch is set or
    the branch has no coordinates.  `source` is a human-readable label
    used in 409 errors."""
    branch_id = barber.get("branch_id")
    if branch_id and _db is not None:
        branch = await _db.branches.find_one({"id": branch_id}, {"_id": 0})
        if branch and branch.get("latitude") is not None and branch.get("longitude") is not None:
            return float(branch["latitude"]), float(branch["longitude"]), f"branch:{branch_id}"
    # Fallback: main salon coordinates.
    if salon.get("latitude") is not None and salon.get("longitude") is not None:
        return float(salon["latitude"]), float(salon["longitude"]), "salon"
    return None, None, None


def _parse_hhmm_to_minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def compute_mode_b_status(salon: dict, attendance_doc: dict, *, day_has_passed: bool, on_leave: bool) -> dict:
    """Compute the {status, half_day_reason, total_minutes} for Mode B
    from the raw check-in/out fields already present on `attendance_doc`.

    Inputs:
      • salon              — salon doc (for geo_settings + operational_hours).
      • attendance_doc     — raw doc with check_in_at / check_out_at /
                             check_in_*, check_out_* (may be partial).
      • day_has_passed     — True if the date_str is strictly before today IST.
      • on_leave           — True if the barber has an active leave record
                             on that date (leave overrides everything).

    Returns: {status, half_day_reason, total_minutes}.
    """
    if on_leave:
        return {"status": "absent", "half_day_reason": None, "total_minutes": 0}

    geo = (salon.get("geo_settings") or {})

    # --- Late-mark cutoff (minutes-into-day in IST) ---
    # Prefer the new unified config (late_mark_threshold_min after the day's
    # opening_time).  Fall back to legacy max_check_in_time HH:MM.
    if geo.get("late_mark_threshold_min") is not None:
        opening = _opening_time_for_date(salon, attendance_doc.get("date") or "")
        opening_min = _parse_hhmm_to_minutes(opening)
        max_in_min = opening_min + int(geo["late_mark_threshold_min"])
    else:
        max_in_min = _parse_hhmm_to_minutes(
            geo.get("max_check_in_time") or DEFAULT_GEO_SETTINGS["max_check_in_time"]
        )

    # --- Minimum daily minutes ---
    if geo.get("required_hours_per_day") is not None:
        min_day_minutes = int(float(geo["required_hours_per_day"]) * 60)
    else:
        min_day_minutes = int(geo.get("min_daily_minutes") or DEFAULT_GEO_SETTINGS["min_daily_minutes"])

    # --- Sessions-aware total minutes (multi check-in/out per day) ---
    # If `sessions` array is present, sum durations across ALL closed sessions
    # plus any currently-open one (up to "now" for in-progress days).
    # Falls back to legacy single check_in_at / check_out_at pair.
    ci = attendance_doc.get("check_in_at")
    co = attendance_doc.get("check_out_at")
    sessions = attendance_doc.get("sessions") or []

    def _iso_to_dt(iso_str):
        try:
            dt = datetime.fromisoformat(iso_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            return None

    if not ci and not sessions:
        # No check-in at all.
        if day_has_passed:
            return {"status": "absent", "half_day_reason": None, "total_minutes": 0}
        # Same day, no check-in yet → undetermined; we still record "absent"
        # so the calendar can render a red cell; it'll flip on check-in.
        return {"status": "absent", "half_day_reason": None, "total_minutes": 0}

    # Late check-in test — use the FIRST check-in (either sessions[0].ci or
    # legacy check_in_at).
    first_ci = ci
    if sessions:
        first_ci = sessions[0].get("ci") or ci
    try:
        ci_dt = datetime.fromisoformat(first_ci)
        if ci_dt.tzinfo is None:
            ci_dt = ci_dt.replace(tzinfo=timezone.utc)
        ci_ist = ci_dt.astimezone(IST)
        ci_minutes_into_day = ci_ist.hour * 60 + ci_ist.minute
    except Exception:
        ci_minutes_into_day = max_in_min  # benign default → not "late"

    # Compute total_minutes across all sessions (or legacy pair).
    def _sum_session_minutes(day_passed):
        total = 0
        for s in sessions:
            s_ci = _iso_to_dt(s.get("ci"))
            if not s_ci:
                continue
            s_co = _iso_to_dt(s.get("co")) or (
                None if day_passed else datetime.now(timezone.utc)
            )
            if not s_co:
                continue
            total += max(0, int((s_co - s_ci).total_seconds() // 60))
        return total

    # If day still in progress AND no check-out logged AND no closed sessions
    # → pending status.
    day_over = day_has_passed
    has_open_session = any((s.get("ci") and not s.get("co")) for s in sessions)
    has_closed_session = any((s.get("ci") and s.get("co")) for s in sessions)

    # No check-out logged yet (legacy `co` empty AND no closed sessions)
    if not co and not has_closed_session:
        if day_over and not has_open_session:
            return {"status": "absent", "half_day_reason": None, "total_minutes": 0}
        # Day in progress OR still-open session: partial minutes if we have sessions
        partial = _sum_session_minutes(day_over) if sessions else 0
        if ci_minutes_into_day > max_in_min:
            return {"status": "half_day", "half_day_reason": "late_checkin", "total_minutes": partial}
        return {"status": "present", "half_day_reason": None, "total_minutes": partial}

    # Compute total minutes.
    if sessions:
        total_minutes = _sum_session_minutes(day_over)
    else:
        # Legacy single-pair path
        try:
            co_dt = datetime.fromisoformat(co)
            if co_dt.tzinfo is None:
                co_dt = co_dt.replace(tzinfo=timezone.utc)
            total_minutes = max(0, int((co_dt - ci_dt).total_seconds() // 60))
        except Exception:
            total_minutes = 0

    if ci_minutes_into_day > max_in_min:
        return {"status": "half_day", "half_day_reason": "late_checkin", "total_minutes": total_minutes}
    if total_minutes < min_day_minutes:
        return {"status": "half_day", "half_day_reason": "short_hours", "total_minutes": total_minutes}
    return {"status": "present", "half_day_reason": None, "total_minutes": total_minutes}


async def is_attendance_locked(db, salon_id: str, barber_id: str, date_str: str) -> Optional[str]:
    """Return the month (YYYY-MM) of the paid salary record that locks
    this date, or None if not locked."""
    month = date_str[:7] if date_str and len(date_str) >= 7 else None
    if not month:
        return None
    salary = await db.salary_records.find_one(
        {"salon_id": salon_id, "barber_id": barber_id, "month": month, "is_paid": True},
        {"_id": 0, "month": 1, "is_paid": 1},
    )
    return month if salary else None


# ============================================================
# Pydantic payloads
# ============================================================

class GeoSettingsPayload(BaseModel):
    check_in_radius_meters: Optional[int] = Field(default=None, ge=10, le=2000)
    # New unified threshold fields
    late_mark_threshold_min: Optional[int] = Field(default=None, ge=0, le=240)
    required_hours_per_day: Optional[float] = Field(default=None, ge=1.0, le=16.0)
    auto_absent_cutoff_hour: Optional[int] = Field(default=None, ge=0, le=23)
    # Legacy fields (still accepted)
    max_check_in_time: Optional[str] = None  # "HH:MM"
    min_daily_minutes: Optional[int] = Field(default=None, ge=30, le=24 * 60)
    allow_admin_override: Optional[bool] = None
    auto_close_at: Optional[str] = None  # "HH:MM"

    @field_validator("max_check_in_time", "auto_close_at")
    @classmethod
    def _v_hhmm(cls, v):
        if v is None:
            return v
        try:
            _parse_hhmm_to_minutes(v)
        except Exception:
            raise ValueError("Time must be in 'HH:MM' format")
        return v


class AttendanceModeUpdate(BaseModel):
    mode: str
    geo_settings: Optional[GeoSettingsPayload] = None
    effective_from_date: Optional[str] = None  # internal: defaults to today IST

    @field_validator("mode")
    @classmethod
    def _v_mode(cls, v):
        if v not in {"service_completion", "geo_checkin"}:
            raise ValueError("mode must be 'service_completion' or 'geo_checkin'")
        return v


class CheckInPayload(BaseModel):
    barber_id: str
    latitude: float
    longitude: float
    method: Optional[str] = "self"  # "self" | "admin_on_behalf" | "self_override"
    self_override_reason: Optional[str] = None


class CheckOutPayload(BaseModel):
    barber_id: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    method: Optional[str] = "self"


class CheckEditPayload(BaseModel):
    check_in_at: Optional[str] = None  # ISO datetime
    check_out_at: Optional[str] = None
    status: Optional[str] = None  # force final status
    half_day_reason: Optional[str] = None
    note: Optional[str] = None


# ============================================================
# Router
# ============================================================

attendance_mode_router = APIRouter()


def _assert_salon(user: dict, salon_id: str):
    token_salon = user.get("salon_id") or user.get("sub")
    if token_salon != salon_id:
        raise HTTPException(status_code=403, detail="Salon mismatch")


def _is_admin(user: dict) -> bool:
    return user.get("role") in ("salon_admin", "salon", "admin")


def _is_branch_manager(user: dict) -> bool:
    return user.get("role") == "salon_branch_manager"


async def _user_can_act_for_barber(user: dict, salon_id: str, barber_id: str) -> bool:
    """Self check-in (staff for their own staff_id) OR admin OR branch manager
    whose assigned branches include this barber's branch."""
    if _is_admin(user):
        return True
    if user.get("role") == "salon_staff" and user.get("staff_id") == barber_id:
        return True
    if _is_branch_manager(user):
        assigned = user.get("assigned_branch_ids") or []
        barber = await _db.barbers.find_one({"id": barber_id, "salon_id": salon_id}, {"_id": 0, "branch_id": 1})
        if barber and barber.get("branch_id") in assigned:
            return True
    return False


@attendance_mode_router.put("/api/salons/{salon_id}/attendance-mode")
async def update_attendance_mode(salon_id: str, payload: AttendanceModeUpdate,
                                  user: dict = Depends(lambda: None)):
    # Lazy dep — real dep is patched in init.
    raise NotImplementedError  # replaced below


# --------------- the real handlers (will be re-registered in init) -----------


async def _update_attendance_mode_impl(salon_id: str, payload: AttendanceModeUpdate, user: dict):
    _assert_salon(user, salon_id)
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only salon admins can change attendance mode")

    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")

    eff_date = payload.effective_from_date or current_ist_date()
    now_iso = current_ist_iso()
    user_id = user.get("user_id") or user.get("id") or user.get("sub")

    history = list(salon.get("attendance_mode_history") or [])
    history.append({
        "id": str(uuid.uuid4()),
        "mode": payload.mode,
        "changed_by": user_id,
        "changed_at": now_iso,
        "effective_from_date": eff_date,
    })

    update_doc: dict[str, Any] = {
        "attendance_mode": payload.mode,
        "attendance_mode_history": history,
    }

    # Merge geo_settings (additive — keep prior keys).
    if payload.geo_settings is not None:
        existing_geo = dict(salon.get("geo_settings") or DEFAULT_GEO_SETTINGS)
        for k, v in payload.geo_settings.model_dump(exclude_none=True).items():
            existing_geo[k] = v
        update_doc["geo_settings"] = existing_geo
    elif not salon.get("geo_settings"):
        # First time: seed defaults so the UI has something to render.
        update_doc["geo_settings"] = DEFAULT_GEO_SETTINGS.copy()

    await _db.salons.update_one({"id": salon_id}, {"$set": update_doc})
    fresh = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    return {
        "ok": True,
        "attendance_mode": fresh.get("attendance_mode"),
        "attendance_mode_history": fresh.get("attendance_mode_history") or [],
        "geo_settings": fresh.get("geo_settings") or DEFAULT_GEO_SETTINGS.copy(),
    }


async def _check_in_impl(salon_id: str, payload: CheckInPayload, user: dict):
    _assert_salon(user, salon_id)
    if not await _user_can_act_for_barber(user, salon_id, payload.barber_id):
        raise HTTPException(status_code=403, detail="Not allowed to check in for this staff")

    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")

    today = current_ist_date()
    locked = await is_attendance_locked(_db, salon_id, payload.barber_id, today)
    if locked:
        raise HTTPException(status_code=423, detail=f"Salary for {locked} is already paid; attendance is locked")

    # Mode B must be active today (else this endpoint is a no-op + 409).
    mode = resolve_mode_for_date(salon, today)
    if mode != "geo_checkin":
        raise HTTPException(status_code=409, detail="Salon is in 'service_completion' mode; check-in not applicable")

    barber = await _db.barbers.find_one({"id": payload.barber_id, "salon_id": salon_id}, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Staff not found")

    centre_lat, centre_lng, source = await _get_branch_center(salon, barber)
    if centre_lat is None:
        raise HTTPException(status_code=409, detail="Branch has no geo coordinates configured")

    geo = salon.get("geo_settings") or DEFAULT_GEO_SETTINGS.copy()
    radius = int(geo.get("check_in_radius_meters") or 50)
    distance = haversine_meters(payload.latitude, payload.longitude, centre_lat, centre_lng)

    method = payload.method or "self"
    if distance > radius:
        # Admin-on-behalf or self_override may bypass.
        allow_admin = bool(geo.get("allow_admin_override", True))
        is_override = method in ("admin_on_behalf", "self_override")
        if not (is_override and (allow_admin or _is_admin(user))):
            raise HTTPException(
                status_code=409,
                detail=f"You are {int(distance)}m from the {source}; geo-fence radius is {radius}m",
            )

    now_iso = current_ist_iso()
    record_id = f"{salon_id}_{payload.barber_id}_{today}"
    existing = await _db.attendance.find_one({"id": record_id}, {"_id": 0})

    # Multi-session support (#1c): permit check-in again ONLY when the last
    # session has been checked-out. If a session is currently open, block.
    existing_sessions = list((existing or {}).get("sessions") or [])
    has_open_session = any((s.get("ci") and not s.get("co")) for s in existing_sessions)
    # Legacy fallback: if only `check_in_at` exists (no sessions yet) and no
    # `check_out_at`, treat that as an open session too.
    legacy_open = (
        existing
        and existing.get("check_in_at")
        and not existing.get("check_out_at")
        and not existing_sessions
    )
    if has_open_session or legacy_open:
        raise HTTPException(status_code=409, detail="Please check out first before checking in again")

    on_leave = bool(await _db.leave_records.find_one({
        "salon_id": salon_id, "barber_id": payload.barber_id, "date": today,
        "status": {"$ne": "cancelled"},
    }, {"_id": 0, "id": 1}))

    # Build a new session entry for THIS check-in.
    new_session = {
        "ci": now_iso,
        "ci_lat": payload.latitude,
        "ci_lng": payload.longitude,
        "ci_distance_meters": int(distance),
        "ci_method": method,
    }
    if payload.self_override_reason:
        new_session["ci_override_reason"] = payload.self_override_reason

    # If legacy pair exists without sessions, migrate it into sessions first.
    if existing and existing.get("check_in_at") and not existing_sessions:
        legacy_session = {
            "ci": existing.get("check_in_at"),
            "co": existing.get("check_out_at"),
            "ci_lat": existing.get("check_in_lat"),
            "ci_lng": existing.get("check_in_lng"),
            "ci_distance_meters": existing.get("check_in_distance_meters"),
            "ci_method": existing.get("check_in_method"),
            "co_lat": existing.get("check_out_lat"),
            "co_lng": existing.get("check_out_lng"),
            "co_method": existing.get("check_out_method"),
        }
        existing_sessions.append(legacy_session)
    existing_sessions.append(new_session)

    # First-of-day check-in fields stay pinned to the very first ci.
    first_ci_iso = existing.get("check_in_at") if (existing and existing.get("check_in_at")) else now_iso
    first_ci_lat = existing.get("check_in_lat") if (existing and existing.get("check_in_at")) else payload.latitude
    first_ci_lng = existing.get("check_in_lng") if (existing and existing.get("check_in_at")) else payload.longitude

    doc = {
        "id": record_id,
        "salon_id": salon_id,
        "barber_id": payload.barber_id,
        "date": today,
        "check_in_at": first_ci_iso,      # first check-in of the day (for legacy readers)
        "check_in_lat": first_ci_lat,
        "check_in_lng": first_ci_lng,
        "check_in_distance_meters": (existing.get("check_in_distance_meters") if existing and existing.get("check_in_at") else int(distance)),
        "check_in_method": (existing.get("check_in_method") if existing and existing.get("check_in_at") else method),
        # Clear check-out on re-check-in — day is active again.
        "check_out_at": None,
        "sessions": existing_sessions,
        "computed_under_mode": "geo_checkin",
        "auto_calculated": True,
        "created_at": (existing or {}).get("created_at") or now_iso,
        "updated_at": now_iso,
    }

    # Compute provisional status.
    computed = compute_mode_b_status(
        salon, {**(existing or {}), **doc},
        day_has_passed=False, on_leave=on_leave,
    )
    doc.update(computed)

    await _db.attendance.update_one({"id": record_id}, {"$set": doc, "$setOnInsert": {"bookings_count": 0}}, upsert=True)
    return {"ok": True, "record": (await _db.attendance.find_one({"id": record_id}, {"_id": 0}))}


async def _check_out_impl(salon_id: str, payload: CheckOutPayload, user: dict):
    _assert_salon(user, salon_id)
    if not await _user_can_act_for_barber(user, salon_id, payload.barber_id):
        raise HTTPException(status_code=403, detail="Not allowed to check out for this staff")

    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")

    today = current_ist_date()
    locked = await is_attendance_locked(_db, salon_id, payload.barber_id, today)
    if locked:
        raise HTTPException(status_code=423, detail=f"Salary for {locked} is already paid; attendance is locked")

    record_id = f"{salon_id}_{payload.barber_id}_{today}"
    existing = await _db.attendance.find_one({"id": record_id}, {"_id": 0})
    if not existing or not existing.get("check_in_at"):
        raise HTTPException(status_code=409, detail="No active check-in found for today")

    # Multi-session support (#1c): the "open" session is the LAST one whose
    # `co` is missing. If no such session exists, already checked out.
    existing_sessions = list((existing or {}).get("sessions") or [])
    open_idx = -1
    for i, s in enumerate(existing_sessions):
        if s.get("ci") and not s.get("co"):
            open_idx = i
    # Legacy fallback: no sessions array yet but check_in_at set + no check_out_at.
    legacy_open = (
        existing.get("check_in_at")
        and not existing.get("check_out_at")
        and not existing_sessions
    )
    if open_idx < 0 and not legacy_open:
        raise HTTPException(status_code=409, detail="No active check-in — please check in first")

    now_iso = current_ist_iso()
    on_leave = bool(await _db.leave_records.find_one({
        "salon_id": salon_id, "barber_id": payload.barber_id, "date": today,
        "status": {"$ne": "cancelled"},
    }, {"_id": 0, "id": 1}))

    # Close the open session (either the last open in `sessions`, or migrate
    # the legacy pair into a first session).
    if open_idx >= 0:
        existing_sessions[open_idx]["co"] = now_iso
        if payload.latitude is not None:
            existing_sessions[open_idx]["co_lat"] = payload.latitude
        if payload.longitude is not None:
            existing_sessions[open_idx]["co_lng"] = payload.longitude
        existing_sessions[open_idx]["co_method"] = payload.method or "self"
    else:
        # Migrate legacy pair → sessions.
        existing_sessions = [{
            "ci": existing.get("check_in_at"),
            "co": now_iso,
            "ci_lat": existing.get("check_in_lat"),
            "ci_lng": existing.get("check_in_lng"),
            "ci_distance_meters": existing.get("check_in_distance_meters"),
            "ci_method": existing.get("check_in_method"),
            "co_lat": payload.latitude,
            "co_lng": payload.longitude,
            "co_method": payload.method or "self",
        }]

    merged = {**existing, "check_out_at": now_iso, "sessions": existing_sessions}
    if payload.latitude is not None and payload.longitude is not None:
        merged["check_out_lat"] = payload.latitude
        merged["check_out_lng"] = payload.longitude
    merged["check_out_method"] = payload.method or "self"

    computed = compute_mode_b_status(salon, merged, day_has_passed=False, on_leave=on_leave)
    set_doc = {
        "check_out_at": merged["check_out_at"],
        "check_out_method": merged["check_out_method"],
        "sessions": existing_sessions,
        "status": computed["status"],
        "half_day_reason": computed["half_day_reason"],
        "total_minutes": computed["total_minutes"],
        "computed_under_mode": "geo_checkin",
        "updated_at": now_iso,
    }
    if payload.latitude is not None:
        set_doc["check_out_lat"] = payload.latitude
    if payload.longitude is not None:
        set_doc["check_out_lng"] = payload.longitude

    await _db.attendance.update_one({"id": record_id}, {"$set": set_doc})
    return {"ok": True, "record": (await _db.attendance.find_one({"id": record_id}, {"_id": 0}))}


async def _check_edit_impl(salon_id: str, barber_id: str, date: str,
                             payload: CheckEditPayload, user: dict):
    _assert_salon(user, salon_id)
    if not (_is_admin(user) or (_is_branch_manager(user) and
                                  await _user_can_act_for_barber(user, salon_id, barber_id))):
        raise HTTPException(status_code=403, detail="Admin / branch-manager access required")

    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")

    locked = await is_attendance_locked(_db, salon_id, barber_id, date)
    if locked:
        raise HTTPException(status_code=423, detail=f"Salary for {locked} is already paid; attendance is locked")

    record_id = f"{salon_id}_{barber_id}_{date}"
    existing = await _db.attendance.find_one({"id": record_id}, {"_id": 0}) or {
        "id": record_id, "salon_id": salon_id, "barber_id": barber_id, "date": date,
        "bookings_count": 0,
        "created_at": current_ist_iso(),
    }

    now_iso = current_ist_iso()
    set_doc: dict[str, Any] = {
        "auto_calculated": False,
        "override_by": user.get("user_id") or user.get("id") or user.get("sub"),
        "override_note": payload.note,
        "updated_at": now_iso,
    }
    if payload.check_in_at is not None:
        set_doc["check_in_at"] = payload.check_in_at
        set_doc["check_in_method"] = "admin_edit"
    if payload.check_out_at is not None:
        set_doc["check_out_at"] = payload.check_out_at
        set_doc["check_out_method"] = "admin_edit"

    merged = {**existing, **set_doc}
    on_leave = bool(await _db.leave_records.find_one({
        "salon_id": salon_id, "barber_id": barber_id, "date": date,
        "status": {"$ne": "cancelled"},
    }, {"_id": 0, "id": 1}))
    day_passed = date < current_ist_date()

    # If admin forces a final status, honour it; otherwise recompute under Mode B.
    if payload.status:
        if payload.status not in ("present", "half_day", "absent", "holiday", "on_leave"):
            raise HTTPException(status_code=400, detail="Invalid status")
        set_doc["status"] = payload.status
        set_doc["half_day_reason"] = payload.half_day_reason
        # total_minutes still recomputed if both timestamps present.
        if merged.get("check_in_at") and merged.get("check_out_at"):
            try:
                ci = datetime.fromisoformat(merged["check_in_at"])
                co = datetime.fromisoformat(merged["check_out_at"])
                if ci.tzinfo is None:
                    ci = ci.replace(tzinfo=timezone.utc)
                if co.tzinfo is None:
                    co = co.replace(tzinfo=timezone.utc)
                set_doc["total_minutes"] = max(0, int((co - ci).total_seconds() // 60))
            except Exception:
                pass
    else:
        computed = compute_mode_b_status(salon, merged, day_has_passed=day_passed, on_leave=on_leave)
        set_doc.update(computed)

    set_doc["computed_under_mode"] = "geo_checkin"

    await _db.attendance.update_one(
        {"id": record_id},
        {"$set": {**existing, **set_doc}},
        upsert=True,
    )
    return {"ok": True, "record": (await _db.attendance.find_one({"id": record_id}, {"_id": 0}))}


# ============================================================
# Auto-close job
# ============================================================

async def auto_close_open_checkins_job(db):
    """At `geo_settings.auto_absent_cutoff_hour` IST (or legacy
    `geo_settings.auto_close_at`), mark any open check-ins as absent
    (no check-out logged).  Per spec: 'If check-out is missing and
    the day has passed, mark Absent.'

    Behaviour:
      • Always closes yesterday's still-open check-ins (safe day-rollover).
      • Additionally closes today's open check-ins if the current IST hour
        has crossed `auto_absent_cutoff_hour`.

    Cross-module guard: must skip locked months (salary already paid).
    """
    salons = await db.salons.find({"attendance_mode": "geo_checkin"}, {"_id": 0, "id": 1, "geo_settings": 1}).to_list(length=10_000)
    closed = 0
    now_ist = datetime.now(IST)
    for s in salons:
        geo = s.get("geo_settings") or {}
        # Resolve effective cutoff hour: prefer new field, fall back to legacy HH:MM.
        cutoff_hour = geo.get("auto_absent_cutoff_hour")
        if cutoff_hour is None:
            try:
                cutoff_hour = _parse_hhmm_to_minutes(
                    geo.get("auto_close_at") or DEFAULT_GEO_SETTINGS["auto_close_at"]
                ) // 60
            except Exception:
                cutoff_hour = 23

        dates_to_close = [(now_ist.date() - timedelta(days=1)).strftime("%Y-%m-%d")]
        if now_ist.hour >= int(cutoff_hour):
            dates_to_close.append(now_ist.date().strftime("%Y-%m-%d"))

        for date_str in dates_to_close:
            open_recs = await db.attendance.find({
                "salon_id": s["id"], "date": date_str,
                "check_in_at": {"$ne": None}, "check_out_at": None,
            }, {"_id": 0}).to_list(length=10_000)
            for r in open_recs:
                # Lock-on-paid guard.
                locked = await is_attendance_locked(db, s["id"], r["barber_id"], date_str)
                if locked:
                    continue
                await db.attendance.update_one(
                    {"id": r["id"]},
                    {"$set": {
                        "status": "absent",
                        "half_day_reason": None,
                        "computed_under_mode": "geo_checkin",
                        "auto_calculated": True,
                        "updated_at": datetime.now(IST).isoformat(),
                    }},
                )
                closed += 1
    return {"closed": closed}


# ============================================================
# init
# ============================================================

def init_attendance_mode(*, db, get_current_salon_user, get_current_salon_admin):
    """Wire the router into the main app.  Called from server.py."""
    global _db, _get_current_salon_user, _get_current_salon_admin
    _db = db
    _get_current_salon_user = get_current_salon_user
    _get_current_salon_admin = get_current_salon_admin

    # Re-register routes with the real dependency now that the auth deps
    # are available.  We drop the placeholder route added at import time.
    attendance_mode_router.routes.clear()

    @attendance_mode_router.put("/api/salons/{salon_id}/attendance-mode")
    async def _r_update_mode(salon_id: str, payload: AttendanceModeUpdate,
                              user: dict = Depends(get_current_salon_user)):
        return await _update_attendance_mode_impl(salon_id, payload, user)

    @attendance_mode_router.post("/api/salons/{salon_id}/staff-attendance/check-in")
    async def _r_check_in(salon_id: str, payload: CheckInPayload,
                            user: dict = Depends(get_current_salon_user)):
        return await _check_in_impl(salon_id, payload, user)

    @attendance_mode_router.post("/api/salons/{salon_id}/staff-attendance/check-out")
    async def _r_check_out(salon_id: str, payload: CheckOutPayload,
                             user: dict = Depends(get_current_salon_user)):
        return await _check_out_impl(salon_id, payload, user)

    @attendance_mode_router.put("/api/salons/{salon_id}/staff-attendance/check-edit/{barber_id}/{date}")
    async def _r_check_edit(salon_id: str, barber_id: str, date: str,
                              payload: CheckEditPayload,
                              user: dict = Depends(get_current_salon_user)):
        return await _check_edit_impl(salon_id, barber_id, date, payload, user)

    return attendance_mode_router
