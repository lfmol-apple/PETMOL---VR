# 🎯 PETMOL Push Notification — Blocker Fixes Action Plan

## 📌 Situation

**Status**: 🚨 **BLOCKED** — Care reminders (vaccines, parasites, grooming) don't fire while medication reminders work perfectly.

**Root Cause**: Not yet determined — requires testing with the new audit logging framework.

**Timeline**: Blocking release until fixed.

---

## 🔬 Diagnosis Phase (Already Done ✅)

### Deliverables
1. ✅ **PUSH_NOTIFICATION_AUDIT_TABLE.md** — Map of all jobs, status, and blockers
2. ✅ **PUSH_NOTIFICATION_COMPARISON.md** — Side-by-side working vs broken analysis
3. ✅ **audit_logging.py** — Comprehensive logging framework
4. ✅ **[PETMOL_PUSH_AUDIT] Logs** — In both send_medication_pushes() and send_care_pushes()
5. ✅ **Debug Endpoint** — POST /api/notifications/debug/push-audit

### Key Findings
- **Time matching logic differs**: Medication uses exact minute match, care uses window-based
- **Query filters differ**: Care has `reminder_enabled == True` for parasites & grooming but not vaccines
- **Default reminder times differ**: Care has "09:00" fallback, medication skips if missing
- **All code paths have audit logs** — Ready for diagnostics

---

## 🛠️ Fix Phase (Next)

### Step 1: Run Audit via Debug Endpoint

**Command**:
```bash
curl -X POST \
  "http://localhost:8000/api/notifications/debug/push-audit?reminder_type=all" \
  -H "Authorization: Bearer <token>"
```

**What to Look For**:
- Check server logs for `[PETMOL_PUSH_AUDIT]` entries
- Compare skip reasons across reminder types
- Look for patterns: all failing same reason? Or different reasons per type?

**Expected Output Structure**:
```json
{
  "status": "ok",
  "user_id": "...",
  "reminder_type": "all",
  "executed": {
    "medication": "executed",
    "care": "executed",
    "food": "executed"
  }
}
```

**Server Log Expectations** (grep for `[PETMOL_PUSH_AUDIT]`):
```
[PETMOL_PUSH_AUDIT] START medication job
[PETMOL_PUSH_AUDIT] SUMMARY: {...skip reasons...}
[PETMOL_PUSH_AUDIT] START vaccine job
[PETMOL_PUSH_AUDIT] SUMMARY: {...skip reasons...}
```

---

### Step 2: Analyze Results

**Scenario A**: All care reminders skip with `TIME_WINDOW_CLOSED`
- **Likely Cause**: reminder_time parsing fails → null/invalid → _care_time_reached returns False
- **Fix**: Verify reminder_time is populated in DB, check _parse_hhmm() logic

**Scenario B**: All care reminders skip with `BEFORE_START_DATE` or `AFTER_DUE_DATE`
- **Likely Cause**: due dates not set correctly in DB
- **Fix**: Query DB to verify next_dose_date, next_due_date, next_recommended_date are populated

**Scenario C**: Only parasite/grooming skip, vaccines work
- **Likely Cause**: reminder_enabled filter is False for parasites/grooming
- **Fix**: Update DB to set reminder_enabled=True for all records, OR remove this filter

**Scenario D**: Mixed skip reasons
- **Likely Cause**: Multiple issues, needs per-type investigation
- **Fix**: Focus on highest-skip-count reason first

---

### Step 3: Database Verification Queries

**Check if reminder_enabled is populated**:
```sql
-- Parasites
SELECT COUNT(*), reminder_enabled FROM pet_parasite_control_record 
GROUP BY reminder_enabled;

-- Grooming
SELECT COUNT(*), reminder_enabled FROM pet_grooming_record 
GROUP BY reminder_enabled;
```

**Check if due dates are populated**:
```sql
-- Vaccines
SELECT COUNT(*) FROM pet_vaccine_record 
WHERE next_dose_date IS NOT NULL;

-- Parasites
SELECT COUNT(*) FROM pet_parasite_control_record 
WHERE next_due_date IS NOT NULL OR collar_expiry_date IS NOT NULL;

-- Grooming
SELECT COUNT(*) FROM pet_grooming_record 
WHERE next_recommended_date IS NOT NULL;
```

**Check reminder_time field**:
```sql
SELECT reminder_time, COUNT(*) FROM pet_vaccine_record 
GROUP BY reminder_time;
```

---

### Step 4: Common Fixes (Priority Order)

#### Fix #1: Ensure reminder_time Always Parses
**If issue**: All care reminders skip with TIME_WINDOW_CLOSED

**Action**: In _normalize_time(), add safety check
```python
def _normalize_time(value: Optional[str], default_time: str = "09:00") -> str:
    hm = _parse_hhmm(str(value or ""))
    if hm:
        return f"{hm[0]:02d}:{hm[1]:02d}"
    return default_time
```

**Status**: Already implemented ✅

---

#### Fix #2: Populate reminder_enabled for Parasites & Grooming
**If issue**: Parasite/grooming reminders skip with NO_ELIGIBLE_RECORDS

**Action A** (If field exists but unset):
```sql
-- Set all parasites to enabled
UPDATE pet_parasite_control_record 
SET reminder_enabled = True 
WHERE reminder_enabled IS NULL OR reminder_enabled = False;

-- Set all grooming to enabled
UPDATE pet_grooming_record 
SET reminder_enabled = True 
WHERE reminder_enabled IS NULL OR reminder_enabled = False;
```

**Action B** (If field doesn't exist): Remove the filter from code
```python
# REMOVE:
ParasiteControlRecord.reminder_enabled == True

# CHANGE TO:
# (no additional filter for reminder_enabled)
```

---

#### Fix #3: Add reminder_enabled Check to Vaccines
**If issue**: Vaccines fire but parasites/grooming don't (inconsistency)

**Action**: For consistency, add check to vaccines
```python
vaccines = db.query(VaccineRecord).filter(
    VaccineRecord.pet_id == pet.id,
    VaccineRecord.deleted == False,
    # VaccineRecord.reminder_enabled == True,  # If this field exists
).all()
```

---

#### Fix #4: Verify Due Dates Are Set
**If issue**: Reminders skip with BEFORE_START_DATE or NO_DUE_DATE

**Action**: Create migration to backfill missing due dates
```python
# For records with missing due dates, set to today + alert_days
for record in get_records_with_null_due_dates():
    if not record.next_due_date:
        record.next_due_date = datetime.now() + timedelta(days=7)
    db.commit()
```

---

#### Fix #5: Verify Collar Expiry Date Fallback
**If issue**: Collar reminders skip but other parasites work

**Action**: In care path, check collar logic
```python
due_date = control.next_due_date or (
    control.collar_expiry_date if (control.type or "").lower().strip() == "collar" else None
)
```

**Verify**: collar_expiry_date field exists and is populated

---

### Step 5: Test Individual Reminder Types

After each fix, run:
```bash
curl -X POST \
  "http://localhost:8000/api/notifications/debug/push-audit?reminder_type=care" \
  -H "Authorization: Bearer <token>"
```

Watch for:
- `[PETMOL_PUSH_AUDIT]` entries in logs
- `pushes_sent` counter increasing
- No skip reasons (or expected skip reasons only)

---

## 📋 Tracking

### Phase: Diagnosis ✅ DONE
- [x] Create audit tables and docs
- [x] Implement audit logging framework
- [x] Add debug endpoint
- [x] Analyze working vs broken paths
- [x] Commit to git

### Phase: Testing (NEXT)
- [ ] Run debug endpoint with live data
- [ ] Analyze [PETMOL_PUSH_AUDIT] logs
- [ ] Identify root cause per reminder type
- [ ] Create fix PR

### Phase: Fixes (AFTER TESTING)
- [ ] Implement database fixes if needed
- [ ] Update code filters if needed
- [ ] Verify all reminder types work
- [ ] Monitor production for 24+ hours
- [ ] Close blocker

---

## 🚀 Success Criteria

✅ When blocking this checklist, we're done:
- [ ] `send_medication_pushes()` still works (baseline)
- [ ] `send_care_pushes()` fires for vaccines
- [ ] `send_care_pushes()` fires for parasites (all types)
- [ ] `send_care_pushes()` fires for grooming
- [ ] `send_food_reminder_pushes()` fires at 11:00 BRT
- [ ] [PETMOL_PUSH_AUDIT] logs show 0 errors, positive push counts
- [ ] Tested on staging with real user data
- [ ] Deployed to production
- [ ] Monitored for 48+ hours without issues

---

## 📞 Support

If stuck, check:
1. Are [PETMOL_PUSH_AUDIT] logs appearing?
2. Is audit.log_summary() being called at end of each job?
3. Are push subscriptions loaded correctly?
4. Is DB connection working?

Next: Run debug endpoint and report findings.
