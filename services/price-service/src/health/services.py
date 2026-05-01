"""
PETMOL Health Module - Business Logic Services

Pure business logic functions for health features (feeding control).
No database or framework dependencies - keeps logic testable and portable.
"""
from datetime import date, timedelta
from math import floor
from typing import Optional, Tuple


def calculate_food_stock_estimates(
    package_size_kg: Optional[float],
    daily_amount_g: Optional[float],
    last_refill_date: Optional[date],
    safety_buffer_days: int,
    enabled: bool,
    no_consumption_control: bool,
    duration_days: Optional[int] = None,
) -> Tuple[Optional[date], Optional[date], int]:
    """
    Calculate food stock end date and reminder date.
    
    Robust logic:
    1. If enabled=False OR no_consumption_control=True → no calculations (manual mode)
    2. Validate sufficient data (package_size_kg, daily_amount_g, last_refill_date)
    3. Convert package_size_kg to grams
    4. Calculate days food will last = package_size_g / daily_amount_g
    5. estimated_end_date = last_refill_date + food_days
    6. next_reminder_date = estimated_end_date - safety_buffer_days
    
    Args:
        package_size_kg: Size of food package in kg (nullable)
        daily_amount_g: Daily consumption in grams (nullable)
        last_refill_date: Date of last refill (nullable)
        safety_buffer_days: Days before end to alert (0-30)
        enabled: If feeding control is enabled
        no_consumption_control: If user is managing manually
    
    Returns:
        Tuple of (estimated_end_date, next_reminder_date, days_total)
        Returns (None, None, 0) if cannot calculate
    
    Example:
        >>> end, reminder, days = calculate_food_stock_estimates(
        ...     package_size_kg=15.0,
        ...     daily_amount_g=300.0,
        ...     last_refill_date=date(2026, 2, 1),
        ...     safety_buffer_days=3,
        ...     enabled=True,
        ...     no_consumption_control=False
        ... )
        >>> # end ≈ 2026-03-23 (50 days later)
        >>> # reminder ≈ 2026-03-20 (3 days before end)
        >>> # days = 50
    """
    # Rule 1: If control disabled, don't calculate
    if not enabled:
        return None, None, 0

    if duration_days and duration_days > 0 and last_refill_date:
        buffer_days = safety_buffer_days if safety_buffer_days is not None else 3
        estimated_end_date = last_refill_date + timedelta(days=duration_days)
        next_reminder_date = estimated_end_date - timedelta(days=buffer_days)
        if next_reminder_date < last_refill_date:
            next_reminder_date = last_refill_date
        return estimated_end_date, next_reminder_date, duration_days

    # Manual mode without an explicit duration has no stock estimate.
    if no_consumption_control:
        return None, None, 0
    
    # Rule 2: Validate required data
    if (
        not package_size_kg
        or package_size_kg <= 0
        or not daily_amount_g
        or daily_amount_g <= 0
        or not last_refill_date
    ):
        return None, None, 0
    
    try:
        # Rule 3: Convert kg to grams
        total_g = package_size_kg * 1000
        
        # Rule 4: Calculate how many days the food will last (use floor to be conservative)
        days_total = floor(total_g / daily_amount_g)
        
        if days_total <= 0:
            return None, None, 0
        
        # Rule 5: Calculate estimated end date
        estimated_end_date = last_refill_date + timedelta(days=days_total)
        
        # Rule 6: Calculate alert date (safety_buffer_days before end)
        # Respect user value, including 0. If None, use default 3
        buffer_days = safety_buffer_days if safety_buffer_days is not None else 3
        next_reminder_date = estimated_end_date - timedelta(days=buffer_days)
        
        # Ensure reminder_date is not in the past relative to last_refill_date
        if next_reminder_date < last_refill_date:
            next_reminder_date = last_refill_date
        
        return estimated_end_date, next_reminder_date, days_total
        
    except (ValueError, OverflowError, TypeError) as e:
        # In case of error, don't calculate
        print(f"Warning: Could not calculate food dates: {e}")
        return None, None, 0


def is_food_stock_low(
    estimated_end_date: Optional[date],
    next_reminder_date: Optional[date],
    today: date,
) -> bool:
    """
    Determine if food stock is low based on reminder date.
    
    Args:
        estimated_end_date: Calculated end date (can be None)
        next_reminder_date: Calculated reminder date (can be None)
        today: Current date for comparison
    
    Returns:
        True if stock is low (past reminder date), False otherwise
    """
    if not next_reminder_date or not estimated_end_date:
        return False
    
    # Low stock if we're past the reminder date
    return today >= next_reminder_date


def calculate_days_until_out(
    estimated_end_date: Optional[date],
    today: date,
) -> Optional[int]:
    """
    Calculate days remaining until food runs out.
    
    Args:
        estimated_end_date: Calculated end date (can be None)
        today: Current date
    
    Returns:
        Days remaining (can be negative if past end date), or None if no estimate
    """
    if not estimated_end_date:
        return None
    
    delta = (estimated_end_date - today).days
    return delta
