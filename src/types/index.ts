// Core domain types for Kolloquiumsplaner

export type Degree = 'BA' | 'MA';

export type ExamStatus = 'scheduled' | 'cancelled';

export type EmploymentType = 'internal' | 'external' | 'adjunct';

export interface Exam {
  id: string;
  degree: Degree;
  kompetenzfeld: string | null; // Required for BA, null for MA
  studentName: string;
  studentId?: string;
  topic: string;
  examiner1Id: string;
  examiner2Id: string;
  isPublic: boolean;
  notes?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  competenceFields: string[];
  primaryCompetenceField: string | null;
  canExamine: boolean;
  canProtocol: boolean;
  employmentType: EmploymentType;
  availabilityConstraints: AvailabilityConstraint[];
  availabilityRaw?: string; // Original text from Excel
}

export interface AvailabilityConstraint {
  type: 'available' | 'unavailable';
  day?: string; // Day name or 'all'
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
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
