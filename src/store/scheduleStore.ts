import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';
import type { 
  Exam, 
  StaffMember, 
  Room, 
  RoomMapping, 
  ScheduledEvent, 
  ScheduleConfig,
  ScheduleVersion,
  ConflictReport,
  AvailabilityOverride,
  Degree
} from '@/types';
import { SLOT_DURATIONS } from '@/types';
import { 
  validateMergeSlot, 
  findAlternativeMergeSlots, 
  reoptimizeAfterMerge,
  type MergeValidationResult,
  type MergeSlotOption
} from '@/lib/scheduler';

interface ScheduleState {
  // Data
  exams: Exam[];
  staff: StaffMember[];
  rooms: Room[];
  roomMappings: RoomMapping[];
  scheduledEvents: ScheduledEvent[];
  scheduleVersions: ScheduleVersion[];
  currentVersionId: string | null;
  config: ScheduleConfig;
  conflicts: ConflictReport[];
  
  // Admin auth
  isAdminAuthenticated: boolean;
  
  // Actions
  setExams: (exams: Exam[]) => void;
  addExams: (exams: Exam[]) => void;
  setStaff: (staff: StaffMember[]) => void;
  addOrUpdateStaff: (newStaff: StaffMember[], resetAvailability?: boolean) => void;
  updateStaffAvailability: (staffId: string, override: AvailabilityOverride | undefined) => void;
  setRooms: (rooms: Room[]) => void;
  setRoomMappings: (mappings: RoomMapping[]) => void;
  updateRoomMapping: (mapping: RoomMapping) => void;
  setScheduledEvents: (events: ScheduledEvent[]) => void;
  addScheduledEvents: (events: ScheduledEvent[]) => void;
  updateScheduledEvent: (event: ScheduledEvent) => void;
  removeScheduledEvents: (eventIds: string[]) => void;
  cancelEvent: (eventId: string, reason?: string) => void;
  setConfig: (config: Partial<ScheduleConfig>) => void;
  setConflicts: (conflicts: ConflictReport[]) => void;
  createScheduleVersion: () => string;
  publishVersion: (versionId: string) => void;
  setCurrentVersion: (versionId: string | null) => void;
  
  // Admin auth actions
  authenticateAdmin: (password: string) => Promise<boolean>;
  logoutAdmin: () => void;
  
  // Merge actions with validation
  validateMerge: (examId1: string, examId2: string, protocolistId?: string, targetSlot?: { dayDate: string; room: string; startTime: string }) => {
    validation: MergeValidationResult;
    alternativeSlots: MergeSlotOption[];
    targetSlot: { dayDate: string; room: string; startTime: string; durationMinutes: number } | null;
  } | null;
  mergeExams: (examId1: string, examId2: string, protocolistId?: string, targetSlot?: { dayDate: string; room: string; startTime: string }) => { 
    mergedExam: Exam; 
    mergedEvent: ScheduledEvent;
    movedEvents?: ScheduledEvent[];
  } | null;
  
  // Helpers
  getStaffById: (id: string) => StaffMember | undefined;
  getExamById: (id: string) => Exam | undefined;
  getPublishedEvents: () => ScheduledEvent[];
  getEventsForVersion: (versionId: string) => ScheduledEvent[];
  getEventForExam: (examId: string, versionId?: string) => ScheduledEvent | undefined;
}

const defaultConfig: ScheduleConfig = {
  days: [],
  rooms: [],
  startTime: '09:00',
  endTime: '18:00',
  baSlotMinutes: 50,
  maSlotMinutes: 75,
};

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      exams: [],
      staff: [],
      rooms: [],
      roomMappings: [],
      scheduledEvents: [],
      scheduleVersions: [],
      currentVersionId: null,
      config: defaultConfig,
      conflicts: [],
      isAdminAuthenticated: false,

      setExams: (exams) => set({ exams }),
      addExams: (newExams) => set((state) => ({ 
        exams: [...state.exams, ...newExams] 
      })),
      setStaff: (staff) => set({ staff }),
      // Add or update staff with deduplication based on normalized name
      addOrUpdateStaff: (newStaff, resetAvailability = false) => set((state) => {
        const normalizedName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
        const existingMap = new Map(state.staff.map(s => [normalizedName(s.name), s]));
        
        for (const newMember of newStaff) {
          const key = normalizedName(newMember.name);
          const existing = existingMap.get(key);
          
          if (existing) {
            // Update existing staff, preserve availability unless reset requested
            existingMap.set(key, {
              ...existing,
              ...newMember,
              id: existing.id, // Keep original ID
              availabilityOverride: resetAvailability ? undefined : existing.availabilityOverride,
            });
          } else {
            // Add new staff
            existingMap.set(key, newMember);
          }
        }
        
        return { staff: Array.from(existingMap.values()) };
      }),
      updateStaffAvailability: (staffId, override) => set((state) => ({
        staff: state.staff.map(s => 
          s.id === staffId ? { ...s, availabilityOverride: override } : s
        )
      })),
      setRooms: (rooms) => set({ rooms }),
      setRoomMappings: (mappings) => set({ roomMappings: mappings }),
      updateRoomMapping: (mapping) => set((state) => ({
        roomMappings: state.roomMappings.some(m => m.id === mapping.id)
          ? state.roomMappings.map(m => m.id === mapping.id ? mapping : m)
          : [...state.roomMappings, mapping]
      })),
      setScheduledEvents: (events) => set({ scheduledEvents: events }),
      addScheduledEvents: (newEvents) => set((state) => ({
        scheduledEvents: [...state.scheduledEvents, ...newEvents]
      })),
      updateScheduledEvent: (event) => set((state) => ({
        scheduledEvents: state.scheduledEvents.map(e => 
          e.id === event.id ? event : e
        )
      })),
      removeScheduledEvents: (eventIds) => set((state) => ({
        scheduledEvents: state.scheduledEvents.filter(e => !eventIds.includes(e.id))
      })),
      cancelEvent: (eventId, reason) => set((state) => ({
        scheduledEvents: state.scheduledEvents.map(e => 
          e.id === eventId 
            ? { 
                ...e, 
                status: 'cancelled' as const, 
                cancelledReason: reason,
                cancelledAt: new Date().toISOString()
              }
            : e
        )
      })),
      setConfig: (config) => set((state) => ({
        config: { ...state.config, ...config }
      })),
      setConflicts: (conflicts) => set({ conflicts }),
      createScheduleVersion: () => {
        const newVersion: ScheduleVersion = {
          id: crypto.randomUUID(),
          createdAt: new Date(),
          status: 'draft',
        };
        set((state) => ({
          scheduleVersions: [...state.scheduleVersions, newVersion],
          currentVersionId: newVersion.id,
        }));
        return newVersion.id;
      },
      publishVersion: (versionId) => set((state) => ({
        scheduleVersions: state.scheduleVersions.map(v => ({
          ...v,
          status: v.id === versionId ? 'published' : 
            (v.status === 'published' ? 'draft' : v.status)
        }))
      })),
      setCurrentVersion: (versionId) => set({ currentVersionId: versionId }),

      authenticateAdmin: async (password) => {
        try {
          const { data, error } = await supabase.functions.invoke('verify-admin', {
            body: { password }
          });
          
          if (error) {
            console.error('Auth error:', error);
            return false;
          }
          
          if (data?.success) {
            set({ isAdminAuthenticated: true });
            return true;
          }
          return false;
        } catch (err) {
          console.error('Auth request failed:', err);
          return false;
        }
      },
      logoutAdmin: () => set({ isAdminAuthenticated: false }),
      
      // Validate merge before performing it
      validateMerge: (examId1, examId2, protocolistId, targetSlot) => {
        const state = get();
        const exam1 = state.exams.find(e => e.id === examId1);
        const exam2 = state.exams.find(e => e.id === examId2);
        
        if (!exam1 || !exam2 || exam1.degree !== exam2.degree) return null;
        
        const activeVersion = state.scheduleVersions.find(v => v.status === 'published') 
          || state.scheduleVersions[state.scheduleVersions.length - 1];
        if (!activeVersion) return null;
        
        const event1 = state.scheduledEvents.find(e => e.examId === examId1 && e.scheduleVersionId === activeVersion.id);
        const event2 = state.scheduledEvents.find(e => e.examId === examId2 && e.scheduleVersionId === activeVersion.id);
        if (!event1 || !event2) return null;
        
        const examinerIds = [...new Set([
          exam1.examiner1Id, exam1.examiner2Id,
          exam2.examiner1Id, exam2.examiner2Id
        ])].filter(Boolean).slice(0, 4);
        
        const durationMinutes = SLOT_DURATIONS[exam1.degree] * 2;
        const earlierEvent = event1.startTime <= event2.startTime ? event1 : event2;
        
        const slotToValidate = targetSlot || {
          dayDate: earlierEvent.dayDate,
          room: earlierEvent.room,
          startTime: earlierEvent.startTime,
        };
        
        const validation = validateMergeSlot(
          { ...slotToValidate, durationMinutes },
          examinerIds,
          protocolistId || event1.protocolistId || null,
          state.scheduledEvents.filter(e => e.scheduleVersionId === activeVersion.id),
          state.exams,
          state.staff,
          state.config,
          [event1.id, event2.id]
        );
        
        let alternativeSlots: MergeSlotOption[] = [];
        if (!validation.valid) {
          alternativeSlots = findAlternativeMergeSlots(
            durationMinutes,
            examinerIds,
            protocolistId || event1.protocolistId || null,
            state.scheduledEvents.filter(e => e.scheduleVersionId === activeVersion.id),
            state.exams,
            state.staff,
            state.config,
            [event1.id, event2.id],
            earlierEvent.dayDate
          );
        }
        
        return {
          validation,
          alternativeSlots,
          targetSlot: { ...slotToValidate, durationMinutes },
        };
      },
      
      // Merge two exams into a team colloquium with optional target slot
      mergeExams: (examId1, examId2, protocolistId, targetSlot) => {
        const state = get();
        const exam1 = state.exams.find(e => e.id === examId1);
        const exam2 = state.exams.find(e => e.id === examId2);
        
        if (!exam1 || !exam2) return null;
        if (exam1.degree !== exam2.degree) return null;
        
        const activeVersion = state.scheduleVersions.find(v => v.status === 'published') 
          || state.scheduleVersions[state.scheduleVersions.length - 1];
        if (!activeVersion) return null;
        
        const event1 = state.scheduledEvents.find(e => e.examId === examId1 && e.scheduleVersionId === activeVersion.id);
        const event2 = state.scheduledEvents.find(e => e.examId === examId2 && e.scheduleVersionId === activeVersion.id);
        
        if (!event1 || !event2) return null;
        
        const examinerIds = [...new Set([
          exam1.examiner1Id, exam1.examiner2Id,
          exam2.examiner1Id, exam2.examiner2Id
        ])].filter(Boolean).slice(0, 4);
        
        const durationMinutes = SLOT_DURATIONS[exam1.degree] * 2;
        
        // Use targetSlot if provided, otherwise use earlier event
        const earlierEvent = event1.startTime <= event2.startTime ? event1 : event2;
        const laterEvent = event1.startTime > event2.startTime ? event1 : event2;
        const finalSlot = targetSlot || {
          dayDate: earlierEvent.dayDate,
          room: earlierEvent.room,
          startTime: earlierEvent.startTime,
        };
        
        const startMinutes = parseInt(finalSlot.startTime.split(':')[0]) * 60 + parseInt(finalSlot.startTime.split(':')[1]);
        const endMinutes = startMinutes + durationMinutes;
        const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;
        
        const mergedExam: Exam = {
          id: crypto.randomUUID(),
          degree: exam1.degree,
          kompetenzfeld: exam1.kompetenzfeld || exam2.kompetenzfeld,
          studentName: `${exam1.studentName} & ${exam2.studentName}`,
          studentNames: [exam1.studentName, exam2.studentName],
          topic: exam1.topic === exam2.topic ? exam1.topic : `${exam1.topic} / ${exam2.topic}`,
          examiner1Id: examinerIds[0] || '',
          examiner2Id: examinerIds[1] || '',
          examinerIds,
          isPublic: exam1.isPublic && exam2.isPublic,
          isTeam: true,
          sourceExamIds: [examId1, examId2],
          durationMinutes,
        };
        
        const mergedEvent: ScheduledEvent = {
          id: crypto.randomUUID(),
          scheduleVersionId: activeVersion.id,
          examId: mergedExam.id,
          dayDate: finalSlot.dayDate,
          room: finalSlot.room,
          startTime: finalSlot.startTime,
          endTime,
          protocolistId: protocolistId || event1.protocolistId,
          status: 'scheduled',
          isTeam: true,
          durationMinutes,
        };
        
        // Re-optimize: try to fill the freed slot from the second (later) event
        const freedSlot = {
          dayDate: laterEvent.dayDate,
          room: laterEvent.room,
          startTime: laterEvent.startTime,
          endTime: laterEvent.endTime,
        };
        
        const versionEvents = state.scheduledEvents.filter(
          e => e.scheduleVersionId === activeVersion.id && e.id !== event1.id && e.id !== event2.id
        );
        
        const { movedEvents } = reoptimizeAfterMerge(
          freedSlot,
          versionEvents,
          state.exams,
          state.staff,
          state.roomMappings,
          state.config,
          activeVersion.id
        );
        
        // Apply updates
        set((state) => {
          let updatedEvents = state.scheduledEvents.filter(e => e.id !== event1.id && e.id !== event2.id);
          updatedEvents.push(mergedEvent);
          
          // Apply moved events
          for (const moved of movedEvents) {
            updatedEvents = updatedEvents.map(e => e.id === moved.id ? moved : e);
          }
          
          return {
            exams: [...state.exams, mergedExam],
            scheduledEvents: updatedEvents,
          };
        });
        
        return { mergedExam, mergedEvent, movedEvents };
      },

      getStaffById: (id) => get().staff.find(s => s.id === id),
      getExamById: (id) => get().exams.find(e => e.id === id),
      getPublishedEvents: () => {
        const publishedVersion = get().scheduleVersions.find(v => v.status === 'published');
        if (!publishedVersion) return [];
        return get().scheduledEvents.filter(e => e.scheduleVersionId === publishedVersion.id);
      },
      getEventsForVersion: (versionId) => 
        get().scheduledEvents.filter(e => e.scheduleVersionId === versionId),
      getEventForExam: (examId, versionId) => {
        const state = get();
        const version = versionId 
          || state.scheduleVersions.find(v => v.status === 'published')?.id
          || state.scheduleVersions[state.scheduleVersions.length - 1]?.id;
        return state.scheduledEvents.find(e => e.examId === examId && e.scheduleVersionId === version);
      },
    }),
    {
      name: 'kolloquium-storage',
      partialize: (state) => ({
        exams: state.exams,
        staff: state.staff,
        rooms: state.rooms,
        roomMappings: state.roomMappings,
        scheduledEvents: state.scheduledEvents,
        scheduleVersions: state.scheduleVersions,
        currentVersionId: state.currentVersionId,
        config: state.config,
        // Note: isAdminAuthenticated intentionally not persisted for security
      }),
    }
  )
);
