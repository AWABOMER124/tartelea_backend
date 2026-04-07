# قرار الأولوية: الغرف الصوتية أم صفحة المجتمع؟

## القرار المختصر
**الأفضل الآن:** Sprint قصيرة إضافية للغرف الصوتية (Hardening) ثم الانتقال مباشرة لصفحة المجتمع.

## لماذا؟
لأن الغرف الصوتية حاليًا وصلت مرحلة "أساس جيد"، لكن ما زالت تنقصها نقاط تشغيلية مهمة قبل الاعتماد الحقيقي:
1. Moderation actions (mute/kick/promote speaker).
2. Realtime events channel (SSE/WebSocket) لعرض الحالة لحظيًا.
3. Integration tests تلقائية (وليس فقط smoke).
4. قياسات تشغيلية أساسية (failures, concurrency, join/leave consistency).

إذا انتقلنا الآن لصفحة المجتمع بدون هذه النقاط، سنراكم دين تقني في ميزة حساسة realtime.

## خطة تنفيذ عملية (اقتراح)

### خيار موصى به (Recommended)
**مدة:** 5–7 أيام عمل

### المرحلة 1 (الغرف الصوتية - Hardening)
1. إضافة endpoints moderation:
   - invite speaker
   - mute participant
   - kick participant
2. إضافة realtime room events:
   - join/leave
   - role changed
   - room ended
3. إضافة integration tests لمسارات:
   - create/join/leave/token/moderation
4. إضافة metrics logging:
   - room_id
   - user_id
   - action/result

### المرحلة 2 (الانتقال لصفحة المجتمع)
ابدأ مباشرة بعد تحقيق معايير الجاهزية أدناه.

## معايير الجاهزية للانتقال (Exit Criteria)
اعتبر الغرف الصوتية جاهزة للانتقال إلى صفحة المجتمع عندما:
1. ✅ جميع سيناريوهات API الأساسية + moderation تمر آليًا في CI.
2. ✅ لا توجد أخطاء 500 في smoke test كامل.
3. ✅ الـ participants_count يتطابق مع الحالة الفعلية بعد join/leave المتكرر.
4. ✅ role-based token behavior ثابت (listener لا ينشر).
5. ✅ event stream يعمل ويعكس التغييرات اللحظية.

## متى ننتقل فورًا لصفحة المجتمع بدون Sprint إضافية؟
فقط إذا كانت الأولوية التجارية العاجلة أعلى من جودة الصوتيات، وتقبلون بشكل واضح:
- احتمالية regressions أعلى في الغرف،
- زيادة وقت الصيانة لاحقًا،
- تأجيل moderation/realtime hardening.

## التوصية النهائية
**لا ننتقل الآن مباشرة.**  
نفّذ Sprint Hardening واحدة للغرف الصوتية، ثم انطلق إلى صفحة المجتمع بأمان أعلى وسرعة تطوير أفضل.

