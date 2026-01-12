import * as XLSX from 'xlsx';
import type { Exam, StaffMember, Degree, EmploymentType } from '@/types';
import { getExamDisplayNames, getAllExaminerIds } from '@/types';

export interface ParsedSheet {
  name: string;
  headers: string[];
  data: Record<string, unknown>[];
}

export interface ExamColumnMapping {
  degree?: string;
  kompetenzfeld?: string;
  studentName?: string;
  studentFirstName?: string;
  studentLastName?: string;
  studentId?: string;
  topic?: string;
  examiner1?: string;
  examiner2?: string;
  isPublic?: string;
  notes?: string;
}

// New simplified staff mapping - only master data, no availability
export interface StaffColumnMapping {
  name?: string;
  employmentType?: string;
  primaryCompetenceField?: string;
  secondaryCompetenceFields?: string;
  notes?: string;
}

export async function parseExcelFile(file: File): Promise<ParsedSheet[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  const sheets: ParsedSheet[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
    
    if (jsonData.length === 0) continue;
    
    const headers = (jsonData[0] as string[]).map(h => String(h || '').trim());
    const data: Record<string, unknown>[] = [];
    
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i] as unknown[];
      if (!row || row.every(cell => cell === null || cell === undefined || cell === '')) continue;
      
      const rowObj: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        if (header) {
          rowObj[header] = row[idx];
        }
      });
      data.push(rowObj);
    }
    
    sheets.push({ name: sheetName, headers, data });
  }
  
  return sheets;
}

export function autoDetectExamMapping(headers: string[]): ExamColumnMapping {
  const mapping: ExamColumnMapping = {};
  const lowerHeaders = headers.map(h => h.toLowerCase());
  
  // Degree detection
  const degreePatterns = ['degree', 'abschluss', 'studiengang', 'ba/ma', 'type'];
  mapping.degree = headers.find((_, i) => 
    degreePatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Kompetenzfeld
  const kfPatterns = ['kompetenzfeld', 'competence', 'feld', 'bereich', 'field'];
  mapping.kompetenzfeld = headers.find((_, i) => 
    kfPatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Student name - try to detect first/last name columns
  const firstNamePatterns = ['vorname', 'first name', 'firstname', 'given name'];
  const lastNamePatterns = ['nachname', 'familienname', 'family name', 'lastname', 'surname'];
  const fullNamePatterns = ['name', 'student', 'kandidat', 'prüfling'];
  
  mapping.studentFirstName = headers.find((_, i) => 
    firstNamePatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  mapping.studentLastName = headers.find((_, i) => 
    lastNamePatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Only use full name if first/last not found
  if (!mapping.studentFirstName && !mapping.studentLastName) {
    mapping.studentName = headers.find((_, i) => 
      fullNamePatterns.some(p => lowerHeaders[i].includes(p)) && 
      !lowerHeaders[i].includes('prüfer') &&
      !lowerHeaders[i].includes('examiner')
    );
  }
  
  // Student ID
  const idPatterns = ['matrikel', 'mtknr', 'id', 'nummer'];
  mapping.studentId = headers.find((_, i) => 
    idPatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Topic
  const topicPatterns = ['thema', 'topic', 'titel', 'title', 'arbeit'];
  mapping.topic = headers.find((_, i) => 
    topicPatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Examiners
  const examiner1Patterns = ['prüfer 1', 'prüfer1', 'examiner 1', 'erstprüfer', 'betreuer'];
  const examiner2Patterns = ['prüfer 2', 'prüfer2', 'examiner 2', 'zweitprüfer', 'zweitgutachter'];
  
  mapping.examiner1 = headers.find((_, i) => 
    examiner1Patterns.some(p => lowerHeaders[i].includes(p))
  ) || headers.find((_, i) => lowerHeaders[i].includes('prüfer') && !lowerHeaders[i].includes('2'));
  
  mapping.examiner2 = headers.find((_, i) => 
    examiner2Patterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Public flag
  const publicPatterns = ['öffentlich', 'public', 'ohne öffentlichkeit', 'nicht öffentlich', 'not public'];
  mapping.isPublic = headers.find((_, i) => 
    publicPatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Notes
  const notesPatterns = ['notiz', 'note', 'bemerkung', 'comment', 'anmerkung'];
  mapping.notes = headers.find((_, i) => 
    notesPatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  return mapping;
}

export function autoDetectStaffMapping(headers: string[]): StaffColumnMapping {
  const mapping: StaffColumnMapping = {};
  const lowerHeaders = headers.map(h => h.toLowerCase());
  
  // Name (inkl. Titel)
  const namePatterns = ['name', 'dozent', 'mitarbeiter', 'person', 'titel'];
  mapping.name = headers.find((_, i) => 
    namePatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Beschäftigungsart (Intern / Extern / Lehrbeauftragt)
  const employmentPatterns = ['beschäftigungsart', 'status', 'employment', 'anstellung', 'typ', 'type', 'extern', 'art'];
  mapping.employmentType = headers.find((_, i) => 
    employmentPatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Primäres Kompetenzfeld
  const primaryKfPatterns = ['primär', 'primary', 'haupt'];
  const kfPatterns = ['kompetenzfeld', 'competence', 'feld', 'bereich'];
  mapping.primaryCompetenceField = headers.find((_, i) => 
    primaryKfPatterns.some(p => lowerHeaders[i].includes(p)) &&
    kfPatterns.some(p => lowerHeaders[i].includes(p))
  ) || headers.find((_, i) => 
    kfPatterns.some(p => lowerHeaders[i].includes(p)) && !lowerHeaders[i].includes('sekundär')
  );
  
  // Sekundäre Kompetenzfelder
  const secondaryKfPatterns = ['sekundär', 'secondary', 'weitere', 'other'];
  mapping.secondaryCompetenceFields = headers.find((_, i) => 
    secondaryKfPatterns.some(p => lowerHeaders[i].includes(p)) ||
    (kfPatterns.some(p => lowerHeaders[i].includes(p)) && lowerHeaders[i].includes('sekundär'))
  );
  
  // Hinweise/Notes
  const notesPatterns = ['hinweis', 'note', 'bemerkung', 'comment', 'anmerkung'];
  mapping.notes = headers.find((_, i) => 
    notesPatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  return mapping;
}

const NOT_PUBLIC_MARKERS = [
  'not public', 'nicht öffentlich', 'ohne öffentlichkeit', 
  'private', 'no', 'nein', 'x', '1', 'true'
];

export function parseExams(
  data: Record<string, unknown>[],
  mapping: ExamColumnMapping,
  defaultDegree?: Degree,
  staffList?: StaffMember[]
): { exams: Exam[]; warnings: string[] } {
  const exams: Exam[] = [];
  const warnings: string[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    
    // Parse degree
    let degree: Degree = defaultDegree || 'BA';
    if (mapping.degree && row[mapping.degree]) {
      const degreeVal = String(row[mapping.degree]).toUpperCase().trim();
      if (degreeVal.includes('MA') || degreeVal.includes('MASTER')) {
        degree = 'MA';
      } else if (degreeVal.includes('BA') || degreeVal.includes('BACHELOR')) {
        degree = 'BA';
      }
    }
    
    // Parse student name - support both combined and separate first/last name
    const studentFirstName = mapping.studentFirstName ? String(row[mapping.studentFirstName] || '').trim() : undefined;
    const studentLastName = mapping.studentLastName ? String(row[mapping.studentLastName] || '').trim() : undefined;
    const studentNameCombined = mapping.studentName ? String(row[mapping.studentName] || '').trim() : '';
    
    // Build display name from parts if available
    const studentName = (studentFirstName || studentLastName) 
      ? [studentFirstName, studentLastName].filter(Boolean).join(' ')
      : studentNameCombined;
    
    if (!studentName) {
      warnings.push(`Row ${i + 2}: Missing student name, skipping`);
      continue;
    }
    
    // Parse topic
    const topic = mapping.topic ? String(row[mapping.topic] || '').trim() : '';
    if (!topic) {
      warnings.push(`Row ${i + 2}: Missing topic for ${studentName}`);
    }
    
    // Parse kompetenzfeld
    const kompetenzfeld = mapping.kompetenzfeld 
      ? String(row[mapping.kompetenzfeld] || '').trim() || null
      : null;
    
    if (degree === 'BA' && !kompetenzfeld) {
      warnings.push(`Row ${i + 2}: BA exam for ${studentName} missing Kompetenzfeld`);
    }
    
    // Parse examiners - find or create staff IDs
    const examiner1Name = mapping.examiner1 ? String(row[mapping.examiner1] || '').trim() : '';
    const examiner2Name = mapping.examiner2 ? String(row[mapping.examiner2] || '').trim() : '';
    
    const findStaffId = (name: string, rowNum: number, examinerNum: number): string => {
      if (!name) return '';
      if (staffList && staffList.length > 0) {
        // Try exact match first
        let found = staffList.find(s => 
          s.name.toLowerCase() === name.toLowerCase()
        );
        
        // Try partial match (name contains or is contained)
        if (!found) {
          found = staffList.find(s => 
            s.name.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(s.name.toLowerCase())
          );
        }
        
        // Try matching by last name only
        if (!found) {
          const nameParts = name.split(/\s+/);
          const lastName = nameParts[nameParts.length - 1].toLowerCase();
          found = staffList.find(s => {
            const staffParts = s.name.split(/\s+/);
            const staffLastName = staffParts[staffParts.length - 1].toLowerCase();
            return staffLastName === lastName;
          });
        }
        
        if (found) return found.id;
        warnings.push(`Row ${rowNum}: Prüfer ${examinerNum} "${name}" not found in staff list`);
      }
      // Create ID from name if not found - this will not match any staff
      return `staff-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    };
    
    const examiner1Id = findStaffId(examiner1Name, i + 2, 1);
    const examiner2Id = findStaffId(examiner2Name, i + 2, 2);
    
    // Parse public flag - default is PUBLIC unless explicitly marked as not public
    let isPublic = true;
    if (mapping.isPublic && row[mapping.isPublic]) {
      const publicVal = String(row[mapping.isPublic]).toLowerCase().trim();
      if (NOT_PUBLIC_MARKERS.some(marker => publicVal.includes(marker))) {
        isPublic = false;
      }
    }
    
    exams.push({
      id: crypto.randomUUID(),
      degree,
      kompetenzfeld,
      studentName,
      studentFirstName: studentFirstName || undefined,
      studentLastName: studentLastName || undefined,
      studentId: mapping.studentId ? String(row[mapping.studentId] || '') : undefined,
      topic,
      examiner1Id,
      examiner2Id,
      isPublic,
      notes: mapping.notes ? String(row[mapping.notes] || '') : undefined,
    });
  }
  
  return { exams, warnings };
}

// Simplified staff parsing - only master data, no availability
export function parseStaff(
  data: Record<string, unknown>[],
  mapping: StaffColumnMapping
): { staff: StaffMember[]; warnings: string[] } {
  const staff: StaffMember[] = [];
  const warnings: string[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    
    const name = mapping.name ? String(row[mapping.name] || '').trim() : '';
    if (!name) {
      warnings.push(`Row ${i + 2}: Missing staff name, skipping`);
      continue;
    }
    
    // Parse employment type (Beschäftigungsart)
    let employmentType: EmploymentType = 'internal';
    if (mapping.employmentType && row[mapping.employmentType]) {
      const empVal = String(row[mapping.employmentType]).toLowerCase();
      if (empVal.includes('extern') || empVal.includes('external')) {
        employmentType = 'external';
      } else if (empVal.includes('lehrbeauftrag') || empVal.includes('adjunct')) {
        employmentType = 'adjunct';
      }
    }
    
    // Parse primary competence field
    const primaryKfRaw = mapping.primaryCompetenceField 
      ? String(row[mapping.primaryCompetenceField] || '').trim() 
      : '';
    const primaryCompetenceField = primaryKfRaw || null;
    
    // Parse secondary competence fields (comma-separated)
    const secondaryKfRaw = mapping.secondaryCompetenceFields 
      ? String(row[mapping.secondaryCompetenceFields] || '') 
      : '';
    const secondaryCompetenceFields = secondaryKfRaw
      .split(/[,;]/)
      .map(f => f.trim())
      .filter(Boolean);
    
    // Build competence fields array
    const competenceFields = primaryCompetenceField 
      ? [primaryCompetenceField, ...secondaryCompetenceFields]
      : secondaryCompetenceFields;
    
    // Parse notes
    const notes = mapping.notes ? String(row[mapping.notes] || '').trim() : undefined;
    
    // canDoProtocol: default to true for internal, false for external/adjunct
    // External and adjunct can NEVER be protocolists (hard rule)
    const canDoProtocol = employmentType === 'internal';
    
    staff.push({
      id: crypto.randomUUID(),
      name,
      competenceFields,
      primaryCompetenceField,
      secondaryCompetenceFields,
      canExamine: true, // All staff can examine
      canDoProtocol,
      canProtocol: canDoProtocol, // Combined rule: internal AND canDoProtocol
      employmentType,
      notes,
      // No availabilityOverride - will be set via UI
    });
  }
  
  return { staff, warnings };
}

export function exportScheduleToXLSX(
  events: Array<{
    exam: Exam;
    event: { dayDate: string; room: string; startTime: string; endTime: string; status: string; cancelledReason?: string; durationMinutes?: number };
    protocolist: StaffMember | undefined;
    examiner1: StaffMember | undefined;
    examiner2: StaffMember | undefined;
    allExaminers?: (StaffMember | undefined)[];
  }>
): Blob {
  const baData = events
    .filter(e => e.exam.degree === 'BA')
    .map(e => {
      const displayNames = getExamDisplayNames(e.exam);
      const examinerIds = getAllExaminerIds(e.exam);
      const examiners = e.allExaminers || [e.examiner1, e.examiner2];
      
      return {
        'Kompetenzfeld': e.exam.kompetenzfeld || '',
        'Name': displayNames.join(' & '),
        'Thema': e.exam.topic,
        'Prüfer 1': examiners[0]?.name || '',
        'Prüfer 2': examiners[1]?.name || '',
        'Prüfer 3': examiners[2]?.name || '',
        'Prüfer 4': examiners[3]?.name || '',
        'Protokoll': e.protocolist?.name || '',
        'Raum': e.event.room,
        'Datum': e.event.dayDate,
        'Zeit': `${e.event.startTime} - ${e.event.endTime}`,
        'Dauer (Min.)': e.event.durationMinutes || e.exam.durationMinutes || 50,
        'Teamarbeit': e.exam.isTeam ? 'JA' : '',
        'Ohne Öffentlichkeit': e.exam.isPublic ? '' : 'X',
        'Status': e.event.status === 'cancelled' ? 'CANCELLED' : 'SCHEDULED',
        'Absagegrund': e.event.cancelledReason || '',
      };
    });
  
  const maData = events
    .filter(e => e.exam.degree === 'MA')
    .map(e => {
      const displayNames = getExamDisplayNames(e.exam);
      const examinerIds = getAllExaminerIds(e.exam);
      const examiners = e.allExaminers || [e.examiner1, e.examiner2];
      
      return {
        'Kompetenzfeld': 'Master',
        'Name': displayNames.join(' & '),
        'Thema': e.exam.topic,
        'Prüfer 1': examiners[0]?.name || '',
        'Prüfer 2': examiners[1]?.name || '',
        'Prüfer 3': examiners[2]?.name || '',
        'Prüfer 4': examiners[3]?.name || '',
        'Protokoll': e.protocolist?.name || '',
        'Raum': e.event.room,
        'Datum': e.event.dayDate,
        'Zeit': `${e.event.startTime} - ${e.event.endTime}`,
        'Dauer (Min.)': e.event.durationMinutes || e.exam.durationMinutes || 75,
        'Teamarbeit': e.exam.isTeam ? 'JA' : '',
        'Ohne Öffentlichkeit': e.exam.isPublic ? '' : 'X',
        'Status': e.event.status === 'cancelled' ? 'CANCELLED' : 'SCHEDULED',
        'Absagegrund': e.event.cancelledReason || '',
      };
    });
  
  const wb = XLSX.utils.book_new();
  
  if (baData.length > 0) {
    const baSheet = XLSX.utils.json_to_sheet(baData);
    XLSX.utils.book_append_sheet(wb, baSheet, 'Bachelor');
  }
  
  if (maData.length > 0) {
    const maSheet = XLSX.utils.json_to_sheet(maData);
    XLSX.utils.book_append_sheet(wb, maSheet, 'Master');
  }
  
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function exportScheduleToCSV(
  events: Array<{
    exam: Exam;
    event: { dayDate: string; room: string; startTime: string; endTime: string; status: string; cancelledReason?: string; durationMinutes?: number };
    protocolist: StaffMember | undefined;
    examiner1: StaffMember | undefined;
    examiner2: StaffMember | undefined;
    allExaminers?: (StaffMember | undefined)[];
  }>
): string {
  const headers = [
    'Degree', 'Kompetenzfeld', 'Name', 'Thema', 'Prüfer 1', 'Prüfer 2', 'Prüfer 3', 'Prüfer 4',
    'Protokoll', 'Raum', 'Datum', 'Start', 'Ende', 'Dauer', 'Teamarbeit', 'Öffentlich', 'Status', 'Absagegrund'
  ];
  
  const rows = events.map(e => {
    const displayNames = getExamDisplayNames(e.exam);
    const examiners = e.allExaminers || [e.examiner1, e.examiner2];
    
    return [
      e.exam.degree,
      e.exam.degree === 'MA' ? 'Master' : (e.exam.kompetenzfeld || ''),
      displayNames.join(' & '),
      e.exam.topic,
      examiners[0]?.name || '',
      examiners[1]?.name || '',
      examiners[2]?.name || '',
      examiners[3]?.name || '',
      e.protocolist?.name || '',
      e.event.room,
      e.event.dayDate,
      e.event.startTime,
      e.event.endTime,
      String(e.event.durationMinutes || e.exam.durationMinutes || (e.exam.degree === 'MA' ? 75 : 50)),
      e.exam.isTeam ? 'JA' : '',
      e.exam.isPublic ? 'Ja' : 'Nein',
      e.event.status === 'cancelled' ? 'CANCELLED' : 'SCHEDULED',
      e.event.cancelledReason || '',
    ];
  });
  
  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
  ].join('\n');
  
  return csvContent;
}

// Schedule import types
export interface ScheduleImportRow {
  degree: string;
  kompetenzfeld: string;
  studentName: string;
  topic: string;
  examiner1Name: string;
  examiner2Name: string;
  protocolistName: string;
  room: string;
  dayDate: string;
  startTime: string;
  endTime: string;
  isPublic: boolean;
  isPublicExplicit: boolean; // Whether the public flag was explicitly set in import
  status: 'SCHEDULED' | 'CANCELLED';
  cancelledReason?: string;
}

export interface ScheduleImportResult {
  rows: ScheduleImportRow[];
  warnings: string[];
  errors: string[];
}

// Parse the exported schedule XLSX format for re-import
export function parseScheduleXLSX(sheets: ParsedSheet[], staff: StaffMember[]): ScheduleImportResult {
  const rows: ScheduleImportRow[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  
  for (const sheet of sheets) {
    // Detect degree from sheet name
    const sheetDegree = sheet.name.toLowerCase().includes('master') ? 'MA' : 'BA';
    
    for (let i = 0; i < sheet.data.length; i++) {
      const row = sheet.data[i];
      const rowNum = i + 2; // Excel row number (1-indexed header + 1-indexed data)
      
      // Try to extract data from known column names (flexible matching)
      const getValue = (patterns: string[]): string => {
        for (const key of Object.keys(row)) {
          const lowerKey = key.toLowerCase();
          if (patterns.some(p => lowerKey.includes(p))) {
            return String(row[key] || '').trim();
          }
        }
        return '';
      };
      
      const studentName = getValue(['name', 'student', 'kandidat']);
      if (!studentName) {
        warnings.push(`Zeile ${rowNum} (${sheet.name}): Kein Studentenname gefunden, übersprungen`);
        continue;
      }
      
      const topic = getValue(['thema', 'topic', 'titel']);
      const kompetenzfeld = getValue(['kompetenzfeld', 'competence', 'feld']);
      const examiner1Name = getValue(['prüfer 1', 'prüfer1', 'erstprüfer', 'examiner 1']);
      const examiner2Name = getValue(['prüfer 2', 'prüfer2', 'zweitprüfer', 'examiner 2']);
      const protocolistName = getValue(['protokoll', 'protocol']);
      const room = getValue(['raum', 'room']);
      const dayDate = getValue(['datum', 'date', 'day']);
      
      // Parse time - could be "HH:mm - HH:mm" format or separate columns
      let startTime = '';
      let endTime = '';
      const timeValue = getValue(['zeit', 'time']);
      if (timeValue && timeValue.includes('-')) {
        const [start, end] = timeValue.split('-').map(t => t.trim());
        startTime = start;
        endTime = end;
      } else {
        startTime = getValue(['start', 'beginn', 'von']);
        endTime = getValue(['ende', 'end', 'bis']);
      }
      
      // Parse public flag - explicit column parsing for roundtrip preservation
      // Column names we export: "Ohne Öffentlichkeit" (X = not public)
      const ohneOeffentlichkeitValue = getValue(['ohne öffentlichkeit']);
      const publicValue = getValue(['öffentlich', 'public']);
      
      let isPublic = true; // Default if column missing
      let isPublicExplicit = false;
      
      if (ohneOeffentlichkeitValue) {
        isPublicExplicit = true;
        const val = ohneOeffentlichkeitValue.toLowerCase().trim();
        // "X", "JA", "YES", "TRUE", "1" in "Ohne Öffentlichkeit" column = NOT public
        if (['x', 'ja', 'yes', 'true', '1'].includes(val) || val.length > 0) {
          isPublic = false;
        } else if (['', 'nein', 'no', 'false', '0'].includes(val)) {
          isPublic = true;
        }
      } else if (publicValue) {
        isPublicExplicit = true;
        const val = publicValue.toLowerCase().trim();
        // Direct "Öffentlich" or "Public" column: "Ja"/"Yes"/"True" = public
        if (['ja', 'yes', 'true', '1'].includes(val)) {
          isPublic = true;
        } else if (['nein', 'no', 'false', '0', 'x'].includes(val)) {
          isPublic = false;
        } else {
          // Unknown value - add error
          errors.push(`Zeile ${rowNum} (${sheet.name}): Unbekannter Wert "${publicValue}" für Öffentlichkeit. Erwartet: Ja/Nein`);
        }
      }
      
      // Parse status - explicit for roundtrip
      const statusValue = getValue(['status']);
      let status: 'SCHEDULED' | 'CANCELLED' = 'SCHEDULED';
      if (statusValue) {
        const val = statusValue.toUpperCase().trim();
        if (val === 'CANCELLED' || val === 'ABGESAGT') {
          status = 'CANCELLED';
        } else if (val !== 'SCHEDULED' && val !== 'GEPLANT' && val !== '') {
          warnings.push(`Zeile ${rowNum} (${sheet.name}): Unbekannter Status "${statusValue}", wird als SCHEDULED interpretiert`);
        }
      }
      const cancelledReason = getValue(['absagegrund', 'cancelled reason', 'grund']);
      
      // Validate required fields
      if (!dayDate) {
        errors.push(`Zeile ${rowNum} (${sheet.name}): Kein Datum für "${studentName}"`);
        continue;
      }
      if (!startTime || !endTime) {
        errors.push(`Zeile ${rowNum} (${sheet.name}): Keine Zeit für "${studentName}"`);
        continue;
      }
      if (!room) {
        errors.push(`Zeile ${rowNum} (${sheet.name}): Kein Raum für "${studentName}"`);
        continue;
      }
      
      rows.push({
        degree: sheetDegree,
        kompetenzfeld: kompetenzfeld || (sheetDegree === 'MA' ? 'Master' : ''),
        studentName,
        topic,
        examiner1Name,
        examiner2Name,
        protocolistName,
        room,
        dayDate,
        startTime,
        endTime,
        isPublic,
        isPublicExplicit,
        status,
        cancelledReason: cancelledReason || undefined,
      });
    }
  }
  
  return { rows, warnings, errors };
}

// Validate imported schedule for conflicts
export function validateScheduleImport(
  rows: ScheduleImportRow[],
  staff: StaffMember[]
): { valid: boolean; conflicts: string[] } {
  const conflicts: string[] = [];
  
  // Build a map of person -> time slots
  const personSlots = new Map<string, Array<{ day: string; start: number; end: number; student: string }>>();
  
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + (minutes || 0);
  };
  
  const normalizeName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');
  
  for (const row of rows) {
    if (row.status === 'CANCELLED') continue; // Skip cancelled exams
    
    const start = timeToMinutes(row.startTime);
    const end = timeToMinutes(row.endTime);
    const slot = { day: row.dayDate, start, end, student: row.studentName };
    
    // Add slots for all people involved
    const people = [row.examiner1Name, row.examiner2Name, row.protocolistName].filter(Boolean);
    
    for (const person of people) {
      const key = normalizeName(person);
      if (!personSlots.has(key)) {
        personSlots.set(key, []);
      }
      personSlots.get(key)!.push(slot);
    }
  }
  
  // Check for overlaps per person
  for (const [person, slots] of personSlots) {
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        
        if (a.day !== b.day) continue;
        
        // Check overlap
        if (!(a.end <= b.start || b.end <= a.start)) {
          const staffMember = staff.find(s => normalizeName(s.name) === person);
          const displayName = staffMember?.name || person;
          conflicts.push(
            `⚠️ ${displayName} ist doppelt gebucht am ${a.day}: "${a.student}" (${Math.floor(a.start/60)}:${String(a.start%60).padStart(2,'0')}-${Math.floor(a.end/60)}:${String(a.end%60).padStart(2,'0')}) und "${b.student}" (${Math.floor(b.start/60)}:${String(b.start%60).padStart(2,'0')}-${Math.floor(b.end/60)}:${String(b.end%60).padStart(2,'0')})`
          );
        }
      }
    }
  }
  
  return { valid: conflicts.length === 0, conflicts };
}
