"""Backend tests for KeyMind AI mock-payment subscription flow.
Covers /api/subscription/plans, /subscribe, /cancel, admin whitelist overlay,
and free-tier limits regression. All against the public preview URL.
"""
import os
import time
import requests
from datetime import datetime, timezone, timedelta
import pytest

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://multilingual-text-2.preview.emergentagent.com"
).rstrip("/")

ADMIN_EMAIL = "himthegreat@gmail.com"
ADMIN_PASSWORD = "aa$fufm2q"

H = {"Content-Type": "application/json"}


# -------- helpers --------
def _post(path, json=None, token=None):
    h = dict(H)
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.post(f"{BASE_URL}{path}", json=json, headers=h, timeout=30)


def _get(path, token=None):
    h = dict(H)
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(f"{BASE_URL}{path}", headers=h, timeout=30)


def _delete(path, token=None):
    h = dict(H)
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.delete(f"{BASE_URL}{path}", headers=h, timeout=30)


def _guest():
    r = _post("/api/auth/guest", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    return body["session_token"], body["user"]


def _admin():
    r = _post("/api/auth/admin", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    body = r.json()
    return body["session_token"], body["user"]


def _me(token):
    r = _get("/api/auth/me", token=token)
    assert r.status_code == 200, r.text
    return r.json()["user"]


def _approx_days_from_now(iso_str, expected_days, tol_seconds=120):
    dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    delta = (dt - datetime.now(timezone.utc)).total_seconds()
    expected = expected_days * 86400
    return abs(delta - expected) <= tol_seconds, delta, expected


# ============================================================
# 1. GET /api/subscription/plans (public)
# ============================================================
class TestPlansEndpoint:
    def test_plans_public_no_auth(self):
        r = _get("/api/subscription/plans")
        assert r.status_code == 200, r.text
        plans = r.json().get("plans") or []
        assert isinstance(plans, list)
        ids = {p["id"]: p for p in plans}
        assert "weekly" in ids and "monthly" in ids, f"plans={ids.keys()}"
        wk = ids["weekly"]
        mo = ids["monthly"]
        assert wk["price_inr"] == 250 and wk["days"] == 7 and wk["currency"] == "INR"
        assert mo["price_inr"] == 800 and mo["days"] == 30 and mo["currency"] == "INR"


# ============================================================
# 2. Fresh guest → weekly subscribe
# ============================================================
class TestSubscribeWeekly:
    def test_weekly_subscribe_full_flow(self):
        token, _ = _guest()
        r = _post("/api/subscription/subscribe", json={"plan": "weekly"}, token=token)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("mock_payment") is True, "subscribe must report mock_payment=true"
        assert body["plan"] == "weekly"
        user = body["user"]
        assert user["is_premium"] is True
        assert user["subscription_plan"] == "weekly"
        assert user["premium_source"] == "subscription"
        ok, actual, expected = _approx_days_from_now(user["subscription_expires_at"], 7)
        assert ok, f"weekly expiry off: actual={actual}s expected≈{expected}s"

        # /auth/me should reflect the same
        me = _me(token)
        assert me["is_premium"] is True
        assert me["premium_source"] == "subscription"
        assert me["subscription_plan"] == "weekly"
        # premium users should have unlimited remaining (null)
        assert me["tool_uses_remaining"] is None

        # 12 ai/tool calls should all succeed (no 429)
        statuses = []
        for i in range(12):
            r2 = _post(
                "/api/ai/tool",
                json={"tool": "grammar", "text": f"hellow worlds {i}", "options": {}},
                token=token,
            )
            statuses.append(r2.status_code)
        assert all(s == 200 for s in statuses), f"premium user got non-200 statuses: {statuses}"


# ============================================================
# 3. Fresh guest → monthly subscribe
# ============================================================
class TestSubscribeMonthly:
    def test_monthly_subscribe(self):
        token, _ = _guest()
        r = _post("/api/subscription/subscribe", json={"plan": "monthly"}, token=token)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["mock_payment"] is True
        user = body["user"]
        assert user["subscription_plan"] == "monthly"
        assert user["premium_source"] == "subscription"
        assert user["tool_uses_remaining"] is None
        ok, actual, expected = _approx_days_from_now(user["subscription_expires_at"], 30)
        assert ok, f"monthly expiry off: actual={actual}s expected≈{expected}s"


# ============================================================
# 4. Stacking weekly twice → 14 days
# ============================================================
class TestStacking:
    def test_weekly_twice_stacks(self):
        token, _ = _guest()
        r1 = _post("/api/subscription/subscribe", json={"plan": "weekly"}, token=token)
        assert r1.status_code == 200
        exp1 = r1.json()["user"]["subscription_expires_at"]

        r2 = _post("/api/subscription/subscribe", json={"plan": "weekly"}, token=token)
        assert r2.status_code == 200
        exp2 = r2.json()["user"]["subscription_expires_at"]

        ok, actual, expected = _approx_days_from_now(exp2, 14, tol_seconds=180)
        assert ok, f"stacked expiry off: actual={actual}s expected≈{expected}s (exp1={exp1}, exp2={exp2})"


# ============================================================
# 5. Cancel subscription
# ============================================================
class TestCancel:
    def test_cancel_clears_subscription_and_reenables_limit(self):
        token, _ = _guest()
        r = _post("/api/subscription/subscribe", json={"plan": "monthly"}, token=token)
        assert r.status_code == 200

        c = _post("/api/subscription/cancel", token=token)
        assert c.status_code == 200, c.text
        u = c.json()["user"]
        assert u["is_premium"] is False
        assert u["subscription_plan"] is None
        assert u["subscription_expires_at"] is None
        assert u["premium_source"] is None
        # Limit re-applies (10/day)
        assert u["tool_uses_limit"] == 10
        assert u["tool_uses_remaining"] == 10


# ============================================================
# 6. Admin precedence: cancel does NOT remove premium for is_admin
# ============================================================
class TestAdminPrecedence:
    def test_admin_cancel_keeps_premium(self):
        token, user = _admin()
        assert user["is_admin"] is True
        assert user["is_premium"] is True
        c = _post("/api/subscription/cancel", token=token)
        assert c.status_code == 200, c.text
        u = c.json()["user"]
        assert u["is_admin"] is True
        assert u["is_premium"] is True, "admin must keep premium after cancel"
        assert u["premium_source"] == "admin"


# ============================================================
# 7. Whitelisted user precedence: subscription as whitelisted user
#    → premium_source still reports "admin"
# ============================================================
class TestWhitelistedSubscribePrecedence:
    def test_whitelisted_user_subscribe_keeps_admin_source(self):
        admin_token, _ = _admin()
        # Create a fresh guest and figure out its email
        gtoken, guser = _guest()
        guest_email = guser["email"]

        # Admin whitelists this guest's email
        wl = _post(
            "/api/admin/whitelist",
            json={"email": guest_email, "is_premium": True},
            token=admin_token,
        )
        assert wl.status_code == 200, wl.text

        # /me should now show admin source
        me1 = _me(gtoken)
        assert me1["is_premium"] is True
        assert me1["premium_source"] == "admin", f"expected admin source, got {me1}"

        # Subscribe — should not break; premium_source remains "admin"
        sub = _post("/api/subscription/subscribe", json={"plan": "weekly"}, token=gtoken)
        assert sub.status_code == 200, sub.text
        u = sub.json()["user"]
        assert u["is_premium"] is True
        assert u["subscription_plan"] == "weekly"
        assert u["premium_source"] == "admin", f"admin precedence broken: {u}"

        # Cleanup whitelist
        d = _delete(f"/api/admin/whitelist/{guest_email}", token=admin_token)
        assert d.status_code == 200


# ============================================================
# 8. Whitelist removal with active sub → keeps is_premium=true
# ============================================================
class TestWhitelistRemovalWithActiveSub:
    def test_remove_whitelist_keeps_premium_when_subscribed(self):
        admin_token, _ = _admin()
        gtoken, guser = _guest()
        email = guser["email"]

        # Whitelist with premium
        wl = _post(
            "/api/admin/whitelist",
            json={"email": email, "is_premium": True},
            token=admin_token,
        )
        assert wl.status_code == 200, wl.text

        # User also subscribes
        s = _post("/api/subscription/subscribe", json={"plan": "monthly"}, token=gtoken)
        assert s.status_code == 200, s.text

        # Admin removes from whitelist
        d = _delete(f"/api/admin/whitelist/{email}", token=admin_token)
        assert d.status_code == 200, d.text

        # User should KEEP is_premium because they have an active paid sub
        me = _me(gtoken)
        assert me["is_premium"] is True, f"premium lost after whitelist removal: {me}"
        assert me["subscription_plan"] == "monthly"
        # premium_source should now be "subscription" (admin grant cleared)
        assert me["premium_source"] == "subscription", f"expected subscription source, got {me}"


# ============================================================
# 9. Invalid plan → 400
# ============================================================
class TestInvalidPlan:
    def test_invalid_plan_returns_400(self):
        token, _ = _guest()
        r = _post("/api/subscription/subscribe", json={"plan": "yearly"}, token=token)
        assert r.status_code == 400, r.text


# ============================================================
# 10. Subscribe without auth → 401
# ============================================================
class TestSubscribeWithoutAuth:
    def test_no_auth_returns_401(self):
        r = _post("/api/subscription/subscribe", json={"plan": "weekly"})
        assert r.status_code == 401, r.text

    def test_cancel_no_auth_returns_401(self):
        r = _post("/api/subscription/cancel")
        assert r.status_code == 401, r.text


# ============================================================
# 11. Regression: 10/day limit still enforced for non-premium
# ============================================================
class TestFreeLimitRegression:
    def test_eleventh_call_returns_429(self):
        token, _ = _guest()
        # 10 successful
        for i in range(10):
            r = _post(
                "/api/ai/tool",
                json={"tool": "grammar", "text": f"hello {i}", "options": {}},
                token=token,
            )
            assert r.status_code == 200, f"call {i} failed: {r.status_code} {r.text[:200]}"
        # 11th should 429
        r11 = _post(
            "/api/ai/tool",
            json={"tool": "grammar", "text": "hello 11", "options": {}},
            token=token,
        )
        assert r11.status_code == 429, r11.text
        detail = r11.json().get("detail", "")
        assert "Daily limit" in detail and "10/day" in detail
