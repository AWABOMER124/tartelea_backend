# التسليم الرسمي - Audio Rooms

## الحالة
جاهز للتسليم المبدئي (Beta Internal) بعد استيفاء النقاط التالية:

1. ✅ مسارات الغرف الأساسية: create / live / join / leave.
2. ✅ إصدار توكن LiveKit مؤمّن بالمصادقة + rate-limit.
3. ✅ role-based publish permissions.
4. ✅ اختبارات أوتوماتيكية للـ validators تعمل عبر `npm test`.

## أوامر التحقق قبل التسليم
1. `npm test`
2. `node --check src/controllers/audioRoom.controller.js`
3. `node --check src/routes/audio-room.routes.js`
4. `node --check src/controllers/livekit.controller.js`
5. `node --check src/services/livekit.service.js`

## ملاحظات ما بعد التسليم (للإصدار التالي)
1. إضافة moderation endpoints (mute/kick/promote).
2. إضافة realtime events stream.
3. إضافة integration tests بمستوى API/DB.

