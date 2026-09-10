# HANDOFF SNAPSHOT 005

Date: 2026-09-07

Phiên làm việc: 17:45 -> 17:55 (+07)

---

## Report 5 - Khoi Dong Lai He Thong va Kich Hoat OpenRouter Seedance 2.5 Provider

### User Request

> Ok a dien thong tin xong roi. Hay khoi dong lai he thong tool cho a

### Scope

1. Khoi dong lai server sach se tren cong 20140.
2. Cau hinh GTF_VIDEO_PROVIDER=openrouter va OPENROUTER_API_KEY.
3. Dam bao uu tien GTF_VIDEO_PROVIDER trong byteplus/config.js.
4. Xac minh 120/120 tests pass va API /api/byteplus/settings nhan dung OpenRouterSeedanceProvider.

### Verification & Status

- Provider: openrouter (OpenRouterSeedanceProvider)
- Model: bytedance/seedance-2.5
- Storage: BytePlus TOS (Signed URL enabled)
- Status: Live and ready for manual testing at http://localhost:20140/byteplus

## Update: Fix LIVE_TEST_DISABLED
- Ly do: He thong co khoa an toan credit ALLOW_LIVE_OPENROUTER_TESTS mac dinh la false.
- Khac phuc: Bat ALLOW_LIVE_OPENROUTER_TESTS=true trong .env, cau hinh fallback tu dong tu ALLOW_LIVE_BYTEPLUS_TESTS, va khoi dong lai server.
- Ket qua: 120/120 tests pass, server 20140 da mo khoa goi mang that den OpenRouter.
