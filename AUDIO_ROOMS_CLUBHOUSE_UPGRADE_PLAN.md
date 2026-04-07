# فحص نظام الغرف الصوتية + تحسينات احترافية (Clubhouse-Level)

## 1) الوضع الحالي (Current State)

### الموجود فعليًا
- Endpoint وحيد للـ LiveKit:
  - `POST /api/v1/livekit/token` لإصدار توكن دخول الغرفة.
- Controller بسيط يتحقق فقط من `roomName` و`participantName`.
- Service يصدر JWT grant مع صلاحيات publish/subscribe كاملة.

### المفقود وظيفيًا مقارنة بتجربة Clubhouse
1. **لا يوجد Room lifecycle backend**
   - لا يوجد إنشاء/جدولة/بدء/إنهاء غرفة عبر API.
2. **لا يوجد إدارة أدوار داخل الغرفة**
   - Speaker / Listener / Moderator غير ممثلة.
3. **لا يوجد stage queue (رفع اليد)**
   - لا توجد آلية طلب صعود للمسرح وقبول/رفض.
4. **لا يوجد اكتشاف غرف (Discovery)**
   - لا endpoint لقائمة الغرف الحية/الترند/التصنيفات.
5. **لا يوجد سياسات أمان صلاحيات دقيقة**
   - token endpoint غير محمي بمصادقة.
   - جميع المستخدمين يحصلون على `canPublish=true`.
6. **لا يوجد Presence/Analytics**
   - لا tracking لعدد الحضور الفعلي، مدة الاستماع، retention.
7. **لا يوجد تسجيل أحداث Moderation**
   - mute/kick/ban/report غير مدعوم.
8. **لا يوجد تحسينات UX مهمة**
   - لا reconnection strategy واضحة.
   - لا optimistic updates + graceful degradation.

## 2) ثغرات تقنية يجب إصلاحها فورًا
1. حماية endpoint إصدار التوكن بالمصادقة (`authenticateUser`).
2. إصدار صلاحيات التوكن حسب الدور:
   - Listener: `canPublish=false`
   - Speaker/Moderator: `canPublish=true`
3. منع client من تسمية participant identity بحرية (اعتمد `req.user.id`).
4. إضافة rate-limit خاص بـ `/livekit/token`.
5. اعتماد room metadata موحد (title/category/language/isRecorded/...).

## 3) تصميم احترافي مقترح (Target Architecture)

### 3.1 Data Model (حد أدنى)
- `audio_rooms`
  - `id, slug, title, topic, language, status(scheduled|live|ended), host_id, started_at, ended_at, visibility(public|private|club)`
- `audio_room_participants`
  - `room_id, user_id, role(listener|speaker|moderator|host), joined_at, left_at, is_muted, hand_raised`
- `audio_room_events`
  - `room_id, actor_id, event_type(join|leave|raise_hand|invite_speaker|mute|kick|end_room), payload, created_at`
- `audio_room_invites`
  - دعوات متحدث/مشرف.

### 3.2 API سطحية (REST)
- `POST /audio-rooms` إنشاء غرفة.
- `GET /audio-rooms/live` اكتشاف مباشر.
- `GET /audio-rooms/:id` تفاصيل.
- `POST /audio-rooms/:id/join` انضمام.
- `POST /audio-rooms/:id/raise-hand`
- `POST /audio-rooms/:id/moderation/invite-speaker`
- `POST /audio-rooms/:id/moderation/mute`
- `POST /audio-rooms/:id/moderation/kick`
- `POST /audio-rooms/:id/end`
- `POST /audio-rooms/:id/token` إصدار توكن scoped بالدور.

### 3.3 Real-time Layer
- WebSocket/SSE channel للأحداث:
  - participant joined/left
  - hand raised
  - role changed
  - room ended

### 3.4 جودة وتجربة مستخدم (UX)
- شاشة room card مثل Clubhouse:
  - Host avatars + speaker strip + listener count live.
- Queue panel لطلبات الصعود.
- Moderator controls واضحة وسريعة.
- reconnect/resume خلال 5-10 ثواني دون فقد state.

## 4) Roadmap تنفيذ (4 مراحل)

### المرحلة A (3-5 أيام) — Foundation
- حماية التوكن + RBAC + rate-limit + role-based grants.
- بناء `audio_rooms` + `audio_room_participants`.

### المرحلة B (5-7 أيام) — Core Clubhouse UX
- raise hand + speaker invites + moderation endpoints.
- realtime events pipeline + cache active rooms.

### المرحلة C (4-6 أيام) — Discovery & Growth
- discover feed (trending/new/following).
- tags/interests/language filters.
- scheduled rooms + reminders.

### المرحلة D (مستمر) — Pro Reliability
- metrics + dashboards + alerting.
- A/B لتحسين retention.
- abuse prevention + trust & safety workflows.

## 5) برومبت جاهز لأداة Codex لتحسين التصميم والتنفيذ

انسخ هذا البرومبت كما هو:

```text
You are a senior full-stack architect and product engineer.
Project: Node.js/Express backend with LiveKit integration (Tartelea backend).

Goal:
Upgrade audio rooms to a Clubhouse-grade experience, focusing on:
1) role-based live audio permissions
2) moderation controls
3) real-time room state/events
4) production-grade UX/API contracts
5) secure token issuance

Constraints:
- Keep current stack (Express + PostgreSQL + LiveKit).
- Do not introduce breaking changes to existing auth routes.
- Add new endpoints under /api/v1/audio-rooms and keep /api/v1/livekit/token backward-compatible (deprecated path).
- Use clean architecture: routes -> controllers -> services -> models -> db.
- Add Zod validators for all new endpoints.
- Enforce auth on all room mutations.

Deliverables:
1) Database migrations for:
   - audio_rooms
   - audio_room_participants
   - audio_room_events
   - audio_room_invites
2) Backend implementation:
   - create/join/leave/end room
   - raise hand
   - invite/promote/demote speaker
   - mute/kick participant
   - list live rooms with filters (topic/language/trending)
3) Token strategy:
   - Listener => canPublish=false
   - Speaker/Moderator/Host => canPublish=true
   - identity must be req.user.id (not client-supplied)
4) Real-time events channel (SSE or WebSocket) for room updates.
5) Observability:
   - structured logs per room_id/user_id
   - counters: concurrent listeners, avg session duration, drop-off
6) Tests:
   - integration tests for room lifecycle and moderation
   - validator tests for bad payloads
7) Documentation:
   - API contract examples
   - role matrix (host/mod/speaker/listener)
   - rollout plan + migration safety notes

Output format:
- First: high-level implementation plan.
- Then: exact file-by-file patch proposal.
- Then: code changes.
- Finally: test commands and expected outputs.
```

