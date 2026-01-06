import type { 
  Exam, 
  StaffMember, 
  RoomMapping, 
  ScheduledEvent, 
  ScheduleConfig,
  ConflictReport,
  Degree 
} from '@/types';
import { SLOT_DURATIONS, canBeProtocolist, getExamDuration, getAllExaminerIds } from '@/types';

interface TimeSlot {
  startTime: string;
  endTime: string;
  room: string;
  day: string;
}

interface StaffAssignment {
  staffId: string;
  examIds: string[];
  protocolIds: string[];
  dayAssignments: Map<string, string[]>; // day -> exam/protocol ids
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function addMinutes(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

// Helper to check for "Integratives Design" or "Integriertes Design"
function isIntegrativesDesign(kompetenzfeld: string | null | undefined): boolean {
  if (!kompetenzfeld) return false;
  const lower = kompetenzfeld.toLowerCase();
  return lower.includes('integratives design') || lower.includes('integriertes design');
}

function generateTimeSlots(
  config: ScheduleConfig,
  degree: Degree
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const duration = SLOT_DURATIONS[degree];
  const startMinutes = timeToMinutes(config.startTime);
  const endMinutes = timeToMinutes(config.endTime);
  
  for (const day of config.days) {
    for (const room of config.rooms) {
      let currentTime = startMinutes;
      while (currentTime + duration <= endMinutes) {
        slots.push({
          startTime: minutesToTime(currentTime),
          endTime: minutesToTime(currentTime + duration),
          room: room.name,
          day,
        });
        currentTime += duration;
      }
    }
  }
  
  return slots;
}

/**
 * Check if staff is available at a specific day and time slot
 * Uses the new UI-based availability system:
 * - Default: everyone is available 09:00-18:00 on all planning days
 * - Overrides from availabilityOverride take precedence
 */
function isStaffAvailable(
  staff: StaffMember,
  day: string,
  startTime: string,
  endTime: string,
  config: ScheduleConfig
): boolean {
  const override = staff.availabilityOverride;
  const slotStart = timeToMinutes(startTime);
  const slotEnd = timeToMinutes(endTime);
  
  // No override means fully available (default rule)
  if (!override) {
    return true;
  }
  
  // Check day availability
  if (override.availableDays && override.availableDays.length > 0) {
    // Staff is only available on specific days
    const dayIndex = config.days.indexOf(day);
    const dayIndexStr = String(dayIndex + 1); // "1", "2", "3"
    
    const isAvailableDay = override.availableDays.some(d => 
      d === day || // Exact date match
      d === dayIndexStr // Day index match
    );
    
    if (!isAvailableDay) {
      return false;
    }
  }
  
  // Check time windows for this specific day
  if (override.timeWindows && override.timeWindows[day]) {
    const windows = override.timeWindows[day];
    if (windows.length > 0) {
      // Staff is only available during specific windows
      const isInWindow = windows.some(window => {
        const windowStart = timeToMinutes(window.startTime);
        const windowEnd = timeToMinutes(window.endTime);
        return slotStart >= windowStart && slotEnd <= windowEnd;
      });
      
      if (!isInWindow) {
        return false;
      }
    }
  }
  
  // Check unavailable blocks
  if (override.unavailableBlocks) {
    for (const block of override.unavailableBlocks) {
      if (block.date === day) {
        const blockStart = timeToMinutes(block.startTime);
        const blockEnd = timeToMinutes(block.endTime);
        
        // Check if slot overlaps with unavailable block
        if (slotStart < blockEnd && slotEnd > blockStart) {
          return false;
        }
      }
    }
  }
  
  return true;
}

function getRoomsForExam(
  exam: Exam,
  roomMappings: RoomMapping[],
  staff: StaffMember[]
): string[] {
  const allRooms = roomMappings.flatMap(m => m.rooms);
  
  // For MA - prefer Prüfer 1's competence field rooms, but allow ALL rooms as fallback
  // This ensures MA exams can be scheduled in alternative rooms if primary room is full
  if (exam.degree === 'MA') {
    const preferredRooms: string[] = [];
    
    const examiner1 = staff.find(s => s.id === exam.examiner1Id);
    if (examiner1?.primaryCompetenceField) {
      const mapping = roomMappings.find(m => 
        m.kompetenzfeld.toLowerCase() === examiner1.primaryCompetenceField!.toLowerCase()
      );
      if (mapping) {
        preferredRooms.push(...mapping.rooms);
      }
    }
    
    // Add Prüfer 2's rooms as secondary preference
    const examiner2 = staff.find(s => s.id === exam.examiner2Id);
    if (examiner2?.primaryCompetenceField) {
      const mapping = roomMappings.find(m => 
        m.kompetenzfeld.toLowerCase() === examiner2.primaryCompetenceField!.toLowerCase()
      );
      if (mapping) {
        for (const room of mapping.rooms) {
          if (!preferredRooms.includes(room)) {
            preferredRooms.push(room);
          }
        }
      }
    }
    
    // Add ALL other rooms as fallback options for MA
    for (const room of allRooms) {
      if (!preferredRooms.includes(room)) {
        preferredRooms.push(room);
      }
    }
    
    return preferredRooms.length > 0 ? preferredRooms : allRooms;
  }
  
  // BA with "Integratives Design" or "Integriertes Design" - same logic as MA
  if (exam.degree === 'BA' && isIntegrativesDesign(exam.kompetenzfeld)) {
    const preferredRooms: string[] = [];
    
    const examiner1 = staff.find(s => s.id === exam.examiner1Id);
    if (examiner1?.primaryCompetenceField) {
      const mapping = roomMappings.find(m => 
        m.kompetenzfeld.toLowerCase() === examiner1.primaryCompetenceField!.toLowerCase()
      );
      if (mapping) {
        preferredRooms.push(...mapping.rooms);
      }
    }
    
    // Add all other rooms as fallback
    for (const room of allRooms) {
      if (!preferredRooms.includes(room)) {
        preferredRooms.push(room);
      }
    }
    
    return preferredRooms.length > 0 ? preferredRooms : allRooms;
  }
  
  // Regular BA - use kompetenzfeld mapping strictly (no alternative rooms)
  if (exam.kompetenzfeld) {
    const mapping = roomMappings.find(m => 
      m.kompetenzfeld.toLowerCase() === exam.kompetenzfeld!.toLowerCase()
    );
    if (mapping) return mapping.rooms;
  }
  
  return allRooms;
}

function selectBestProtocolist(
  eligibleStaff: StaffMember[],
  assignments: Map<string, StaffAssignment>,
  exam: Exam,
  day: string,
  allStaff: StaffMember[]
): StaffMember | null {
  if (eligibleStaff.length === 0) return null;
  
  // Calculate average load for balancing
  const allLoads = Array.from(assignments.values()).map(a => 
    a.examIds.length + a.protocolIds.length
  );
  const avgLoad = allLoads.length > 0 
    ? allLoads.reduce((sum, l) => sum + l, 0) / allLoads.length 
    : 0;
  
  // Score each candidate
  const scored = eligibleStaff.map(staff => {
    const assignment = assignments.get(staff.id) || {
      staffId: staff.id,
      examIds: [],
      protocolIds: [],
      dayAssignments: new Map(),
    };
    
    const supervisionCount = assignment.examIds.length;
    const protocolCount = assignment.protocolIds.length;
    const totalLoad = supervisionCount + protocolCount;
    
    // Days already assigned
    const daysAssigned = assignment.dayAssignments.size;
    const isNewDay = !assignment.dayAssignments.has(day);
    
    // Same competence field bonus
    const sameFieldBonus = staff.competenceFields.some(f => 
      f.toLowerCase() === exam.kompetenzfeld?.toLowerCase()
    ) ? -1 : 0;
    
    // Score: lower is better - prioritize balanced distribution
    let score = 0;
    
    // Primary factor: total load compared to average (balance across all staff)
    score += (totalLoad - avgLoad) * 3;
    
    // Prefer staff with fewer protocol assignments
    score += protocolCount * 1.5;
    
    // Small bonus for staff with few exam supervisions (they can take more protocols)
    if (supervisionCount < 3) {
      score -= 2;
    }
    
    // Penalize adding new days only if they already have significant load
    if (isNewDay && totalLoad > 2) {
      score += 2;
    }
    
    // Slight penalty for spread across many days
    score += daysAssigned * 0.3;
    
    // Competence field match bonus
    score += sameFieldBonus;
    
    return { staff, score, totalLoad };
  });
  
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.staff || null;
}

// Constants for break rule
const BREAK_DURATION = 45; // Minutes of break needed after 4 consecutive exams
const MAX_CONSECUTIVE = 4; // Max consecutive exams before break
const CONSECUTIVE_GAP_TOLERANCE = 5; // Minutes gap to still count as consecutive

function checkBreakRule(
  staffId: string,
  scheduledEvents: ScheduledEvent[],
  newSlot: TimeSlot,
  exams: Exam[]
): boolean {
  // Get all events for this staff member on the same day
  const staffEvents = scheduledEvents.filter(e => {
    const exam = exams.find(ex => ex.id === e.examId);
    if (!exam || e.dayDate !== newSlot.day) return false;
    return (
      exam.examiner1Id === staffId || 
      exam.examiner2Id === staffId || 
      e.protocolistId === staffId
    );
  });
  
  // Sort by time
  staffEvents.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  const newStart = timeToMinutes(newSlot.startTime);
  
  // Count consecutive exams BEFORE the new slot
  let consecutiveCount = 0;
  let lastEndTime = 0;
  
  for (const event of staffEvents) {
    const eventStart = timeToMinutes(event.startTime);
    const eventEnd = timeToMinutes(event.endTime);
    
    // Event is after new slot - not relevant for checking
    if (eventStart >= newStart) continue;
    
    // Check if this event resets or continues the consecutive chain
    if (lastEndTime > 0 && eventStart - lastEndTime >= BREAK_DURATION) {
      // Gap of >= 45 min = break taken, reset counter
      consecutiveCount = 1;
    } else if (lastEndTime > 0 && eventStart <= lastEndTime + CONSECUTIVE_GAP_TOLERANCE) {
      // Consecutive (within 5 min gap tolerance)
      consecutiveCount++;
    } else {
      // First event or large gap (but not 45 min)
      consecutiveCount = 1;
    }
    
    lastEndTime = eventEnd;
  }
  
  // If already at 4 consecutive, check if there's enough break before new slot
  if (consecutiveCount >= MAX_CONSECUTIVE && lastEndTime > 0) {
    // New slot must start at least 45 min after the last exam
    if (newStart - lastEndTime < BREAK_DURATION) {
      return false; // Not allowed, break is too short
    }
    // Enough break, counter would reset - allowed
  }
  
  // Also check: would adding this slot create a 5th consecutive?
  // (the slot itself + 3 before it without break)
  // Already handled: if we have 4 before with no break, we rejected above
  // If we have 3 before with no break, adding this makes 4 - that's allowed
  
  return true;
}

// ============ MERGE VALIDATION HELPERS ============

/**
 * Check if staff is available for a specific slot (exported for use in UI)
 */
export function isStaffAvailableForSlot(
  staff: StaffMember,
  day: string,
  startTime: string,
  durationMinutes: number,
  config: ScheduleConfig
): boolean {
  const endTime = addMinutes(startTime, durationMinutes);
  return isStaffAvailable(staff, day, startTime, endTime, config);
}

export interface MergeValidationResult {
  valid: boolean;
  conflicts: string[];
  warnings: string[];
}

export interface MergeSlotOption {
  dayDate: string;
  room: string;
  startTime: string;
  endTime: string;
  isOriginal: boolean;
}

/**
 * Validate if a merge can be performed at a specific slot
 */
export function validateMergeSlot(
  targetSlot: { dayDate: string; room: string; startTime: string; durationMinutes: number },
  examinerIds: string[],
  protocolistId: string | null,
  currentEvents: ScheduledEvent[],
  exams: Exam[],
  staff: StaffMember[],
  config: ScheduleConfig,
  excludeEventIds: string[] = []
): MergeValidationResult {
  const conflicts: string[] = [];
  const warnings: string[] = [];
  
  const startMinutes = timeToMinutes(targetSlot.startTime);
  const endMinutes = startMinutes + targetSlot.durationMinutes;
  const endTime = minutesToTime(endMinutes);
  
  // Filter out the events being merged
  const relevantEvents = currentEvents.filter(e => 
    !excludeEventIds.includes(e.id) && 
    e.status === 'scheduled' &&
    e.dayDate === targetSlot.dayDate
  );
  
  // 1. Check if extended slot fits within schedule config time bounds
  const configEndMinutes = timeToMinutes(config.endTime);
  if (endMinutes > configEndMinutes) {
    conflicts.push(`Der verlängerte Slot (${targetSlot.startTime}-${endTime}) überschreitet das Tageszeitfenster (bis ${config.endTime})`);
  }
  
  // 2. Check room availability for extended duration
  const roomConflict = relevantEvents.some(e => {
    if (e.room !== targetSlot.room) return false;
    const existingStart = timeToMinutes(e.startTime);
    const existingEnd = timeToMinutes(e.endTime);
    // Overlap check
    return !(endMinutes <= existingStart || startMinutes >= existingEnd);
  });
  
  if (roomConflict) {
    conflicts.push(`Raum ${targetSlot.room} ist im erweiterten Zeitraum bereits belegt`);
  }
  
  // 3. Check examiner availability for all (up to 4) examiners
  for (const examinerId of examinerIds) {
    const examiner = staff.find(s => s.id === examinerId);
    if (!examiner) continue;
    
    // Check staff availability (overrides)
    if (!isStaffAvailable(examiner, targetSlot.dayDate, targetSlot.startTime, endTime, config)) {
      conflicts.push(`${examiner.name} ist im Zeitraum ${targetSlot.startTime}-${endTime} nicht verfügbar`);
      continue;
    }
    
    // Check for conflicts with other events (as examiner or protocolist)
    const examinerConflict = relevantEvents.some(e => {
      const existingStart = timeToMinutes(e.startTime);
      const existingEnd = timeToMinutes(e.endTime);
      // No overlap = ok
      if (endMinutes <= existingStart || startMinutes >= existingEnd) return false;
      
      const exam = exams.find(ex => ex.id === e.examId);
      if (!exam) return false;
      
      // Check if this examiner is involved in that event
      const asExaminer = exam.examiner1Id === examinerId || exam.examiner2Id === examinerId ||
                         (exam.examinerIds && exam.examinerIds.includes(examinerId));
      const asProtocolist = e.protocolistId === examinerId;
      
      return asExaminer || asProtocolist;
    });
    
    if (examinerConflict) {
      conflicts.push(`${examiner.name} hat eine überlappende Prüfung im Zeitraum`);
    }
  }
  
  // 4. Check protocolist availability
  if (protocolistId) {
    const protocolist = staff.find(s => s.id === protocolistId);
    if (protocolist) {
      if (!isStaffAvailable(protocolist, targetSlot.dayDate, targetSlot.startTime, endTime, config)) {
        conflicts.push(`Protokollant ${protocolist.name} ist im erweiterten Zeitraum nicht verfügbar`);
      } else {
        // Check for conflicts with other events
        const protocolConflict = relevantEvents.some(e => {
          const existingStart = timeToMinutes(e.startTime);
          const existingEnd = timeToMinutes(e.endTime);
          if (endMinutes <= existingStart || startMinutes >= existingEnd) return false;
          
          const exam = exams.find(ex => ex.id === e.examId);
          if (!exam) return false;
          
          const asExaminer = exam.examiner1Id === protocolistId || exam.examiner2Id === protocolistId ||
                             (exam.examinerIds && exam.examinerIds.includes(protocolistId));
          const asProtocolist = e.protocolistId === protocolistId;
          
          return asExaminer || asProtocolist;
        });
        
        if (protocolConflict) {
          conflicts.push(`Protokollant ${protocolist.name} hat eine überlappende Prüfung`);
        }
      }
    }
  }
  
  // 5. Check break rules for all staff
  const slot = { day: targetSlot.dayDate, room: targetSlot.room, startTime: targetSlot.startTime, endTime };
  for (const staffId of [...examinerIds, ...(protocolistId ? [protocolistId] : [])]) {
    if (!checkBreakRule(staffId, relevantEvents, slot, exams)) {
      const staffMember = staff.find(s => s.id === staffId);
      warnings.push(`${staffMember?.name || 'Person'} würde die maximale Anzahl aufeinanderfolgender Prüfungen überschreiten`);
    }
  }
  
  return {
    valid: conflicts.length === 0,
    conflicts,
    warnings,
  };
}

/**
 * Find alternative slots for a merged colloquium
 */
export function findAlternativeMergeSlots(
  durationMinutes: number,
  examinerIds: string[],
  protocolistId: string | null,
  currentEvents: ScheduledEvent[],
  exams: Exam[],
  staff: StaffMember[],
  config: ScheduleConfig,
  excludeEventIds: string[] = [],
  preferredDay?: string,
  maxResults: number = 5
): MergeSlotOption[] {
  const alternatives: MergeSlotOption[] = [];
  const startMinutes = timeToMinutes(config.startTime);
  const endMinutes = timeToMinutes(config.endTime);
  
  // Sort days: preferred day first, then chronologically
  const sortedDays = [...config.days].sort((a, b) => {
    if (a === preferredDay) return -1;
    if (b === preferredDay) return 1;
    return a.localeCompare(b);
  });
  
  for (const day of sortedDays) {
    for (const room of config.rooms) {
      let currentTime = startMinutes;
      
      while (currentTime + durationMinutes <= endMinutes && alternatives.length < maxResults) {
        const slotStartTime = minutesToTime(currentTime);
        
        const validation = validateMergeSlot(
          { dayDate: day, room: room.name, startTime: slotStartTime, durationMinutes },
          examinerIds,
          protocolistId,
          currentEvents,
          exams,
          staff,
          config,
          excludeEventIds
        );
        
        if (validation.valid) {
          alternatives.push({
            dayDate: day,
            room: room.name,
            startTime: slotStartTime,
            endTime: minutesToTime(currentTime + durationMinutes),
            isOriginal: false,
          });
        }
        
        currentTime += 30; // Try every 30 minutes
      }
    }
    
    if (alternatives.length >= maxResults) break;
  }
  
  return alternatives;
}

/**
 * Re-optimize schedule after merge to fill gaps
 */
export function reoptimizeAfterMerge(
  freedSlot: { dayDate: string; room: string; startTime: string; endTime: string },
  currentEvents: ScheduledEvent[],
  exams: Exam[],
  staff: StaffMember[],
  roomMappings: RoomMapping[],
  config: ScheduleConfig,
  versionId: string
): { movedEvents: ScheduledEvent[]; filledWith?: ScheduledEvent } {
  const movedEvents: ScheduledEvent[] = [];
  const freedStartMinutes = timeToMinutes(freedSlot.startTime);
  const freedEndMinutes = timeToMinutes(freedSlot.endTime);
  const freedDuration = freedEndMinutes - freedStartMinutes;
  
  // Find events that could fill or be moved into the gap
  const sameRoomSameDayEvents = currentEvents.filter(e => 
    e.dayDate === freedSlot.dayDate && 
    e.room === freedSlot.room && 
    e.status === 'scheduled' &&
    timeToMinutes(e.startTime) > freedEndMinutes // Events after the freed slot
  ).sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  // Try to shift later events forward to close the gap
  for (const event of sameRoomSameDayEvents) {
    const exam = exams.find(e => e.id === event.examId);
    if (!exam) continue;
    
    const eventDuration = timeToMinutes(event.endTime) - timeToMinutes(event.startTime);
    const newStartTime = freedSlot.startTime;
    const newEndMinutes = freedStartMinutes + eventDuration;
    const newEndTime = minutesToTime(newEndMinutes);
    
    // Check if this event can be moved earlier
    const examinerIds = getAllExaminerIds(exam);
    const validation = validateMergeSlot(
      { dayDate: freedSlot.dayDate, room: freedSlot.room, startTime: newStartTime, durationMinutes: eventDuration },
      examinerIds,
      event.protocolistId,
      currentEvents.filter(e => e.id !== event.id),
      exams,
      staff,
      config,
      [event.id]
    );
    
    if (validation.valid) {
      const movedEvent: ScheduledEvent = {
        ...event,
        startTime: newStartTime,
        endTime: newEndTime,
      };
      movedEvents.push(movedEvent);
      break; // Only move the first eligible event
    }
  }
  
  return { movedEvents };
}

// ============ MAIN SCHEDULING FUNCTION ============

export function generateSchedule(
  exams: Exam[],
  staff: StaffMember[],
  roomMappings: RoomMapping[],
  config: ScheduleConfig,
  versionId: string
): { events: ScheduledEvent[]; conflicts: ConflictReport[] } {
  const events: ScheduledEvent[] = [];
  const conflicts: ConflictReport[] = [];
  const assignments = new Map<string, StaffAssignment>();
  const usedSlots = new Set<string>(); // "day-room-startTime"
  
  // Day statistics for debugging
  const dayStats = new Map<string, { scheduled: number; slotsChecked: number; skippedExaminers: number }>();
  for (const day of config.days) {
    dayStats.set(day, { scheduled: 0, slotsChecked: 0, skippedExaminers: 0 });
  }
  
  // Initialize staff assignments
  for (const s of staff) {
    assignments.set(s.id, {
      staffId: s.id,
      examIds: [],
      protocolIds: [],
      dayAssignments: new Map(),
    });
  }
  
  // Track examiner supervision counts from exam data
  for (const exam of exams) {
    const a1 = assignments.get(exam.examiner1Id);
    if (a1) a1.examIds.push(exam.id);
    const a2 = assignments.get(exam.examiner2Id);
    if (a2) a2.examIds.push(exam.id);
  }
  
  // Calculate examiner load for prioritization
  // Exams with heavily-loaded examiners should be scheduled first
  const examinerLoadMap = new Map<string, number>();
  for (const exam of exams) {
    examinerLoadMap.set(exam.examiner1Id, (examinerLoadMap.get(exam.examiner1Id) || 0) + 1);
    examinerLoadMap.set(exam.examiner2Id, (examinerLoadMap.get(exam.examiner2Id) || 0) + 1);
  }
  
  // Sort exams: MA first (to prioritize on early days), then by examiner load (highest first), then by kompetenzfeld
  const sortedExams = [...exams].sort((a, b) => {
    // MA before BA - Master exams get priority for early days
    if (a.degree !== b.degree) return a.degree === 'MA' ? -1 : 1;
    
    // Within same degree: sort by combined examiner load (higher load = schedule first)
    const loadA = (examinerLoadMap.get(a.examiner1Id) || 0) + (examinerLoadMap.get(a.examiner2Id) || 0);
    const loadB = (examinerLoadMap.get(b.examiner1Id) || 0) + (examinerLoadMap.get(b.examiner2Id) || 0);
    if (loadA !== loadB) return loadB - loadA; // Higher load first
    
    // Same load: sort by kompetenzfeld for room grouping
    if (a.degree === 'BA' && b.degree === 'BA') {
      return (a.kompetenzfeld || '').localeCompare(b.kompetenzfeld || '');
    }
    return 0;
  });
  
  for (const exam of sortedExams) {
    // Use getExamDuration to handle team exams with doubled duration
    const duration = getExamDuration(exam);
    const allowedRooms = getRoomsForExam(exam, roomMappings, staff);
    
    // Get all examiners for team exams
    const allExaminerIds = getAllExaminerIds(exam);
    const examiner1 = staff.find(s => s.id === exam.examiner1Id);
    const examiner2 = staff.find(s => s.id === exam.examiner2Id);
    
    let scheduled = false;
    const triedDays: string[] = [];
    const dayFailureReasons: Map<string, string> = new Map();
    
    // Track per-exam statistics for better debugging
    const examDayStats = new Map<string, { slotsChecked: number; reason: string }>();
    for (const day of config.days) {
      examDayStats.set(day, { slotsChecked: 0, reason: '' });
    }
    
    // Get days where examiners are already scheduled (to minimize their attendance days)
    const examiner1Assignment = assignments.get(exam.examiner1Id);
    const examiner2Assignment = assignments.get(exam.examiner2Id);
    
    // Sort days: prefer days where examiners are already present, then prefer early days
    const sortedDays = [...config.days].sort((a, b) => {
      const indexA = config.days.indexOf(a);
      const indexB = config.days.indexOf(b);
      
      // 1. Prüfer-Präsenz: Bevorzuge Tage wo Prüfer schon eingeteilt sind
      const examiner1HasA = examiner1Assignment?.dayAssignments.has(a) ? 1 : 0;
      const examiner1HasB = examiner1Assignment?.dayAssignments.has(b) ? 1 : 0;
      const examiner2HasA = examiner2Assignment?.dayAssignments.has(a) ? 1 : 0;
      const examiner2HasB = examiner2Assignment?.dayAssignments.has(b) ? 1 : 0;
      
      const presenceA = examiner1HasA + examiner2HasA; // 0, 1 oder 2
      const presenceB = examiner1HasB + examiner2HasB;
      
      // Höhere Präsenz = besser (kommt zuerst)
      if (presenceA !== presenceB) return presenceB - presenceA;
      
      // 2. Bei gleicher Präsenz: frühe Tage bevorzugen (Frontloading Tag 1 & 2)
      return indexA - indexB;
    });
    
    // Try each day in load-balanced order
    for (const day of sortedDays) {
      if (scheduled) break;
      triedDays.push(day);
      
      const stats = dayStats.get(day)!;
      const examStats = examDayStats.get(day)!;
      
      // Check examiner availability for this day first
      const examiner1AvailableDay = !examiner1 || isStaffAvailable(examiner1, day, config.startTime, config.endTime, config);
      const examiner2AvailableDay = !examiner2 || isStaffAvailable(examiner2, day, config.startTime, config.endTime, config);
      
      if (!examiner1AvailableDay) {
        stats.skippedExaminers++;
        examStats.reason = `⛔ ${examiner1?.name || 'Prüfer 1'} nicht verfügbar`;
        dayFailureReasons.set(day, examStats.reason);
        continue; // Try next day
      }
      if (!examiner2AvailableDay) {
        stats.skippedExaminers++;
        examStats.reason = `⛔ ${examiner2?.name || 'Prüfer 2'} nicht verfügbar`;
        dayFailureReasons.set(day, examStats.reason);
        continue; // Try next day
      }
      
      let foundSlotOnDay = false;
      
      for (const roomName of allowedRooms) {
        if (scheduled) break;
        
        const room = config.rooms.find(r => r.name === roomName);
        if (!room) continue;
        
        let currentTime = timeToMinutes(config.startTime);
        const endLimit = timeToMinutes(config.endTime);
        
        while (currentTime + duration <= endLimit) {
          stats.slotsChecked++;
          examStats.slotsChecked++;
          const startTime = minutesToTime(currentTime);
          const endTime = addMinutes(startTime, duration);
          const slotKey = `${day}-${roomName}-${startTime}`;
          
          // Check for room conflicts (with 5 minute buffer)
          const ROOM_BUFFER = 5; // Minutes buffer between exams in same room
          const roomConflict = events.some(e => {
            if (e.dayDate !== day || e.room !== roomName) return false;
            const existingStart = timeToMinutes(e.startTime);
            const existingEnd = timeToMinutes(e.endTime);
            const newStart = currentTime;
            const newEnd = currentTime + duration;
            // Must have at least 5 minutes gap
            return !(newEnd + ROOM_BUFFER <= existingStart || newStart >= existingEnd + ROOM_BUFFER);
          });
          
          if (usedSlots.has(slotKey) || roomConflict) {
            currentTime += 5; // Try 5 minute increments to find gaps
            continue;
          }
          
          // Check examiner availability for this specific slot
          const examiner1Available = !examiner1 || isStaffAvailable(examiner1, day, startTime, endTime, config);
          const examiner2Available = !examiner2 || isStaffAvailable(examiner2, day, startTime, endTime, config);
          
          if (!examiner1Available || !examiner2Available) {
            currentTime += duration;
            continue;
          }
          
          // HARD CONSTRAINT: Check ALL conflicts for examiners (as examiner OR protocolist in other events)
          const hasExaminerConflict = events.some(e => {
            if (e.dayDate !== day) return false;
            // Check for actual time overlap
            const existingStart = timeToMinutes(e.startTime);
            const existingEnd = timeToMinutes(e.endTime);
            const newStart = currentTime;
            const newEnd = currentTime + duration;
            // No overlap if new ends before existing starts, or new starts after existing ends
            if (newEnd <= existingStart || newStart >= existingEnd) return false;
            
            const otherExam = exams.find(ex => ex.id === e.examId);
            if (!otherExam) return false;
            
            // Check if our examiners are busy as examiners in another exam
            const examinerAsExaminer = (
              otherExam.examiner1Id === exam.examiner1Id ||
              otherExam.examiner2Id === exam.examiner1Id ||
              otherExam.examiner1Id === exam.examiner2Id ||
              otherExam.examiner2Id === exam.examiner2Id
            );
            
            // CRITICAL FIX: Also check if our examiners are busy as protocolists
            const examinerAsProtocolist = (
              e.protocolistId === exam.examiner1Id ||
              e.protocolistId === exam.examiner2Id
            );
            
            return examinerAsExaminer || examinerAsProtocolist;
          });
          
          if (hasExaminerConflict) {
            currentTime += duration;
            continue;
          }
          
          // Find protocolist - HARD RULE: only internal staff can be protocolists
          // Track detailed reasons for failure
          const internalStaff = staff.filter(s => canBeProtocolist(s));
          const notExaminerCount = internalStaff.filter(s => 
            s.id !== exam.examiner1Id && s.id !== exam.examiner2Id
          ).length;
          
          let busyAsExaminer = 0;
          let busyAsProtocolist = 0;
          let notAvailable = 0;
          
          const eligibleProtocolists = staff.filter(s => {
            // Use the canBeProtocolist helper which enforces the employment type rule
            if (!canBeProtocolist(s)) return false;
            if (s.id === exam.examiner1Id || s.id === exam.examiner2Id) return false;
            if (!isStaffAvailable(s, day, startTime, endTime, config)) {
              notAvailable++;
              return false;
            }
            
            // Check if already assigned at this time (with proper time overlap check)
            const alreadyBusy = events.some(e => {
              if (e.dayDate !== day) return false;
              // Check for actual time overlap
              const existingStart = timeToMinutes(e.startTime);
              const existingEnd = timeToMinutes(e.endTime);
              const newStart = currentTime;
              const newEnd = currentTime + duration;
              // No overlap if new ends before existing starts, or new starts after existing ends
              if (newEnd <= existingStart || newStart >= existingEnd) return false;
              
              const otherExam = exams.find(ex => ex.id === e.examId);
              if (!otherExam) return false;
              
              if (e.protocolistId === s.id) {
                busyAsProtocolist++;
                return true;
              }
              if (otherExam.examiner1Id === s.id || otherExam.examiner2Id === s.id) {
                busyAsExaminer++;
                return true;
              }
              return false;
            });
            
            return !alreadyBusy;
          });
          
          const protocolist = selectBestProtocolist(eligibleProtocolists, assignments, exam, day, staff);
          
          if (!protocolist) {
            // Track why no protocolist found for this slot
            if (internalStaff.length === 0) {
              if (!dayFailureReasons.has(day)) {
                dayFailureReasons.set(day, 'Keine internen Mitarbeiter (können als Protokollant fungieren)');
              }
            } else if (eligibleProtocolists.length === 0) {
              const details: string[] = [];
              if (notAvailable > 0) details.push(`${notAvailable} nicht verfügbar`);
              if (busyAsExaminer > 0) details.push(`${busyAsExaminer} als Prüfer belegt`);
              if (busyAsProtocolist > 0) details.push(`${busyAsProtocolist} als Protokollant belegt`);
              const examinersAreInternal = internalStaff.some(s => s.id === exam.examiner1Id || s.id === exam.examiner2Id);
              if (examinersAreInternal) details.push('Prüfer können nicht eigene Prüfung protokollieren');
              
              if (!dayFailureReasons.has(day) || dayFailureReasons.get(day) === 'Keine freien Zeitslots oder Protokollanten') {
                dayFailureReasons.set(day, `Alle ${notExaminerCount} möglichen Protokollanten belegt (${details.join(', ')})`);
              }
            }
            currentTime += duration;
            continue;
          }
          
          // Check break rule for all involved
          const slot: TimeSlot = { day, room: roomName, startTime, endTime };
          const breakOk = [exam.examiner1Id, exam.examiner2Id, protocolist.id].every(id =>
            !id || checkBreakRule(id, events, slot, exams)
          );
          
          if (!breakOk) {
            currentTime += duration;
            continue;
          }
          
          // Schedule the exam!
          const event: ScheduledEvent = {
            id: crypto.randomUUID(),
            scheduleVersionId: versionId,
            examId: exam.id,
            dayDate: day,
            room: roomName,
            startTime,
            endTime,
            protocolistId: protocolist.id,
            status: 'scheduled',
            // Store team info in event for quick access
            isTeam: exam.isTeam,
            durationMinutes: duration,
          };
          
          events.push(event);
          usedSlots.add(slotKey);
          stats.scheduled++;
          
          // Update assignments
          const protocolAssignment = assignments.get(protocolist.id)!;
          protocolAssignment.protocolIds.push(exam.id);
          const dayAssignments = protocolAssignment.dayAssignments.get(day) || [];
          dayAssignments.push(exam.id);
          protocolAssignment.dayAssignments.set(day, dayAssignments);
          
          scheduled = true;
          foundSlotOnDay = true;
          break;
        }
      }
      
      if (!foundSlotOnDay && !examStats.reason) {
        examStats.reason = 'Keine freien Slots/Protokollanten';
        dayFailureReasons.set(day, examStats.reason);
      } else if (!foundSlotOnDay && !dayFailureReasons.has(day)) {
        dayFailureReasons.set(day, examStats.reason || 'Keine freien Zeitslots oder Protokollanten');
      }
    }
    
    if (!scheduled) {
      // Build detailed failure message with PER-EXAM day statistics
      const triedDaysInfo = config.days.map(d => {
        const examStats = examDayStats.get(d);
        const reason = examStats?.reason || dayFailureReasons.get(d) || 'nicht versucht';
        if (reason.includes('nicht verfügbar')) {
          return `${d}: ${reason}`;
        }
        return `${d}: ${reason} (${examStats?.slotsChecked || 0} Slots geprüft)`;
      }).join('; ');
      
      const message = `Prüfung für ${exam.studentName} konnte nicht geplant werden. ${triedDaysInfo}`;
      const suggestion = 'Prüfen Sie die Verfügbarkeit der Prüfer an allen Tagen oder fügen Sie weitere Tage/Räume hinzu';
      
      conflicts.push({
        type: 'availability',
        severity: 'error',
        message,
        affectedExamId: exam.id,
        affectedStaffId: examiner1?.id || examiner2?.id,
        suggestion,
      });
    }
  }
  
  // Add day distribution summary
  const dayDistribution: string[] = [];
  let hasEmptyDay = false;
  for (const [day, stats] of dayStats) {
    dayDistribution.push(`${day}: ${stats.scheduled} Prüfungen`);
    if (stats.scheduled === 0 && exams.length > 0) {
      hasEmptyDay = true;
    }
  }
  
  // Warn if any day is empty
  if (hasEmptyDay) {
    const emptyDays = Array.from(dayStats.entries())
      .filter(([_, stats]) => stats.scheduled === 0)
      .map(([day, stats]) => `${day} (${stats.skippedExaminers} Prüfungen wegen Prüfer-Verfügbarkeit übersprungen)`);
    
    conflicts.push({
      type: 'constraint',
      severity: 'warning',
      message: `⚠️ Tagesverteilung: ${dayDistribution.join(', ')}. Ungenutzte Tage: ${emptyDays.join(', ')}`,
      suggestion: 'Prüfen Sie die Verfügbarkeitseinstellungen der Prüfer - möglicherweise sind nicht alle an allen Tagen verfügbar',
    });
  } else {
    // Add info about distribution even if all days are used
    conflicts.push({
      type: 'constraint',
      severity: 'warning',
      message: `📊 Tagesverteilung: ${dayDistribution.join(', ')}`,
      suggestion: 'Information zur Verteilung',
    });
  }

  // Add warnings for workload imbalance
  const protocolCounts = new Map<string, number>();
  for (const event of events) {
    const count = protocolCounts.get(event.protocolistId) || 0;
    protocolCounts.set(event.protocolistId, count + 1);
  }
  
  const counts = Array.from(protocolCounts.values());
  if (counts.length > 0) {
    const maxCount = Math.max(...counts);
    const minCount = Math.min(...counts);
    if (maxCount - minCount > 3) {
      conflicts.push({
        type: 'constraint',
        severity: 'warning',
        message: `Protokoll-Arbeitslast unausgeglichen: ${minCount} bis ${maxCount} Zuweisungen pro Person`,
        suggestion: 'Passen Sie die Verfügbarkeit an oder fügen Sie mehr Protokollanten hinzu',
      });
    }
  }
  
  return { events, conflicts };
}
