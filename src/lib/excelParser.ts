import * as XLSX from 'xlsx';
import type { Exam, StaffMember, Degree, AvailabilityConstraint, EmploymentType } from '@/types';

export interface ParsedSheet {
  name: string;
  headers: string[];
  data: Record<string, unknown>[];
}

export interface ExamColumnMapping {
  degree?: string;
  kompetenzfeld?: string;
  studentName?: string;
  studentId?: string;
  topic?: string;
  examiner1?: string;
  examiner2?: string;
  isPublic?: string;
  notes?: string;
}

export interface StaffColumnMapping {
  name?: string;
  competenceFields?: string;
  availability?: string;
  employmentType?: string;
  canProtocol?: string;
  canExamine?: string;
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
  
  // Student name
  const namePatterns = ['name', 'student', 'kandidat', 'prüfling'];
  mapping.studentName = headers.find((_, i) => 
    namePatterns.some(p => lowerHeaders[i].includes(p)) && 
    !lowerHeaders[i].includes('prüfer') &&
    !lowerHeaders[i].includes('examiner')
  );
  
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
  
  // Name
  const namePatterns = ['name', 'dozent', 'mitarbeiter', 'person'];
  mapping.name = headers.find((_, i) => 
    namePatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Competence fields
  const kfPatterns = ['kompetenzfeld', 'competence', 'feld', 'bereich'];
  mapping.competenceFields = headers.find((_, i) => 
    kfPatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Availability
  const availPatterns = ['verfügbar', 'availability', 'zeit', 'restriction', 'einschränkung'];
  mapping.availability = headers.find((_, i) => 
    availPatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Employment type
  const employmentPatterns = ['status', 'employment', 'anstellung', 'typ', 'type', 'extern'];
  mapping.employmentType = headers.find((_, i) => 
    employmentPatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Can protocol
  const protocolPatterns = ['protokoll', 'protocol'];
  mapping.canProtocol = headers.find((_, i) => 
    protocolPatterns.some(p => lowerHeaders[i].includes(p))
  );
  
  // Can examine
  const examinePatterns = ['prüfen', 'examine', 'prüfer'];
  mapping.canExamine = headers.find((_, i) => 
    examinePatterns.some(p => lowerHeaders[i].includes(p))
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
    
    // Parse student name
    const studentName = mapping.studentName ? String(row[mapping.studentName] || '').trim() : '';
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

export function parseAvailabilityText(text: string): AvailabilityConstraint[] {
  const constraints: AvailabilityConstraint[] = [];
  if (!text) return constraints;
  
  const lowerText = text.toLowerCase();
  
  // German day names
  const dayMap: Record<string, string> = {
    'montag': 'Monday', 'mo': 'Monday',
    'dienstag': 'Tuesday', 'di': 'Tuesday',
    'mittwoch': 'Wednesday', 'mi': 'Wednesday',
    'donnerstag': 'Thursday', 'do': 'Thursday',
    'freitag': 'Friday', 'fr': 'Friday',
  };
  
  // Check for "nur" (only) patterns
  const nurMatch = lowerText.match(/nur\s+(\w+)/);
  if (nurMatch) {
    const day = dayMap[nurMatch[1]] || nurMatch[1];
    constraints.push({ type: 'available', day });
  }
  
  // Check for "nicht" (not) patterns
  const nichtMatch = lowerText.match(/nicht\s+(\w+)/);
  if (nichtMatch) {
    const day = dayMap[nichtMatch[1]] || nichtMatch[1];
    constraints.push({ type: 'unavailable', day });
  }
  
  // Check for time ranges like "ab 12 Uhr" or "09-13"
  const timeRangeMatch = lowerText.match(/ab\s+(\d{1,2})\s*(?:uhr|:)?/);
  if (timeRangeMatch) {
    const startHour = parseInt(timeRangeMatch[1]);
    constraints.push({ 
      type: 'available', 
      startTime: `${startHour.toString().padStart(2, '0')}:00`,
      endTime: '18:00'
    });
  }
  
  const rangeMatch = lowerText.match(/(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?/);
  if (rangeMatch) {
    const startHour = rangeMatch[1].padStart(2, '0');
    const startMin = rangeMatch[2] || '00';
    const endHour = rangeMatch[3].padStart(2, '0');
    const endMin = rangeMatch[4] || '00';
    constraints.push({ 
      type: 'available', 
      startTime: `${startHour}:${startMin}`,
      endTime: `${endHour}:${endMin}`
    });
  }
  
  return constraints;
}

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
    
    // Parse competence fields (comma-separated)
    const kfRaw = mapping.competenceFields ? String(row[mapping.competenceFields] || '') : '';
    const competenceFields = kfRaw.split(/[,;]/).map(f => f.trim()).filter(Boolean);
    const primaryCompetenceField = competenceFields[0] || null;
    
    // Parse availability
    const availabilityRaw = mapping.availability ? String(row[mapping.availability] || '') : '';
    const availabilityConstraints = parseAvailabilityText(availabilityRaw);
    
    // Parse employment type
    let employmentType: EmploymentType = 'internal';
    if (mapping.employmentType && row[mapping.employmentType]) {
      const empVal = String(row[mapping.employmentType]).toLowerCase();
      if (empVal.includes('extern') || empVal.includes('external')) {
        employmentType = 'external';
      } else if (empVal.includes('lehrbeauftrag') || empVal.includes('adjunct')) {
        employmentType = 'adjunct';
      }
    }
    
    // Parse can_protocol - externals/adjuncts cannot protocol
    let canProtocol = employmentType === 'internal';
    if (mapping.canProtocol && row[mapping.canProtocol]) {
      const protVal = String(row[mapping.canProtocol]).toLowerCase();
      if (protVal.includes('nein') || protVal.includes('no') || protVal.includes('n')) {
        canProtocol = false;
      }
    }
    // Check for "kein Protokoll" in availability text
    if (availabilityRaw.toLowerCase().includes('kein protokoll')) {
      canProtocol = false;
    }
    
    // Parse can_examine
    let canExamine = true;
    if (mapping.canExamine && row[mapping.canExamine]) {
      const examVal = String(row[mapping.canExamine]).toLowerCase();
      if (examVal.includes('nein') || examVal.includes('no') || examVal.includes('n')) {
        canExamine = false;
      }
    }
    
    staff.push({
      id: crypto.randomUUID(),
      name,
      competenceFields,
      primaryCompetenceField,
      canExamine,
      canProtocol,
      employmentType,
      availabilityConstraints,
      availabilityRaw,
    });
  }
  
  return { staff, warnings };
}

export function exportScheduleToXLSX(
  events: Array<{
    exam: Exam;
    event: { dayDate: string; room: string; startTime: string; endTime: string; status: string };
    protocolist: StaffMember | undefined;
    examiner1: StaffMember | undefined;
    examiner2: StaffMember | undefined;
  }>
): Blob {
  const baData = events
    .filter(e => e.exam.degree === 'BA')
    .map(e => ({
      'Kompetenzfeld': e.exam.kompetenzfeld || '',
      'Name': e.exam.studentName,
      'Thema': e.exam.topic,
      'Prüfer 1': e.examiner1?.name || '',
      'Prüfer 2': e.examiner2?.name || '',
      'Protokoll': e.protocolist?.name || '',
      'Raum': e.event.room,
      'Datum': e.event.dayDate,
      'Zeit': `${e.event.startTime} - ${e.event.endTime}`,
      'Ohne Öffentlichkeit': e.exam.isPublic ? '' : 'X',
      'Status': e.event.status,
    }));
  
  const maData = events
    .filter(e => e.exam.degree === 'MA')
    .map(e => ({
      'Kompetenzfeld': 'Master',
      'Name': e.exam.studentName,
      'Thema': e.exam.topic,
      'Prüfer 1': e.examiner1?.name || '',
      'Prüfer 2': e.examiner2?.name || '',
      'Protokoll': e.protocolist?.name || '',
      'Raum': e.event.room,
      'Datum': e.event.dayDate,
      'Zeit': `${e.event.startTime} - ${e.event.endTime}`,
      'Ohne Öffentlichkeit': e.exam.isPublic ? '' : 'X',
      'Status': e.event.status,
    }));
  
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
    event: { dayDate: string; room: string; startTime: string; endTime: string; status: string };
    protocolist: StaffMember | undefined;
    examiner1: StaffMember | undefined;
    examiner2: StaffMember | undefined;
  }>
): string {
  const headers = [
    'Degree', 'Kompetenzfeld', 'Name', 'Thema', 'Prüfer 1', 'Prüfer 2',
    'Protokoll', 'Raum', 'Datum', 'Start', 'Ende', 'Öffentlich', 'Status'
  ];
  
  const rows = events.map(e => [
    e.exam.degree,
    e.exam.degree === 'MA' ? 'Master' : (e.exam.kompetenzfeld || ''),
    e.exam.studentName,
    e.exam.topic,
    e.examiner1?.name || '',
    e.examiner2?.name || '',
    e.protocolist?.name || '',
    e.event.room,
    e.event.dayDate,
    e.event.startTime,
    e.event.endTime,
    e.exam.isPublic ? 'Ja' : 'Nein',
    e.event.status,
  ]);
  
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  
  return csvContent;
}
