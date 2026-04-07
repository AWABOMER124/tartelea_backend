# Codex Prompt — تحسين UI/UX الغرف الصوتية في تطبيق الهاتف

انسخ البرومبت التالي كما هو داخل Codex:

```text
You are a senior Mobile Product Designer + React Native UX Engineer.

Project context:
- Backend already supports audio rooms with these endpoints:
  - GET /api/v1/audio-rooms/live
  - POST /api/v1/audio-rooms
  - POST /api/v1/audio-rooms/:id/join
  - POST /api/v1/audio-rooms/:id/leave
  - POST /api/v1/audio-rooms/:id/token
  - POST /api/v1/livekit/token (legacy fallback)
- Token behavior is role-based:
  - listener => canPublish=false
  - speaker/moderator/host => canPublish=true
- Auth is required for room mutations and token issuance.
- Validation and rate-limits already exist server-side.

Goal:
Design and implement a premium Clubhouse-like mobile UX for Audio Rooms, with strong usability, accessibility, and real-time clarity.

Target stack assumptions:
- React Native (TypeScript)
- LiveKit client SDK
- Existing auth token flow already in app

Required deliverables:
1) Information Architecture
   - Define full user journey:
     Discover rooms -> Enter room -> Join as listener -> Raise hand (UI placeholder) -> Become speaker -> Leave room.
   - Provide navigation map (tabs/screens/modals/bottom sheets).

2) Screens to design + implement
   A) Live Rooms Discovery Screen
      - Room cards: title, host avatars, speaker count, listener count, language/tag.
      - Filters: language/topic/status.
      - Empty/loading/error states.
      - Pull-to-refresh + pagination/infinite scroll.

   B) Create Room Flow
      - Form: room title, optional description, optional topic.
      - Validation UX and clear inline errors.
      - Success transition directly to room screen as host.

   C) Room Screen (Core Experience)
      - Sections:
        1) Host/Moderators strip
        2) Speakers grid
        3) Listeners list
      - Sticky bottom action bar:
        - Listener: “Leave Quietly”, “Raise Hand”, “Share Room”
        - Speaker/Moderator/Host: “Mute/Unmute”, “Leave”, “Invite”
      - Realtime participant count and role badges.
      - Connection quality indicator + reconnection banner.

   D) Role-aware UI states
      - Listener view vs Speaker view vs Moderator/Host controls.
      - Locked mic for listener (disabled with explanatory tooltip).
      - Permission state transitions with subtle animations.

3) UX Quality Requirements
   - Accessibility:
     - Minimum touch targets 44x44
     - Dynamic font support
     - Screen reader labels for all controls
   - Motion:
     - Lightweight transitions (150–250ms)
     - No blocking animations during network actions
   - Feedback:
     - Skeleton loading
     - Toasts/snackbars for join/leave/errors
     - Retry CTA on network failure

4) API Integration Contracts
   - Use the provided endpoints exactly as-is.
   - Implement API client hooks:
     - useLiveRooms()
     - useCreateRoom()
     - useJoinRoom()
     - useLeaveRoom()
     - useRoomToken(roomId)
   - Handle auth errors (401/403) with forced re-auth UX.
   - Handle validation errors (400) with field-level messages.
   - Handle rate-limit (429) with cooldown messaging.

5) State Management + Architecture
   - Propose folder structure:
     - screens/audioRooms/*
     - components/audioRooms/*
     - hooks/audioRooms/*
     - services/audioRooms.api.ts
     - types/audioRooms.ts
   - Keep room-level ephemeral state separate from global auth state.
   - Add optimistic UI for join/leave participant count updates with rollback on failure.

6) Design System alignment
   - Define tokens:
     - colors (surface, elevated, accent, danger)
     - typography scale
     - spacing scale
     - role badge styles (host/mod/speaker/listener)
   - Dark mode first, with light mode parity.

7) Production readiness artifacts
   - Provide:
     - file-by-file implementation plan
     - final component list
     - edge cases checklist
     - QA checklist for mobile testers

Output format (strict):
1. First: UX strategy summary (max 12 bullets).
2. Then: screen-by-screen wireframe description.
3. Then: exact React Native file tree.
4. Then: code snippets for key components/hooks.
5. Then: API integration examples.
6. Finally: QA/UAT checklist and performance budget.
```

