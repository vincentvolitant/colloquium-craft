// Supabase sync utilities for schedule data
import { supabase } from '@/integrations/supabase/client';
import { getAdminPassword } from '@/lib/adminSession';
import type {
  Exam,
  StaffMember,
  Room,
  RoomMapping,
  ScheduledEvent,
  ScheduleConfig,
  ScheduleVersion,
  AvailabilityOverride,
} from '@/types';

// ============ ADMIN WRITE PROXY ============
// All writes go through the `admin-db` edge function, which validates the
// admin password and performs the change using the service role. Anonymous
// browsers can no longer write directly to the database.

type AdminOp =
  | { kind: 'upsert'; table: string; rows: Record<string, unknown>[] }
  | {
      kind: 'update';
      table: string;
      values: Record<string, unknown>;
      match?: Record<string, unknown>;
      eqStatus?: string;
    }
  | {
      kind: 'delete';
      table: string;
      match?: Record<string, unknown>;
      neqId?: string;
      inIds?: string[];
    };

async function adminWrite(ops: AdminOp[]): Promise<void> {
  const password = getAdminPassword();
  if (!password) {
    console.error('adminWrite called without an authenticated admin session');
    throw new Error('Nicht als Admin angemeldet');
  }
  const { data, error } = await supabase.functions.invoke('admin-db', {
    body: { password, ops },
  });
  if (error) {
    console.error('admin-db invocation failed:', error);
    throw error;
  }
  if (!data?.success) {
    console.error('admin-db returned error:', data?.error);
    throw new Error(data?.error || 'Speichern fehlgeschlagen');
  }
}

// Columns that the public/anon role is allowed to read on `exams`.
// `student_email` is intentionally excluded.
const PUBLIC_EXAM_COLUMNS =
  'id, degree, kompetenzfeld, student_first_name, student_last_name, topic, examiner1_id, examiner2_id, is_team, team_partner_first_name, team_partner_last_name, is_public, created_at, updated_at';



// ============ TYPE MAPPERS ============

// Map database staff row to StaffMember type
function mapDbStaff(row: {
  id: string;
  name: string;
  competence_fields: string[];
  employment_type: string;
  availability_override: unknown;
  can_do_protocol?: boolean;
}): StaffMember {
  const override = row.availability_override as AvailabilityOverride | null;
  const isInternal = row.employment_type === 'internal';
  // canDoProtocol from DB, default true for internal, false for external/adjunct
  const canDoProtocol = row.can_do_protocol ?? isInternal;
  return {
    id: row.id,
    name: row.name,
    competenceFields: row.competence_fields || [],
    primaryCompetenceField: row.competence_fields?.[0] || null,
    employmentType: row.employment_type as 'internal' | 'external' | 'adjunct',
    canExamine: true,
    canDoProtocol,
    // Combined rule: internal AND canDoProtocol
    canProtocol: isInternal && canDoProtocol,
    availabilityOverride: override || undefined,
  };
}

// Map StaffMember to database row
function mapStaffToDb(staff: StaffMember): {
  id: string;
  name: string;
  competence_fields: string[];
  employment_type: string;
  availability_override: Record<string, unknown> | null;
  can_do_protocol: boolean;
} {
  return {
    id: staff.id,
    name: staff.name,
    competence_fields: staff.competenceFields,
    employment_type: staff.employmentType,
    availability_override: staff.availabilityOverride
      ? (JSON.parse(JSON.stringify(staff.availabilityOverride)) as Record<string, unknown>)
      : null,
    can_do_protocol: staff.canDoProtocol ?? (staff.employmentType === 'internal'),
  };
}

// Map database exam row to Exam type
function mapDbExam(row: {
  id: string;
  degree: string;
  kompetenzfeld: string;
  student_first_name: string;
  student_last_name: string;
  student_email?: string | null;
  topic: string;
  examiner1_id: string | null;
  examiner2_id: string | null;
  is_team: boolean;
  team_partner_first_name: string | null;
  team_partner_last_name: string | null;
  is_public?: boolean;
}): Exam {

  const studentName = [row.student_first_name, row.student_last_name].filter(Boolean).join(' ');
  const teamPartnerName = row.is_team && row.team_partner_first_name
    ? [row.team_partner_first_name, row.team_partner_last_name].filter(Boolean).join(' ')
    : null;

  return {
    id: row.id,
    degree: row.degree as 'BA' | 'MA',
    kompetenzfeld: row.kompetenzfeld,
    studentName,
    studentFirstName: row.student_first_name,
    studentLastName: row.student_last_name,
    topic: row.topic,
    examiner1Id: row.examiner1_id || '',
    examiner2Id: row.examiner2_id || '',
    isPublic: row.is_public ?? true,
    isTeam: row.is_team,
    studentNames: row.is_team && teamPartnerName ? [studentName, teamPartnerName] : undefined,
  };
}

// Map Exam to database row
function mapExamToDb(exam: Exam) {
  const names = exam.studentName.split(' ');
  const firstName = exam.studentFirstName || names[0] || '';
  const lastName = exam.studentLastName || names.slice(1).join(' ') || '';

  let teamPartnerFirst: string | null = null;
  let teamPartnerLast: string | null = null;
  if (exam.isTeam && exam.studentNames && exam.studentNames.length > 1) {
    const partnerParts = exam.studentNames[1].split(' ');
    teamPartnerFirst = partnerParts[0] || null;
    teamPartnerLast = partnerParts.slice(1).join(' ') || null;
  }

  return {
    id: exam.id,
    degree: exam.degree,
    kompetenzfeld: exam.kompetenzfeld || '',
    student_first_name: firstName,
    student_last_name: lastName,
    student_email: null,
    topic: exam.topic,
    examiner1_id: exam.examiner1Id || null,
    examiner2_id: exam.examiner2Id || null,
    is_team: exam.isTeam || false,
    team_partner_first_name: teamPartnerFirst,
    team_partner_last_name: teamPartnerLast,
    is_public: exam.isPublic ?? true,
  };
}

// Map database room to Room type
function mapDbRoom(row: { id: string; name: string }): Room {
  return { id: row.id, name: row.name };
}

// Map database room_mapping to RoomMapping
function mapDbRoomMapping(row: {
  id: string;
  degree_scope: string;
  kompetenzfeld: string;
  room_names: string[];
}): RoomMapping {
  return {
    id: row.id,
    degreeScope: row.degree_scope as 'BA' | 'MA',
    kompetenzfeld: row.kompetenzfeld,
    rooms: row.room_names || [],
  };
}

// Map RoomMapping to database row
function mapRoomMappingToDb(mapping: RoomMapping) {
  return {
    id: mapping.id,
    degree_scope: mapping.degreeScope,
    kompetenzfeld: mapping.kompetenzfeld,
    room_names: mapping.rooms,
  };
}

// Map database schedule_config to ScheduleConfig
function mapDbConfig(row: {
  days: string[];
  start_time: string;
  end_time: string;
  ba_slot_minutes: number;
  ma_slot_minutes: number;
}, rooms: Room[]): ScheduleConfig {
  return {
    days: row.days || [],
    rooms,
    startTime: row.start_time?.substring(0, 5) || '09:00',
    endTime: row.end_time?.substring(0, 5) || '18:00',
    baSlotMinutes: row.ba_slot_minutes,
    maSlotMinutes: row.ma_slot_minutes,
  };
}

// Map database schedule_version to ScheduleVersion
function mapDbVersion(row: {
  id: string;
  status: string;
  notes: string | null;
  created_at: string;
}): ScheduleVersion {
  return {
    id: row.id,
    status: row.status as 'draft' | 'published',
    notes: row.notes || undefined,
    createdAt: new Date(row.created_at),
  };
}

// Map ScheduleVersion to database row
function mapVersionToDb(version: ScheduleVersion) {
  return {
    id: version.id,
    status: version.status,
    notes: version.notes || null,
  };
}

// Map database scheduled_event to ScheduledEvent
function mapDbEvent(row: {
  id: string;
  schedule_version_id: string;
  exam_id: string;
  day_date: string;
  room: string;
  start_time: string;
  end_time: string;
  protocolist_id: string | null;
  status: string;
  cancellation_reason: string | null;
}): ScheduledEvent {
  return {
    id: row.id,
    scheduleVersionId: row.schedule_version_id,
    examId: row.exam_id,
    dayDate: row.day_date,
    room: row.room,
    startTime: row.start_time?.substring(0, 5) || '',
    endTime: row.end_time?.substring(0, 5) || '',
    protocolistId: row.protocolist_id || '',
    status: row.status as 'scheduled' | 'cancelled',
    cancelledReason: row.cancellation_reason || undefined,
  };
}

// Map ScheduledEvent to database row
function mapEventToDb(event: ScheduledEvent) {
  return {
    id: event.id,
    schedule_version_id: event.scheduleVersionId,
    exam_id: event.examId,
    day_date: event.dayDate,
    room: event.room,
    start_time: event.startTime,
    end_time: event.endTime,
    protocolist_id: event.protocolistId || null,
    status: event.status,
    cancellation_reason: event.cancelledReason || null,
  };
}

// ============ LOAD FROM SUPABASE ============

export async function loadAllFromSupabase() {
  const [
    { data: staffData, error: staffError },
    { data: examsData, error: examsError },
    { data: roomsData, error: roomsError },
    { data: roomMappingsData, error: mappingsError },
    { data: configData, error: configError },
    { data: versionsData, error: versionsError },
    { data: eventsData, error: eventsError },
  ] = await Promise.all([
    supabase.from('staff').select('*'),
    supabase.from('exams').select(PUBLIC_EXAM_COLUMNS),
    supabase.from('rooms').select('*'),
    supabase.from('room_mappings').select('*'),
    supabase.from('schedule_config').select('*').limit(1),
    supabase.from('schedule_versions').select('*').order('created_at', { ascending: true }),
    supabase.from('scheduled_events').select('*'),
  ]);


  if (staffError) console.error('Error loading staff:', staffError);
  if (examsError) console.error('Error loading exams:', examsError);
  if (roomsError) console.error('Error loading rooms:', roomsError);
  if (mappingsError) console.error('Error loading room mappings:', mappingsError);
  if (configError) console.error('Error loading config:', configError);
  if (versionsError) console.error('Error loading versions:', versionsError);
  if (eventsError) console.error('Error loading events:', eventsError);

  const rooms = (roomsData || []).map(mapDbRoom);
  const configRow = configData?.[0];
  const config: ScheduleConfig = configRow
    ? mapDbConfig(configRow as Parameters<typeof mapDbConfig>[0], rooms)
    : {
        days: [],
        rooms,
        startTime: '09:00',
        endTime: '18:00',
        baSlotMinutes: 50,
        maSlotMinutes: 75,
      };

  return {
    staff: (staffData || []).map((row) => mapDbStaff(row as Parameters<typeof mapDbStaff>[0])),
    exams: (examsData || []).map((row) => mapDbExam(row as Parameters<typeof mapDbExam>[0])),
    rooms,
    roomMappings: (roomMappingsData || []).map((row) => mapDbRoomMapping(row as Parameters<typeof mapDbRoomMapping>[0])),
    config,
    scheduleVersions: (versionsData || []).map((row) => mapDbVersion(row as Parameters<typeof mapDbVersion>[0])),
    scheduledEvents: (eventsData || []).map((row) => mapDbEvent(row as Parameters<typeof mapDbEvent>[0])),
  };
}

// ============ SAVE TO SUPABASE (via admin-db edge function) ============


const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export async function saveStaff(staff: StaffMember[]) {
  const ops: AdminOp[] = [
    { kind: 'delete', table: 'staff', neqId: NIL_UUID },
  ];
  if (staff.length > 0) {
    ops.push({ kind: 'upsert', table: 'staff', rows: staff.map(mapStaffToDb) });
  }
  await adminWrite(ops);
}

export async function updateStaffMember(staff: StaffMember) {
  await adminWrite([{ kind: 'upsert', table: 'staff', rows: [mapStaffToDb(staff)] }]);
}

export async function saveExams(exams: Exam[]) {
  const ops: AdminOp[] = [
    { kind: 'delete', table: 'exams', neqId: NIL_UUID },
  ];
  if (exams.length > 0) {
    ops.push({ kind: 'upsert', table: 'exams', rows: exams.map(mapExamToDb) });
  }
  await adminWrite(ops);
}

export async function saveRooms(rooms: Room[]) {
  const ops: AdminOp[] = [
    { kind: 'delete', table: 'rooms', neqId: NIL_UUID },
  ];
  if (rooms.length > 0) {
    ops.push({
      kind: 'upsert',
      table: 'rooms',
      rows: rooms.map((r) => ({ id: r.id, name: r.name })),
    });
  }
  await adminWrite(ops);
}

export async function saveRoomMappings(mappings: RoomMapping[]) {
  const ops: AdminOp[] = [
    { kind: 'delete', table: 'room_mappings', neqId: NIL_UUID },
  ];
  if (mappings.length > 0) {
    ops.push({
      kind: 'upsert',
      table: 'room_mappings',
      rows: mappings.map(mapRoomMappingToDb),
    });
  }
  await adminWrite(ops);
}

export async function saveConfig(config: ScheduleConfig) {
  // Read current id (public read is still allowed)
  const { data: existing } = await supabase.from('schedule_config').select('id').limit(1);
  const id = existing?.[0]?.id || crypto.randomUUID();
  await adminWrite([
    {
      kind: 'upsert',
      table: 'schedule_config',
      rows: [
        {
          id,
          days: config.days,
          start_time: config.startTime,
          end_time: config.endTime,
          ba_slot_minutes: config.baSlotMinutes,
          ma_slot_minutes: config.maSlotMinutes,
        },
      ],
    },
  ]);
}

export async function saveVersion(version: ScheduleVersion) {
  await adminWrite([
    { kind: 'upsert', table: 'schedule_versions', rows: [mapVersionToDb(version)] },
  ]);
}

export async function updateVersionStatus(versionId: string, status: 'draft' | 'published') {
  await adminWrite([
    {
      kind: 'update',
      table: 'schedule_versions',
      values: { status },
      match: { id: versionId },
    },
  ]);
}

export async function unpublishAllVersions() {
  await adminWrite([
    {
      kind: 'update',
      table: 'schedule_versions',
      values: { status: 'draft' },
      eqStatus: 'published',
    },
  ]);
}

export async function saveScheduledEvents(events: ScheduledEvent[]) {
  const ops: AdminOp[] = [
    { kind: 'delete', table: 'scheduled_events', neqId: NIL_UUID },
  ];
  if (events.length > 0) {
    ops.push({
      kind: 'upsert',
      table: 'scheduled_events',
      rows: events.map(mapEventToDb),
    });
  }
  await adminWrite(ops);
}

export async function upsertScheduledEvent(event: ScheduledEvent) {
  await adminWrite([
    { kind: 'upsert', table: 'scheduled_events', rows: [mapEventToDb(event)] },
  ]);
}

export async function deleteScheduledEvents(eventIds: string[]) {
  if (eventIds.length === 0) return;
  await adminWrite([
    { kind: 'delete', table: 'scheduled_events', inIds: eventIds },
  ]);
}

export async function upsertExam(exam: Exam) {
  await adminWrite([{ kind: 'upsert', table: 'exams', rows: [mapExamToDb(exam)] }]);
}
