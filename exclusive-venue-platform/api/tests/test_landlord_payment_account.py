"""Unit test for mask_account_number (task F1's non-RLS half). The only
genuinely pure function added for Product 3 — everything else (RLS
cross-tenant denial, the F3 pricing-request reproducibility check, the
invite round-trip) needs a live Postgres/Supabase instance to actually
exercise the policies, which isn't available in this environment; a
mocked table-CRUD test wouldn't catch a real RLS bug and would just give
false confidence, so those stay pending live verification (see tasks.md
F1-F4) rather than being faked here.
"""

from app.schemas.landlord_payment_account import mask_account_number


def test_mask_account_number_shows_last_four():
    account = {"account_number": "1234567890", "bank_name": "HSBC"}
    masked = mask_account_number(account)
    assert masked["account_number"] == "****7890"
    assert masked["bank_name"] == "HSBC"


def test_mask_account_number_leaves_original_dict_untouched():
    account = {"account_number": "1234567890"}
    mask_account_number(account)
    assert account["account_number"] == "1234567890"


def test_mask_account_number_handles_none():
    account = {"account_number": None}
    masked = mask_account_number(account)
    assert masked["account_number"] is None


def test_mask_account_number_handles_short_number():
    # 4 chars or fewer: masking would reveal the whole thing anyway, so
    # the number passes through unmasked rather than becoming "****1234"
    # (which is no more private than the original).
    account = {"account_number": "1234"}
    masked = mask_account_number(account)
    assert masked["account_number"] == "1234"


def test_mask_account_number_handles_missing_key():
    account = {"bank_name": "HSBC"}
    masked = mask_account_number(account)
    assert "account_number" not in masked or masked.get("account_number") is None
