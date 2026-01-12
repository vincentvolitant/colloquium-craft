import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  loadAllFromSupabase,
  saveStaff,
  updateStaffMember,
  saveExams,
  saveRooms,
  saveRoomMappings,
  saveConfig,
  saveVersion,
  updateVersionStatus,
  unpublishAllVersions,
  saveScheduledEvents,
  upsertScheduledEvent,
  deleteScheduledEvents,
} from '@/lib/supabaseSync';
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
} from '@/types';
import { SLOT_DURATIONS } from '@/types';
import {
  validateMergeSlot,
  findAlternativeMergeSlots,
  reoptimizeAfterMerge,
  type MergeValidationResult,
  type MergeSlotOption,
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

  // Loading state
  isLoading: boolean;
  isInitialized: boolean;

  // Admin auth
  isAdminAuthenticated: boolean;

  // Actions
  initializeFromSupabase: () => Promise<void>;
  setExams: (exams: Exam[]) => void;
  addExams: (exams: Exam[]) => void;
  setStaff: (staff: StaffMember[]) => void;
  addOrUpdateStaff: (newStaff: StaffMember[], resetAvailability?: boolean) => void;
  updateStaffAvailability: (staffId: string, override: AvailabilityOverride | undefined) => void;
  updateStaffProtocolStatus: (staffId: string, canDoProtocol: boolean) => void;
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
  validateMerge: (
    examId1: string,
    examId2: string,
    protocolistId?: string,
    targetSlot?: { dayDate: string; room: string; startTime: string }
  ) => {
    validation: MergeValidationResult;
    alternativeSlots: MergeSlotOption[];
    targetSlot: { dayDate: string; room: string; startTime: string; durationMinutes: number } | null;
  } | null;
  mergeExams: (
    examId1: string,
    examId2: string,
    protocolistId?: string,
    targetSlot?: { dayDate: string; room: string; startTime: string }
  ) => {
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

export const useScheduleStore = create<ScheduleState>()((set, get) => ({
  exams: [],
  staff: [],
  rooms: [],
  roomMappings: [],
  scheduledEvents: [],
  scheduleVersions: [],
  currentVersionId: null,
  config: defaultConfig,
  conflicts: [],
  isLoading: false,
  isInitialized: false,
  isAdminAuthenticated: false,

  initializeFromSupabase: async () => {
    if (get().isInitialized || get().isLoading) return;
    set({ isLoading: true });

    try {
      const data = await loadAllFromSupabase();
      set({
        staff: data.staff,
        exams: data.exams,
        rooms: data.rooms,
        roomMappings: data.roomMappings,
        config: data.config,
        scheduleVersions: data.scheduleVersions,
        scheduledEvents: data.scheduledEvents,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to initialize from Supabase:', error);
      set({ isLoading: false });
    }
  },

  setExams: (exams) => {
    set({ exams });
    saveExams(exams);
  },
  addExams: (newExams) => {
    const updated = [...get().exams, ...newExams];
    set({ exams: updated });
    saveExams(updated);
  },
  setStaff: (staff) => {
    set({ staff });
    saveStaff(staff);
  },
  addOrUpdateStaff: (newStaff, resetAvailability = false) => {
    const normalizedName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
    const existingMap = new Map(get().staff.map((s) => [normalizedName(s.name), s]));

    for (const newMember of newStaff) {
      const key = normalizedName(newMember.name);
      const existing = existingMap.get(key);

      if (existing) {
        existingMap.set(key, {
          ...existing,
          ...newMember,
          id: existing.id,
          availabilityOverride: resetAvailability ? undefined : existing.availabilityOverride,
        });
      } else {
        existingMap.set(key, newMember);
      }
    }

    const updated = Array.from(existingMap.values());
    set({ staff: updated });
    saveStaff(updated);
  },
  updateStaffAvailability: (staffId, override) => {
    const updated = get().staff.map((s) => (s.id === staffId ? { ...s, availabilityOverride: override } : s));
    set({ staff: updated });
    const member = updated.find((s) => s.id === staffId);
    if (member) updateStaffMember(member);
  },
  updateStaffProtocolStatus: (staffId, canDoProtocol) => {
    const updated = get().staff.map((s) => 
      s.id === staffId 
        ? { ...s, canDoProtocol, canProtocol: s.employmentType === 'internal' && canDoProtocol } 
        : s
    );
    set({ staff: updated });
    const member = updated.find((s) => s.id === staffId);
    if (member) updateStaffMember(member);
  },
  setRooms: (rooms) => {
    set({ rooms });
    saveRooms(rooms);
  },
  setRoomMappings: (mappings) => {
    set({ roomMappings: mappings });
    saveRoomMappings(mappings);
  },
  updateRoomMapping: (mapping) => {
    const updated = get().roomMappings.some((m) => m.id === mapping.id)
      ? get().roomMappings.map((m) => (m.id === mapping.id ? mapping : m))
      : [...get().roomMappings, mapping];
    set({ roomMappings: updated });
    saveRoomMappings(updated);
  },
  setScheduledEvents: (events) => {
    set({ scheduledEvents: events });
    saveScheduledEvents(events);
  },
  addScheduledEvents: (newEvents) => {
    const updated = [...get().scheduledEvents, ...newEvents];
    set({ scheduledEvents: updated });
    saveScheduledEvents(updated);
  },
  updateScheduledEvent: (event) => {
    const updated = get().scheduledEvents.map((e) => (e.id === event.id ? event : e));
    set({ scheduledEvents: updated });
    upsertScheduledEvent(event);
  },
  removeScheduledEvents: (eventIds) => {
    const updated = get().scheduledEvents.filter((e) => !eventIds.includes(e.id));
    set({ scheduledEvents: updated });
    deleteScheduledEvents(eventIds);
  },
  cancelEvent: (eventId, reason) => {
    const updated = get().scheduledEvents.map((e) =>
      e.id === eventId
        ? {
            ...e,
            status: 'cancelled' as const,
            cancelledReason: reason,
            cancelledAt: new Date().toISOString(),
          }
        : e
    );
    set({ scheduledEvents: updated });
    const event = updated.find((e) => e.id === eventId);
    if (event) upsertScheduledEvent(event);
  },
  setConfig: (config) => {
    const updated = { ...get().config, ...config };
    set({ config: updated });
    saveConfig(updated);
  },
  setConflicts: (conflicts) => set({ conflicts }),
  createScheduleVersion: () => {
    const newVersion: ScheduleVersion = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      status: 'draft',
    };
    const updated = [...get().scheduleVersions, newVersion];
    set({
      scheduleVersions: updated,
      currentVersionId: newVersion.id,
    });
    saveVersion(newVersion);
    return newVersion.id;
  },
  publishVersion: async (versionId) => {
    // Unpublish all, then publish this one
    await unpublishAllVersions();
    await updateVersionStatus(versionId, 'published');
    set({
      scheduleVersions: get().scheduleVersions.map((v) => ({
        ...v,
        status: v.id === versionId ? 'published' : 'draft',
      })),
    });
  },
  setCurrentVersion: (versionId) => set({ currentVersionId: versionId }),

  authenticateAdmin: async (password) => {
    try {
      const { data, error } = await supabase.functions.invoke('verify-admin', {
        body: { password },
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

  validateMerge: (examId1, examId2, protocolistId, targetSlot) => {
    const state = get();
    const exam1 = state.exams.find((e) => e.id === examId1);
    const exam2 = state.exams.find((e) => e.id === examId2);

    if (!exam1 || !exam2 || exam1.degree !== exam2.degree) return null;

    const activeVersion =
      state.scheduleVersions.find((v) => v.status === 'published') ||
      state.scheduleVersions[state.scheduleVersions.length - 1];
    if (!activeVersion) return null;

    const event1 = state.scheduledEvents.find((e) => e.examId === examId1 && e.scheduleVersionId === activeVersion.id);
    const event2 = state.scheduledEvents.find((e) => e.examId === examId2 && e.scheduleVersionId === activeVersion.id);
    if (!event1 || !event2) return null;

    const examinerIds = [...new Set([exam1.examiner1Id, exam1.examiner2Id, exam2.examiner1Id, exam2.examiner2Id])]
      .filter(Boolean)
      .slice(0, 4);

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
      state.scheduledEvents.filter((e) => e.scheduleVersionId === activeVersion.id),
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
        state.scheduledEvents.filter((e) => e.scheduleVersionId === activeVersion.id),
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

  mergeExams: (examId1, examId2, protocolistId, targetSlot) => {
    const state = get();
    const exam1 = state.exams.find((e) => e.id === examId1);
    const exam2 = state.exams.find((e) => e.id === examId2);

    if (!exam1 || !exam2) return null;
    if (exam1.degree !== exam2.degree) return null;

    const activeVersion =
      state.scheduleVersions.find((v) => v.status === 'published') ||
      state.scheduleVersions[state.scheduleVersions.length - 1];
    if (!activeVersion) return null;

    const event1 = state.scheduledEvents.find((e) => e.examId === examId1 && e.scheduleVersionId === activeVersion.id);
    const event2 = state.scheduledEvents.find((e) => e.examId === examId2 && e.scheduleVersionId === activeVersion.id);

    if (!event1 || !event2) return null;

    const examinerIds = [...new Set([exam1.examiner1Id, exam1.examiner2Id, exam2.examiner1Id, exam2.examiner2Id])]
      .filter(Boolean)
      .slice(0, 4);

    const durationMinutes = SLOT_DURATIONS[exam1.degree] * 2;

    const earlierEvent = event1.startTime <= event2.startTime ? event1 : event2;
    const laterEvent = event1.startTime > event2.startTime ? event1 : event2;
    const finalSlot = targetSlot || {
      dayDate: earlierEvent.dayDate,
      room: earlierEvent.room,
      startTime: earlierEvent.startTime,
    };

    const startMinutes = parseInt(finalSlot.startTime.split(':')[0]) * 60 + parseInt(finalSlot.startTime.split(':')[1]);
    const endMinutes = startMinutes + durationMinutes;
    const endTime = `${Math.floor(endMinutes / 60)
      .toString()
      .padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

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

    const freedSlot = {
      dayDate: laterEvent.dayDate,
      room: laterEvent.room,
      startTime: laterEvent.startTime,
      endTime: laterEvent.endTime,
    };

    const versionEvents = state.scheduledEvents.filter(
      (e) => e.scheduleVersionId === activeVersion.id && e.id !== event1.id && e.id !== event2.id
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

    let updatedEvents = state.scheduledEvents.filter((e) => e.id !== event1.id && e.id !== event2.id);
    updatedEvents.push(mergedEvent);

    for (const moved of movedEvents) {
      updatedEvents = updatedEvents.map((e) => (e.id === moved.id ? moved : e));
    }

    const updatedExams = [...state.exams, mergedExam];

    set({
      exams: updatedExams,
      scheduledEvents: updatedEvents,
    });

    // Save to Supabase
    saveExams(updatedExams);
    saveScheduledEvents(updatedEvents);

    return { mergedExam, mergedEvent, movedEvents };
  },

  getStaffById: (id) => get().staff.find((s) => s.id === id),
  getExamById: (id) => get().exams.find((e) => e.id === id),
  getPublishedEvents: () => {
    const publishedVersion = get().scheduleVersions.find((v) => v.status === 'published');
    if (!publishedVersion) return [];
    return get().scheduledEvents.filter((e) => e.scheduleVersionId === publishedVersion.id);
  },
  getEventsForVersion: (versionId) => get().scheduledEvents.filter((e) => e.scheduleVersionId === versionId),
  getEventForExam: (examId, versionId) => {
    const state = get();
    const version =
      versionId ||
      state.scheduleVersions.find((v) => v.status === 'published')?.id ||
      state.scheduleVersions[state.scheduleVersions.length - 1]?.id;
    return state.scheduledEvents.find((e) => e.examId === examId && e.scheduleVersionId === version);
  },
}));
