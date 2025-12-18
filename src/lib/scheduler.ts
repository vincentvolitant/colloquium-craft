import type { 
  Exam, 
  StaffMember, 
  RoomMapping, 
  ScheduledEvent, 
  ScheduleConfig,
  ConflictReport,
  Degree 
} from '@/types';
import { SLOT_DURATIONS, canBeProtocolist } from '@/types';

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
  // For MA or BA with "Integratives Design" - use Prüfer 1's competence field rooms
  if (exam.degree === 'MA' || 
      (exam.degree === 'BA' && exam.kompetenzfeld?.toLowerCase().includes('integratives design'))) {
    
    const examiner1 = staff.find(s => s.id === exam.examiner1Id);
    if (examiner1?.primaryCompetenceField) {
      const mapping = roomMappings.find(m => 
        m.kompetenzfeld.toLowerCase() === examiner1.primaryCompetenceField!.toLowerCase()
      );
      if (mapping) return mapping.rooms;
    }
    
    // Fallback to Prüfer 2
    const examiner2 = staff.find(s => s.id === exam.examiner2Id);
    if (examiner2?.primaryCompetenceField) {
      const mapping = roomMappings.find(m => 
        m.kompetenzfeld.toLowerCase() === examiner2.primaryCompetenceField!.toLowerCase()
      );
      if (mapping) return mapping.rooms;
    }
    
    // Fallback to any available room
    return roomMappings.flatMap(m => m.rooms);
  }
  
  // Regular BA - use kompetenzfeld mapping
  if (exam.kompetenzfeld) {
    const mapping = roomMappings.find(m => 
      m.kompetenzfeld.toLowerCase() === exam.kompetenzfeld!.toLowerCase()
    );
    if (mapping) return mapping.rooms;
  }
  
  return roomMappings.flatMap(m => m.rooms);
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

function checkBreakRule(
  staffId: string,
  scheduledEvents: ScheduledEvent[],
  newSlot: TimeSlot,
  exams: Exam[]
): boolean {
  // Check if adding this slot would violate the 4-consecutive rule
  const staffEvents = scheduledEvents.filter(e => {
    const exam = exams.find(ex => ex.id === e.examId);
    if (!exam) return false;
    return (
      e.dayDate === newSlot.day &&
      (exam.examiner1Id === staffId || exam.examiner2Id === staffId || e.protocolistId === staffId)
    );
  });
  
  // Sort by time
  staffEvents.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  // Check for 4+ consecutive
  let consecutive = 0;
  let lastEndTime = '';
  
  for (const event of staffEvents) {
    if (lastEndTime && event.startTime === lastEndTime) {
      consecutive++;
    } else {
      consecutive = 1;
    }
    lastEndTime = event.endTime;
    
    if (consecutive >= 4) return false;
  }
  
  return true;
}

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
  
  // Sort exams: BA by kompetenzfeld groups, then MA
  const sortedExams = [...exams].sort((a, b) => {
    if (a.degree !== b.degree) return a.degree === 'BA' ? -1 : 1;
    if (a.degree === 'BA' && b.degree === 'BA') {
      return (a.kompetenzfeld || '').localeCompare(b.kompetenzfeld || '');
    }
    return 0;
  });
  
  for (const exam of sortedExams) {
    const duration = SLOT_DURATIONS[exam.degree];
    const allowedRooms = getRoomsForExam(exam, roomMappings, staff);
    
    const examiner1 = staff.find(s => s.id === exam.examiner1Id);
    const examiner2 = staff.find(s => s.id === exam.examiner2Id);
    
    let scheduled = false;
    const triedDays: string[] = [];
    const dayFailureReasons: Map<string, string> = new Map();
    
    // Try each day, then each room in priority order
    for (const day of config.days) {
      if (scheduled) break;
      triedDays.push(day);
      
      const stats = dayStats.get(day)!;
      
      // Check examiner availability for this day first
      const examiner1AvailableDay = !examiner1 || isStaffAvailable(examiner1, day, config.startTime, config.endTime, config);
      const examiner2AvailableDay = !examiner2 || isStaffAvailable(examiner2, day, config.startTime, config.endTime, config);
      
      if (!examiner1AvailableDay) {
        stats.skippedExaminers++;
        dayFailureReasons.set(day, `${examiner1?.name || 'Prüfer 1'} nicht verfügbar an diesem Tag`);
        continue; // Try next day
      }
      if (!examiner2AvailableDay) {
        stats.skippedExaminers++;
        dayFailureReasons.set(day, `${examiner2?.name || 'Prüfer 2'} nicht verfügbar an diesem Tag`);
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
          const startTime = minutesToTime(currentTime);
          const endTime = addMinutes(startTime, duration);
          const slotKey = `${day}-${roomName}-${startTime}`;
          
          // Check for room conflicts (with 10 minute buffer)
          const roomConflict = events.some(e => {
            if (e.dayDate !== day || e.room !== roomName) return false;
            const existingStart = timeToMinutes(e.startTime);
            const existingEnd = timeToMinutes(e.endTime);
            const newStart = currentTime;
            const newEnd = currentTime + duration;
            // Must have at least 10 minutes gap
            return !(newEnd + 10 <= existingStart || newStart >= existingEnd + 10);
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
          
          // Check examiner conflicts (already scheduled with time overlap)
          const hasConflict = events.some(e => {
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
            return (
              otherExam.examiner1Id === exam.examiner1Id ||
              otherExam.examiner2Id === exam.examiner1Id ||
              otherExam.examiner1Id === exam.examiner2Id ||
              otherExam.examiner2Id === exam.examiner2Id
            );
          });
          
          if (hasConflict) {
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
      
      if (!foundSlotOnDay && !dayFailureReasons.has(day)) {
        dayFailureReasons.set(day, 'Keine freien Zeitslots oder Protokollanten');
      }
    }
    
    if (!scheduled) {
      // Build detailed failure message with day statistics
      const triedDaysInfo = triedDays.map(d => {
        const stats = dayStats.get(d);
        const reason = dayFailureReasons.get(d) || 'unbekannter Grund';
        if (reason.includes('nicht verfügbar an diesem Tag')) {
          return `${d}: ⛔ ${reason} (0 Slots geprüft)`;
        }
        return `${d}: ${reason} (${stats?.slotsChecked || 0} Slots geprüft)`;
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
