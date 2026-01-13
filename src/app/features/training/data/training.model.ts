export type CourseVisibility = 'public' | 'tenant';

export interface CourseMaterial {
  title: string;
  url: string;
}

export interface CourseLesson {
  id: string;
  title: string;
  // content can be inlined per lesson or you can keep a single course content
  content?: { format: 'html' | 'text' | 'markdown'; body: string };
  order?: number;
}

export interface Course {
  id: string;
  tenantId?: string | null;              // for tenant courses
  visibility: CourseVisibility;          // 'public' or 'tenant'
  status: 'draft' | 'published' | 'archived';

  title: string;
  description?: string;
  coverUrl?: string;

  category?: string;
  tags?: string[];
  level?: 'beginner' | 'intermediate' | 'advanced';
  durationMinutes?: number;

  // Reader content (simple approach)
  content?: { format: 'html' | 'text' | 'markdown'; body: string };

  // Optional lessons array (if you store it inside course doc)
  lessons?: CourseLesson[];

  // Optional downloads
  materials?: CourseMaterial[];

  createdAt?: any;
  updatedAt?: any;
}

export interface CourseSummary extends Omit<Course, 'content' | 'lessons'> {}

export interface Enrollment {
  id: string; // recommended: `${userId}_${courseId}`
  userId: string;
  tenantId?: string | null;

  courseId: string;
  status: 'active' | 'completed' | 'dropped';

  progressPercent: number; // 0..100
  lastLessonId?: string | null;

  startedAt?: any;
  updatedAt?: any;
  completedAt?: any;
}

export interface LiveSession {
  id: string;
  tenantId?: string | null;
  visibility: CourseVisibility;
  status: 'scheduled' | 'cancelled' | 'completed';

  title: string;
  description?: string;

  courseId?: string;
  startAt: any; // Firestore Timestamp or ISO date
  endAt?: any;

  provider?: 'zoom' | 'google_meet' | 'teams' | 'other';
  joinUrl: string;
  meetingId?: string;
  passcode?: string;

  createdAt?: any;
  updatedAt?: any;
}
