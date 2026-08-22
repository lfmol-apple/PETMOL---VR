from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GtinNormalization:
    value: str | None
    valid: bool
    corrected: bool = False


def normalize_gtin_gs1(value: str | None) -> GtinNormalization:
    """Normalize and validate a GS1 GTIN.

    Accepts GTIN-8/12/13/14 only when the check digit is valid. UPC-11 is
    accepted only if one leading zero turns it into a valid GTIN-12.
    """
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if len(digits) == 11:
        padded = f"0{digits}"
        if _has_valid_check_digit(padded):
            return GtinNormalization(value=padded, valid=True, corrected=True)
        return GtinNormalization(value=None, valid=False)
    if len(digits) in {8, 12, 13, 14} and _has_valid_check_digit(digits):
        return GtinNormalization(value=digits, valid=True)
    return GtinNormalization(value=None, valid=False)


def _has_valid_check_digit(digits: str) -> bool:
    if not digits.isdigit() or len(digits) < 2:
        return False
    body = digits[:-1]
    check_digit = int(digits[-1])
    total = 0
    weight = 3
    for ch in reversed(body):
        total += int(ch) * weight
        weight = 1 if weight == 3 else 3
    expected = (10 - (total % 10)) % 10
    return check_digit == expected
