import type { 
  Exam, 
  StaffMember, 
  RoomMapping, 
  ScheduledEvent, 
  ScheduleConfig,
  ConflictReport,
  Degree 
} from '@/types';
import { SLOT_DURATIONS } from '@/types';

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

function isStaffAvailable(
  staff: StaffMember,
  day: string,
  startTime: string,
  endTime: string
): boolean {
  if (staff.availabilityConstraints.length === 0) return true;
  
  const dayOfWeek = new Date(day).toLocaleDateString('en-US', { weekday: 'long' });
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);
  
  for (const constraint of staff.availabilityConstraints) {
    if (constraint.type === 'unavailable') {
      if (constraint.day && constraint.day.toLowerCase() === dayOfWeek.toLowerCase()) {
        return false;
      }
    }
    
    if (constraint.type === 'available' && constraint.day) {
      if (constraint.day.toLowerCase() !== dayOfWeek.toLowerCase()) {
        return false;
      }
    }
    
    if (constraint.startTime && constraint.endTime) {
      const constraintStart = timeToMinutes(constraint.startTime);
      const constraintEnd = timeToMinutes(constraint.endTime);
      
      if (constraint.type === 'available') {
        if (startMins < constraintStart || endMins > constraintEnd) {
          return false;
        }
      } else {
        if (startMins >= constraintStart && endMins <= constraintEnd) {
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
    
    // Try each day, then each room in priority order
    for (const day of config.days) {
      if (scheduled) break;
      
      for (const roomName of allowedRooms) {
        if (scheduled) break;
        
        const room = config.rooms.find(r => r.name === roomName);
        if (!room) continue;
        
        let currentTime = timeToMinutes(config.startTime);
        const endLimit = timeToMinutes(config.endTime);
        
        while (currentTime + duration <= endLimit) {
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
          
          // Check examiner availability
          const examiner1Available = !examiner1 || isStaffAvailable(examiner1, day, startTime, endTime);
          const examiner2Available = !examiner2 || isStaffAvailable(examiner2, day, startTime, endTime);
          
          if (!examiner1Available || !examiner2Available) {
            currentTime += duration;
            continue;
          }
          
          // Check examiner conflicts (already scheduled at same time)
          const hasConflict = events.some(e => {
            if (e.dayDate !== day || e.startTime !== startTime) return false;
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
          
          // Find protocolist
          const eligibleProtocolists = staff.filter(s => {
            if (!s.canProtocol) return false;
            if (s.employmentType !== 'internal') return false;
            if (s.id === exam.examiner1Id || s.id === exam.examiner2Id) return false;
            if (!isStaffAvailable(s, day, startTime, endTime)) return false;
            
            // Check if already assigned at this time
            const alreadyBusy = events.some(e => {
              if (e.dayDate !== day || e.startTime !== startTime) return false;
              const otherExam = exams.find(ex => ex.id === e.examId);
              if (!otherExam) return false;
              return (
                e.protocolistId === s.id ||
                otherExam.examiner1Id === s.id ||
                otherExam.examiner2Id === s.id
              );
            });
            
            return !alreadyBusy;
          });
          
          const protocolist = selectBestProtocolist(eligibleProtocolists, assignments, exam, day, staff);
          
          if (!protocolist) {
            // Try next slot
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
          
          // Update assignments
          const protocolAssignment = assignments.get(protocolist.id)!;
          protocolAssignment.protocolIds.push(exam.id);
          const dayAssignments = protocolAssignment.dayAssignments.get(day) || [];
          dayAssignments.push(exam.id);
          protocolAssignment.dayAssignments.set(day, dayAssignments);
          
          scheduled = true;
          break;
        }
      }
    }
    
    if (!scheduled) {
      conflicts.push({
        type: 'constraint',
        severity: 'error',
        message: `Could not schedule exam for ${exam.studentName}`,
        affectedExamId: exam.id,
        suggestion: 'Add more days, rooms, or check staff availability constraints',
      });
    }
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
        message: `Protocol workload imbalance: ${minCount} to ${maxCount} assignments per person`,
        suggestion: 'Consider adjusting availability or adding more eligible protocolists',
      });
    }
  }
  
  return { events, conflicts };
}
