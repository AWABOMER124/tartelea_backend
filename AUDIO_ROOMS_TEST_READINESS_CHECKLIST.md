# الخطوة التالية: تجهيز الغرف الصوتية للاختبار الفعلي (UAT Readiness)

## الهدف
تحويل ميزة الغرف الصوتية من "موجودة ككود" إلى "جاهزة لاختبار فعلي مستقر" مع سيناريوهات واضحة ومعايير قبول.

---

## 1) مرحلة التثبيت (Setup)

### 1.1 توحيد الـ Schema قبل أي اختبار
> مهم جدًا: يوجد ملفا schema في المشروع، ويجب اختيار مصدر واحد للتشغيل في بيئة الاختبار.

- اعتمد `src/db/schema.sql` كمرجع اختبار محلي.
- تأكد أن الجداول موجودة:
  - `users`, `user_roles`, `profiles`
  - `audio_rooms`, `audio_room_participants`

### 1.2 ضبط المتغيرات البيئية
- تأكد من وجود القيم التالية:
  - `JWT_SECRET`
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`
  - (`DATABASE_URL` أو `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`)
  - `ALLOWED_ORIGINS` إذا كان في frontend فعلي.

### 1.3 تشغيل الخدمة
- شغّل التطبيق وتأكد من `/api/v1/health`.

---

## 2) مرحلة Data Seed للاختبار

أنشئ 3 مستخدمين (أو عبر signup/login):
1. host_user
2. speaker_user
3. listener_user

وأضف JWT صالح لكل مستخدم لاستخدامه في السيناريوهات.

---

## 3) سيناريوهات الاختبار الأساسية (API E2E)

## 3.1 إنشاء غرفة
- `POST /api/v1/audio-rooms`
- body:
```json
{
  "title": "Sudan Community Talk",
  "description": "Weekly live room"
}
```
- المتوقع:
  - `201`
  - room.status = `live`
  - room.participants_count = `1`

## 3.2 جلب الغرف الحية
- `GET /api/v1/audio-rooms/live`
- المتوقع:
  - `200`
  - القائمة تحتوي الغرفة المنشأة.

## 3.3 انضمام مستمع
- `POST /api/v1/audio-rooms/:id/join`
- body:
```json
{
  "role": "listener"
}
```
- المتوقع:
  - `200`
  - `participants_count` يزيد.

## 3.4 إصدار توكن LiveKit حسب الدور
- `POST /api/v1/livekit/token`
- body:
```json
{
  "roomName": "room-slug-or-id",
  "role": "listener"
}
```
- المتوقع:
  - `200`
  - التوكن ينشأ بـ `canPublish=false` للمستمع.

اختبر أيضًا:
- role=`speaker` => `canPublish=true`
- role=`moderator` => `canPublish=true`

## 3.5 اختبار الأمان
- بدون Authorization على:
  - `POST /api/v1/livekit/token`
  - `POST /api/v1/audio-rooms`
  - `POST /api/v1/audio-rooms/:id/join`
- المتوقع:
  - `401/403` (رفض صحيح).

## 3.6 اختبار Validation
- أرسل payload ناقص أو role غير مدعوم.
- المتوقع:
  - `400` ورسالة validate واضحة.

---

## 4) معايير قبول (Definition of Done for UAT)

تعتبر الميزة جاهزة لاختبار فعلي إذا تحققت النقاط التالية:

1. ✅ كل سيناريوهات القسم (3) تعمل دون أخطاء server 500.
2. ✅ auth gating يعمل على endpoints الحساسة.
3. ✅ role-based token behavior صحيح (listener لا ينشر).
4. ✅ participants_count يتحدث بدقة عند join.
5. ✅ لا يوجد drift في schema داخل بيئة الاختبار.
6. ✅ logs كافية لتشخيص الأعطال (room_id / user_id / endpoint).

---

## 5) المخاطر المتبقية قبل إنتاجية كاملة

هذه الميزة ما زالت تحتاج قبل production:
1. leave-room endpoint وتحديث count عند المغادرة.
2. moderation actions (mute/kick/promote).
3. realtime events (WebSocket/SSE) لتزامن الحالة لحظيًا.
4. اختبارات تكامل أوتوماتيكية في CI (ليس فقط اختبار يدوي).
5. monitoring metrics (concurrency, drop rate, token issuance failures).

---

## 6) التوصية العملية للخطوة التالية مباشرة

**نفّذ Sprint قصيرة بعنوان: _Audio Rooms UAT Hardening_** وتشمل:
1. `POST /audio-rooms/:id/leave`
2. `POST /audio-rooms/:id/token` (بديل أوضح مرتبط بالغرفة)
3. Integration tests (supertest) لسيناريو create/join/token/auth-fail/validation-fail
4. Seed script بسيط لمستخدمين تجريبيين
5. Postman collection رسمية للفريق

