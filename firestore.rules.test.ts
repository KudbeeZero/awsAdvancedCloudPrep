/**
 * Payload-First Security TDD Spec for CloudPrep CLF-C02 Firestore Rules.
 * Verifies the "Dirty Dozen" adversarial payloads against the declared invariants
 * and blueprint boundaries defined in firebase-blueprint.json.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  authUid: string | null;
  emailVerified: boolean;
  parentExists?: boolean;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
  enforcedByRule: string;
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated progress access',
    path: '/users/userA/progress/current',
    operation: 'get',
    authUid: null,
    emailVerified: false,
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'isSignedIn() / isOwner(userId)',
  },
  {
    id: 2,
    name: 'Unverified email spoofing write to PII profile',
    path: '/users/userA/private/profile',
    operation: 'create',
    authUid: 'userA',
    emailVerified: false,
    payload: {
      uid: 'userA',
      email: 'spoof@example.com',
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'request.auth.token.email_verified == true',
  },
  {
    id: 3,
    name: 'Cross-user progress overwrite',
    path: '/users/userA/progress/current',
    operation: 'update',
    authUid: 'userB',
    emailVerified: true,
    payload: {
      uid: 'userA',
      updatedAt: 'REQUEST_TIME',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'isOwner(userId)',
  },
  {
    id: 4,
    name: 'Cross-user PII profile read',
    path: '/users/userA/private/profile',
    operation: 'get',
    authUid: 'userB',
    emailVerified: true,
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'PII split collection isOwner(userId)',
  },
  {
    id: 5,
    name: 'Shadow ghost field injection (isAdmin: true)',
    path: '/users/userA/private/profile',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      uid: 'userA',
      email: 'user@example.com',
      isAdmin: true,
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: "data.keys().hasOnly(['uid', 'email', 'displayName', 'photoUrl', 'createdAt', 'updatedAt'])",
  },
  {
    id: 6,
    name: 'Client-forged createdAt timestamp',
    path: '/users/userA/progress/current',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      uid: 'userA',
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: 'REQUEST_TIME',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'incoming().createdAt == request.time',
  },
  {
    id: 7,
    name: 'Mutating immutable uid or createdAt on update',
    path: '/users/userA/progress/current',
    operation: 'update',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      uid: 'userB',
      updatedAt: 'REQUEST_TIME',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'affectedKeys().hasOnly([...]) && incoming().uid == existing().uid',
  },
  {
    id: 8,
    name: 'Oversized path variable ID poisoning (>128 chars)',
    path: `/users/userA/quizAttempts/${'a'.repeat(150)}`,
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidId(attemptId)',
  },
  {
    id: 9,
    name: 'Unbounded array denial-of-wallet (>200 items)',
    path: '/users/userA/progress/current',
    operation: 'update',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      reviewedServices: Array.from({ length: 201 }, (_, idx) => `svc-${idx}`),
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'data.reviewedServices.size() <= 200',
  },
  {
    id: 10,
    name: 'Invalid quiz attempt scaledScore (>1000) or mode enum',
    path: '/users/userA/quizAttempts/attempt_1',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      uid: 'userA',
      mode: 'cheat',
      domainFilter: 'all',
      correctCount: 99,
      totalCount: 10,
      scaledScore: 1500,
      dateIso: '2026-11-19T19:00:00Z',
      createdAt: 'REQUEST_TIME',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidQuizAttempt(incoming(), userId)',
  },
  {
    id: 11,
    name: 'Orphaned quizAttempt without parent /users/{userId}',
    path: '/users/userA/quizAttempts/attempt_1',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    parentExists: false,
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'exists(/databases/$(database)/documents/users/$(userId))',
  },
  {
    id: 12,
    name: 'Cross-user quizAttempts list query scraping',
    path: '/users/userA/quizAttempts',
    operation: 'list',
    authUid: 'userB',
    emailVerified: true,
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'isOwner(userId) && existing().uid == request.auth.uid',
  },
  {
    id: 13,
    name: 'Cross-user or oversized Study Coach session overwrite',
    path: '/users/userA/coach/current',
    operation: 'create',
    authUid: 'userB',
    emailVerified: true,
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'isOwner(userId) && isValidCoachSession(incoming(), userId)',
  },
  {
    id: 14,
    name: 'Unsafe javascript: URL injection in serviceAudio',
    path: '/users/userA/serviceAudio/ec2',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      uid: 'userA',
      serviceId: 'ec2',
      audioUrl: 'javascript:alert(1)',
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidServiceAudio(incoming(), userId, serviceId)',
  },
];
