# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Zero Blanket Access**: Every path under `/databases/{database}/documents` defaults to `allow read, write: if false`. No collection permits unauthenticated or cross-user reads/writes.
2. **Verified Identity**: All reads and writes require `request.auth != null`, `request.auth.token.email_verified == true`, and `request.auth.uid == userId` matching the document's `uid` field.
3. **PII Isolation**: User email, displayName, and photoUrl are isolated in `/users/{userId}/private/profile` and never stored on the root `/users/{userId}` document or shared paths.
4. **Master Gate**: Subcollections (`progress/current` and `quizAttempts/{attemptId}`) require the parent `/users/{userId}` root anchor to exist (`exists(...)` on single-doc operations, never inside `allow list`).
5. **Strict Schemas & Size Caps**: All document writes enforce `keys().hasAll(...)` and `keys().hasOnly(...)`, strict field types, array length bounds (`<= 200` / `<= 100` / `<= 50`), string `.size()` caps, and valid `isValidId()` path segments.
6. **Temporal Integrity & Immutability**: `createdAt` and `updatedAt` must equal `request.time` on create; `uid` and `createdAt` are immutable on update and `updatedAt == request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Attack Vector | Target Path | Expected Result |
|---|---------------|-------------|-----------------|
| 1 | Unauthenticated read/write | `/users/userA/progress/current` | `PERMISSION_DENIED` |
| 2 | Unverified email (`email_verified: false`) | `/users/userA/private/profile` | `PERMISSION_DENIED` |
| 3 | Cross-user impersonation (`auth.uid = userB`, `uid = userA`) | `/users/userA/progress/current` | `PERMISSION_DENIED` |
| 4 | PII cross-user read (`auth.uid = userB` reading `userA`) | `/users/userA/private/profile` | `PERMISSION_DENIED` |
| 5 | Shadow / ghost field injection (`isAdmin: true`) | `/users/userA/private/profile` | `PERMISSION_DENIED` |
| 6 | Spoofed `createdAt` timestamp (non-`request.time`) | `/users/userA/progress/current` | `PERMISSION_DENIED` |
| 7 | Mutating immutable `createdAt` or `uid` on update | `/users/userA/progress/current` | `PERMISSION_DENIED` |
| 8 | Oversized ID path poisoning (150-char document ID) | `/users/userA/quizAttempts/<150chars>` | `PERMISSION_DENIED` |
| 9 | Unbounded array DoS (`reviewedServices` size 201) | `/users/userA/progress/current` | `PERMISSION_DENIED` |
| 10 | Invalid enum mode (`mode: 'cheat'`) or impossible score (`scaledScore: 1500`) | `/users/userA/quizAttempts/att_1` | `PERMISSION_DENIED` |
| 11 | Orphaned subcollection write without parent `/users/{userId}` | `/users/userA/quizAttempts/att_1` | `PERMISSION_DENIED` |
| 12 | Cross-user `list` query scraping (`auth.uid = userB`) | `/users/userA/quizAttempts` | `PERMISSION_DENIED` |
