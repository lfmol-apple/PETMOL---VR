# 🔍 PETMOL Push Notification — Working vs Broken Paths Comparison

## 📋 Executive Summary

**Working**: `send_medication_pushes()` — Medication & Test reminders fire correctly  
**Broken**: `send_care_pushes()` — Vaccine, Parasite, Grooming reminders don't fire

**Root Cause Analysis**:
1. **Time Matching Logic** — Different implementation approaches
2. **Query Filters** — Additional constraints in care path
3. **Event vs Model Structure** — Medication uses Event model, care uses specialized models
4. **Reminder Time Defaults** — Fallback behavior differs

---

## 🔬 Side-by-Side Comparison

### 1️⃣ SUBSCRIPTION LOADING

| Aspect | Medication | Care |
|--------|-----------|------|
| Load subscriptions | ✅ `_load_subscriptions()` | ✅ `_load_subscriptions()` |
| Filter valid users | ✅ Check `_is_subscription_entry(value)` | ✅ Check `_is_subscription_entry(value)` |
| Skip if empty | ✅ Return early | ✅ Return early |
| **Audit Logging** | ✅ `audit.add_skip(NO_SUBSCRIPTIONS)` | ✅ `audit.add_skip(NO_SUBSCRIPTIONS)` |

**Status**: ✅ **IDENTICAL** — No issues here.

---

### 2️⃣ RECORD FETCHING

#### Medication Path
```python
events = db.query(Event)
    .filter(
        Event.user_id.in_(user_ids),
        Event.type.in_(["medicacao", "medication"]),
        Event.status.in_(["active", "pending", "rescheduled"]),
    )
    .all()
```

#### Care Path
```python
# Vaccines
vaccines = db.query(VaccineRecord)
    .filter(VaccineRecord.pet_id == pet.id, VaccineRecord.deleted == False)
    .all()

# Parasites
parasite_controls = db.query(ParasiteControlRecord)
    .filter(
        ParasiteControlRecord.pet_id == pet.id,
        ParasiteControlRecord.deleted == False,
        ParasiteControlRecord.reminder_enabled == True,  # ⚠️ EXTRA FILTER
    )
    .all()

# Grooming
groomings = db.query(GroomingRecord)
    .filter(
        GroomingRecord.pet_id == pet.id,
        GroomingRecord.deleted == False,
        GroomingRecord.reminder_enabled == True,  # ⚠️ EXTRA FILTER
    )
    .all()
```

**🚨 KEY DIFFERENCE**:
- **Medication**: No `reminder_enabled` check — uses Event status flags only
- **Care**: Has `reminder_enabled == True` for parasites & grooming BUT NOT for vaccines

**Questions**:
- Is `reminder_enabled` column populated in ParasiteControlRecord?
- Is `reminder_enabled` column populated in GroomingRecord?
- Are these fields being set to `False` inadvertently?

**Audit Impact**: ✅ Logging now tracks these queries.

---

### 3️⃣ TIME MATCHING LOGIC

#### Medication Path — **EXACT MINUTE MATCH**
```python
# For each slot in due_slots_now:
due_dt = datetime(
    year=today.year,
    month=today.month,
    day=today.day,
    hour=hm[0],
    minute=hm[1],
    tzinfo=brt,
) - timedelta(minutes=offset_min)

# EXACT MATCH
if due_dt.hour == now.hour and due_dt.minute == now.minute:
    due_slots_now.append(slot)

if not due_slots_now:
    continue  # No slots match this exact minute
```

**Semantics**: "Fire when current minute matches configured reminder minute"
- Runs every minute (scheduler frequency: 1 min)
- Fires ONLY when exact minute matches
- Per-day dedup prevents duplicates (tag includes date)

#### Care Path — **WINDOW-BASED MATCH**
```python
time_ok = _care_time_reached(now, reminder_time, brt)

def _care_time_reached(now: datetime, reminder_time: str, brt) -> bool:
    """Return True when current time is at or PAST the configured reminder time."""
    hm = _parse_hhmm(reminder_time)
    if not hm:
        return False
    today = now.date()
    configured_dt = datetime(today.year, today.month, today.day, hm[0], hm[1], tzinfo=brt)
    return now >= configured_dt  # ⚠️ WINDOW OPENS at time, stays open until next day
```

**Semantics**: "Fire once per day when time window opens (at configured HH:MM onwards)"
- Runs every minute
- Fires from first tick at HH:MM onwards until end of day
- Per-day dedup (tag includes date) ensures once-per-day
- **BUT**: Windows **never close** once opened!

**🚨 POTENTIAL ISSUE**:
If default reminder_time is null or unparseable → `_parse_hhmm()` returns `None` → `time_ok = False` → **reminder never fires**

---

### 4️⃣ TIME PARSING & DEFAULTS

#### Medication Path
```python
reminder_time = extra.get("reminder_time")
if not reminder_time:
    continue  # SKIP if no reminder_time
# If found, parse and use
```

#### Care Path
```python
reminder_time = _normalize_time(getattr(record, "reminder_time", None), "09:00")

def _normalize_time(value: Optional[str], default_time: str = "09:00") -> str:
    hm = _parse_hhmm(str(value or ""))
    if hm:
        return f"{hm[0]:02d}:{hm[1]:02d}"
    return default_time  # Falls back to "09:00"
```

**Semantics**:
- **Medication**: No default — skips if reminder_time is missing
- **Care**: Has fallback to "09:00" — ensures a time is always set

**Implication**: Even if `reminder_time` is null in DB, care reminders should still fire at 09:00.

---

### 5️⃣ DATE RANGE LOGIC

#### Medication Path
```python
if today < start_date:
    logger.info("medication_skip...")
    audit.add_skip(SkipReason.BEFORE_START_DATE, ...)
    continue

if treatment_complete:
    logger.info("medication_skip...")
    audit.add_skip(SkipReason.TREATMENT_COMPLETE, ...)
    continue
```

#### Care Path
```python
start_date = due - timedelta(days=max(0, alert_days))

# VACCINE & GROOMING: Simple window
if not time_ok or today < start_date or today > due:
    audit.add_skip(SkipReason.TIME_WINDOW_CLOSED|BEFORE_START_DATE|AFTER_DUE_DATE, ...)
    continue

# DEWORMER: Special case (fires on d-2 and due day)
if key == "dewormer":
    trigger_minus_two = due - timedelta(days=2)
    if not time_ok:
        audit.add_skip(SkipReason.TIME_WINDOW_CLOSED, ...)
        continue
    if today not in {trigger_minus_two, due}:
        audit.add_skip(SkipReason.SPECIAL_CASE_LOGIC, ...)
        continue
```

**Key Difference**:
- **Medication**: `start_date` is `event.next_due_date or event.scheduled_at`
- **Care**: `start_date = due - alert_days` (e.g., 3 days before due date)

**Question**: Are vaccine `next_dose_date`, parasite `next_due_date`, and grooming `next_recommended_date` correctly set in the database?

---

### 6️⃣ STATE TRACKING (Deduplication)

#### Medication Path
```python
today_key = today.isoformat()

# Day-level dedup
if today_key in applied_dates or today_key in skipped_dates:
    audit.add_skip(SkipReason.DAY_ALREADY_CLOSED, ...)
    continue

# Slot-level dedup
day_applied_slots = [str(s) for s in (applied_slots.get(today_key) or [])]
day_skipped_slots = [str(s) for s in (skipped_slots.get(today_key) or [])]
if slot in day_applied_slots or slot in day_skipped_slots:
    audit.add_skip(SkipReason.SLOT_ALREADY_CLOSED, ...)
    continue
```

#### Care Path
```python
tag = f"petmol-care-{domain}-{record_id}-{cycle_key}"

if _pendency_exists(db, tag):
    logger.info("care_dedup_skip tag=%s", tag)
    audit.pushes_deduped += 1
    continue
```

**Key Difference**:
- **Medication**: Dedup stored in Event.extra_data (applied_dates, applied_slots, etc.)
- **Care**: Dedup via NotificationPendency table (tag-based)

**Question**: Is `_pendency_exists()` correctly checking the database?

---

### 7️⃣ PUSH SENDING

#### Medication Path
```python
ok = _send_push(sub, payload)
if ok:
    audit.add_sent(user_id=..., pet_id=..., record_id=..., details={"slot": slot})
    logger.info("medication_push_sent...")
if not ok:
    logger.warning("medication_push_expired_subscription...")
    subscriptions.pop(str(event.user_id), None)
    _save_subscriptions(subscriptions)
    break
```

#### Care Path
```python
ok = _send_push(sub, payload)
if not ok:
    subscriptions.pop(str(pet.user_id), None)
    break

audit.add_sent(user_id=..., pet_id=..., record_id=..., details={"domain": deep_link})
logger.info("care_push_sent tag=%s pet_id=%s", payload["tag"], pet.id)
```

**Bug Found**: ⚠️ **Care path has logic inversion!**
- If `ok == True`: Continue normally
- If `ok == False`: Pop subscription and break (good)
- BUT: `audit.add_sent()` is outside the `if ok:` check!

This means care pushes are being counted as sent even if they failed!

---

## 📊 Audit Logging Comparison

Both paths now have comprehensive audit logging that tracks:

| Metric | Medication | Care | Status |
|--------|-----------|------|--------|
| Start/End timing | ✅ Yes | ✅ Yes | ✅ Added |
| User counts | ✅ Yes | ✅ Yes | ✅ Added |
| Record counts | ✅ Yes | ✅ Yes | ✅ Added |
| Skip reasons | ✅ Yes | ✅ Yes | ✅ Added |
| Pushes sent | ✅ Yes | ✅ Yes | ✅ Added |
| Errors | ✅ Yes | ✅ Yes | ✅ Added |
| Elapsed time | ✅ Yes | ✅ Yes | ✅ Added |

---

## 🚨 Found Issues

### Issue #1: Care Path — `audit.add_sent()` Placement ✅
**File**: [notifications/__init__.py](notifications/__init__.py#L927)  
**Severity**: RESOLVED  
**Status**: Code is correct — `audit.add_sent()` is only called after successful push (after `if not ok: break`)

### Issue #2: Parasite & Grooming — `reminder_enabled` Filter
**File**: [notifications/__init__.py](notifications/__init__.py#L810)  
**Severity**: CRITICAL (if field is not populated)  
**Check**: Verify `reminder_enabled` column is populated in ParasiteControlRecord & GroomingRecord

### Issue #3: Care Reminders — No `reminder_enabled` for Vaccines
**File**: [notifications/__init__.py](notifications/__init__.py#L742)  
**Severity**: MEDIUM  
**Check**: Should vaccines also have a `reminder_enabled` check?

### Issue #4: Time Window Logic — Always Stays Open
**File**: [notifications/__init__.py](notifications/__init__.py#L322)  
**Severity**: DESIGN  
**Note**: Window opens at HH:MM and stays open until midnight. This is correct for once-per-day reminders.

### Issue #5: Default Reminder Time — Care Always Has One, Medication Doesn't
**File**: [notifications/__init__.py](notifications/__init__.py#L670)  
**Severity**: LOW (care path handles null better)

---

## ✅ Fixes to Implement (Priority Order)

1. **Fix care path audit.add_sent() placement** — Move inside `if ok:` block
2. **Verify `reminder_enabled` field** — Query DB to check if these fields are populated
3. **Add vaccine `reminder_enabled` check** — For consistency with other care types
4. **Test both paths end-to-end** — Via debug endpoint
5. **Monitor production** — Use audit logs to track success rates

---

## 📝 Next Steps

- Run debug endpoint: `POST /api/notifications/debug/push-audit?reminder_type=all`
- Check server logs for `[PETMOL_PUSH_AUDIT]` entries
- Compare skip reasons between medication and care
- Implement fixes based on findings
