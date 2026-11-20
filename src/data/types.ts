export type NavSection = 'overview' | 'services' | 'practice' | 'quizzes' | 'flashcards';

export type DomainId = 'domain-1' | 'domain-2' | 'domain-3' | 'domain-4';

export interface ExamDomain {
  id: DomainId;
  number: string;
  title: string;
  weight: number;
  summary: string;
  keyTopics: string[];
}

export type ServiceCategory =
  | 'Compute'
  | 'Storage'
  | 'Database'
  | 'Networking'
  | 'Security & IAM'
  | 'Management & Governance'
  | 'Analytics & AI'
  | 'Billing & Support';

export interface AwsService {
  id: string;
  name: string;
  shortName: string;
  category: ServiceCategory;
  domain: DomainId;
  oneLiner: string;
  description: string;
  keyFeatures: string[];
  pricingModel: string;
  examScenarios: string[];
  compareWith?: string;
}

export type ResponsibilityOwner = 'AWS' | 'Customer' | 'Shared';

export interface SharedResponsibilityTask {
  id: string;
  task: string;
  context: string;
  owner: ResponsibilityOwner;
  explanation: string;
}

export interface SupportPlan {
  name: string;
  monthlyCost: string;
  technicalSupport: string;
  sevResponse: string;
  trustedAdvisor: string;
  bestFor: string;
}

export interface PracticeScenario {
  id: string;
  title: string;
  domain: DomainId;
  category: string;
  prompt: string;
  constraints: string[];
  options: {
    id: string;
    label: string;
    rationale: string;
  }[];
  correctOptionId: string;
  architecturalTakeaway: string;
}

export interface QuizQuestion {
  id: string;
  domain: DomainId;
  multiSelect?: boolean;
  isAiGenerated?: boolean;
  question: string;
  options: string[];
  correctIndices: number[];
  explanation: string;
  distractorNotes: string[];
}

export interface Flashcard {
  id: string;
  domain: DomainId;
  category: ServiceCategory | 'Cloud Concepts';
  front: string;
  hint: string;
  back: string;
  examTip: string;
}

export type FlashcardConfidence = 'review' | 'familiar' | 'mastered';

export type SrsGrade = 'again' | 'hard' | 'good' | 'easy';

export interface SrsItemState {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  dueAtIso: string;
  lastReviewedIso: string;
  lastGrade: SrsGrade;
  lapses: number;
  correctCount: number;
  attemptCount: number;
}

export interface QuizAttemptRecord {
  id: string;
  dateIso: string;
  mode: 'drill' | 'practice' | 'mock' | 'srs' | 'blitz';
  domainFilter: DomainId | 'all';
  correctCount: number;
  totalCount: number;
  scaledScore: number;
}

export interface ArcadeStats {
  xp: number;
  bestBlitzScore: number;
  bestSurvivalStreak: number;
  longestCombo: number;
  gamesPlayed: number;
  streakDays: number;
  lastActiveDate: string;
  dailyXp: number;
  dailyDate: string;
  dailyGoalBonusDate?: string;
  dailyXpHistory?: Record<string, number>;
  dailyChallengeDate?: string;
  dailyChallengeScore?: number;
  dailyChallengeCorrect?: number;
  dailyChallengeTotal?: number;
}

export interface StudyProgress {
  reviewedServices: string[];
  completedScenarios: string[];
  perfectScenarios: string[];
  claimedAchievements: string[];
  flashcardConfidence: Record<string, FlashcardConfidence>;
  flashcardSrs: Record<string, SrsItemState>;
  quizSrs: Record<string, SrsItemState>;
  quizHistory: QuizAttemptRecord[];
  arcade: ArcadeStats;
}
