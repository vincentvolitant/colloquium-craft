// Core domain types for Kolloquiumsplaner

export type Degree = 'BA' | 'MA';

export type ExamStatus = 'scheduled' | 'cancelled';

export type EmploymentType = 'internal' | 'external' | 'adjunct';

export interface Exam {
  id: string;
  degree: Degree;
  kompetenzfeld: string | null; // Required for BA, null for MA
  studentName: string;
  studentFirstName?: string; // Optional separate first name
  studentLastName?: string; // Optional separate last name
  studentId?: string;
  topic: string;
  examiner1Id: string;
  examiner2Id: string;
  isPublic: boolean;
  notes?: string;
  
  // Team thesis support
  isTeam?: boolean; // True if this is a merged team colloquium
  studentNames?: string[]; // Array of 1-2 student names for team theses
  examinerIds?: string[]; // Array of 1-4 examiner IDs for team theses
  sourceExamIds?: string[]; // Original exam IDs that were merged
  durationMinutes?: number; // Override duration: BA=100min, MA=150min for teams
}

// Helper to get full student name from Exam
export function getStudentDisplayName(exam: Exam): string {
  if (exam.studentFirstName || exam.studentLastName) {
    return [exam.studentFirstName, exam.studentLastName].filter(Boolean).join(' ');
  }
  return exam.studentName;
}

// Time window for availability
export interface TimeWindow {
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

// UI-defined availability constraint
export interface AvailabilityOverride {
  id: string;
  // Day constraint - if set, staff is ONLY available on these days
  availableDays?: string[]; // Array of YYYY-MM-DD or day indices like "1", "2", "3"
  // Time windows per day - if set, staff is ONLY available during these windows
  timeWindows?: Record<string, TimeWindow[]>; // day (YYYY-MM-DD) -> time windows
  // Unavailable blocks - specific date+time ranges when NOT available
  unavailableBlocks?: Array<{
    date: string; // YYYY-MM-DD
    startTime: string; // HH:mm
    endTime: string; // HH:mm
  }>;
  // Notes for admin
  notes?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  competenceFields: string[];
  primaryCompetenceField: string | null;
  secondaryCompetenceFields?: string[];
  canExamine: boolean;
  canProtocol: boolean; // Combined: must be internal AND canDoProtocol===true
  canDoProtocol: boolean; // Manual admin override - defaults to true for internal, false for external/adjunct
  employmentType: EmploymentType;
  // UI-defined availability (replaces old availabilityConstraints)
  availabilityOverride?: AvailabilityOverride;
  // Admin notes
  notes?: string;
}

// Legacy type - kept for compatibility during migration
export interface AvailabilityConstraint {
  type: 'available' | 'unavailable';
  day?: string;
  startTime?: string;
  endTime?: string;
}

export interface Room {
  id: string;
  name: string;
}

export interface RoomMapping {
  id: string;
  degreeScope: Degree;
  kompetenzfeld: string;
  rooms: string[]; // Room IDs in priority order
}

export interface ScheduleVersion {
  id: string;
  createdAt: Date;
  status: 'draft' | 'published';
  notes?: string;
}

export interface ScheduledEvent {
  id: string;
  scheduleVersionId: string;
  examId: string;
  dayDate: string; // YYYY-MM-DD
  room: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  protocolistId: string;
  status: ExamStatus;
  cancelledReason?: string;
  cancelledAt?: string; // ISO timestamp
  
  // Team thesis support
  isTeam?: boolean; // Mirror from exam for quick access
  durationMinutes?: number; // Actual duration (doubled for teams)
}

export interface ScheduleConfig {
  days: string[]; // Array of YYYY-MM-DD
  rooms: Room[];
  startTime: string; // HH:mm default 09:00
  endTime: string; // HH:mm default 18:00
  baSlotMinutes: number; // default 50
  maSlotMinutes: number; // default 75
}

export interface ConflictReport {
  type: 'availability' | 'room' | 'break' | 'constraint';
  severity: 'error' | 'warning';
  message: string;
  affectedExamId?: string;
  affectedStaffId?: string;
  affectedStaffName?: string;
  suggestion?: string;
}

// Excel mapping types
export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
}

export interface ImportSession {
  id: string;
  fileName: string;
  sheetName: string;
  mappings: ColumnMapping[];
  previewData: Record<string, unknown>[];
  defaultDegree?: Degree;
}

// Display helpers
export const KOMPETENZFELD_MASTER_LABEL = 'Master';

export const SLOT_DURATIONS: Record<Degree, number> = {
  BA: 50,
  MA: 75,
};

// Helper to get exam duration considering team status
export function getExamDuration(exam: Exam): number {
  if (exam.durationMinutes) return exam.durationMinutes;
  const baseDuration = SLOT_DURATIONS[exam.degree];
  return exam.isTeam ? baseDuration * 2 : baseDuration;
}

// Helper to get all examiner IDs from an exam (including team examiners)
export function getAllExaminerIds(exam: Exam): string[] {
  if (exam.isTeam && exam.examinerIds && exam.examinerIds.length > 0) {
    return exam.examinerIds;
  }
  return [exam.examiner1Id, exam.examiner2Id].filter(Boolean);
}

// Helper to get display names for team exams
export function getExamDisplayNames(exam: Exam): string[] {
  if (exam.isTeam && exam.studentNames && exam.studentNames.length > 0) {
    return exam.studentNames;
  }
  return [exam.studentName];
}

// Employment type labels (German)
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  internal: 'Intern',
  external: 'Extern',
  adjunct: 'Lehrbeauftragt',
};

// Helper to check if staff can be assigned as protocolist
// Rule: must be internal AND have canDoProtocol === true
export function canBeProtocolist(staff: StaffMember): boolean {
  // External and adjunct can NEVER do protocol (hard rule)
  if (staff.employmentType !== 'internal') return false;
  // Internal staff can be excluded via manual toggle
  return staff.canDoProtocol !== false;
}
