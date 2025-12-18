import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  Exam, 
  StaffMember, 
  Room, 
  RoomMapping, 
  ScheduledEvent, 
  ScheduleConfig,
  ScheduleVersion,
  ConflictReport 
} from '@/types';

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
  setRooms: (rooms: Room[]) => void;
  setRoomMappings: (mappings: RoomMapping[]) => void;
  updateRoomMapping: (mapping: RoomMapping) => void;
  setScheduledEvents: (events: ScheduledEvent[]) => void;
  updateScheduledEvent: (event: ScheduledEvent) => void;
  cancelEvent: (eventId: string, reason?: string) => void;
  setConfig: (config: Partial<ScheduleConfig>) => void;
  setConflicts: (conflicts: ConflictReport[]) => void;
  createScheduleVersion: () => string;
  publishVersion: (versionId: string) => void;
  setCurrentVersion: (versionId: string | null) => void;
  
  // Admin auth actions
  authenticateAdmin: (password: string) => boolean;
  logoutAdmin: () => void;
  
  // Helpers
  getStaffById: (id: string) => StaffMember | undefined;
  getExamById: (id: string) => Exam | undefined;
  getPublishedEvents: () => ScheduledEvent[];
  getEventsForVersion: (versionId: string) => ScheduledEvent[];
}

const ADMIN_PASSWORD = 'Admin123';

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
      setRooms: (rooms) => set({ rooms }),
      setRoomMappings: (mappings) => set({ roomMappings: mappings }),
      updateRoomMapping: (mapping) => set((state) => ({
        roomMappings: state.roomMappings.some(m => m.id === mapping.id)
          ? state.roomMappings.map(m => m.id === mapping.id ? mapping : m)
          : [...state.roomMappings, mapping]
      })),
      setScheduledEvents: (events) => set({ scheduledEvents: events }),
      updateScheduledEvent: (event) => set((state) => ({
        scheduledEvents: state.scheduledEvents.map(e => 
          e.id === event.id ? event : e
        )
      })),
      cancelEvent: (eventId, reason) => set((state) => ({
        scheduledEvents: state.scheduledEvents.map(e => 
          e.id === eventId 
            ? { ...e, status: 'cancelled' as const, cancelledReason: reason }
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

      authenticateAdmin: (password) => {
        const isValid = password === ADMIN_PASSWORD;
        if (isValid) {
          set({ isAdminAuthenticated: true });
        }
        return isValid;
      },
      logoutAdmin: () => set({ isAdminAuthenticated: false }),

      getStaffById: (id) => get().staff.find(s => s.id === id),
      getExamById: (id) => get().exams.find(e => e.id === id),
      getPublishedEvents: () => {
        const publishedVersion = get().scheduleVersions.find(v => v.status === 'published');
        if (!publishedVersion) return [];
        return get().scheduledEvents.filter(e => e.scheduleVersionId === publishedVersion.id);
      },
      getEventsForVersion: (versionId) => 
        get().scheduledEvents.filter(e => e.scheduleVersionId === versionId),
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
