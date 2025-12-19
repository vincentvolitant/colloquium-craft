import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet, Check, AlertTriangle, X, FileUp } from 'lucide-react';
import { parseExcelFile, parseScheduleXLSX, validateScheduleImport, type ScheduleImportRow } from '@/lib/excelParser';
import { useScheduleStore } from '@/store/scheduleStore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Exam, ScheduledEvent, Degree } from '@/types';

type WizardStep = 'upload' | 'preview' | 'complete';

export function ScheduleImportWizard() {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>('upload');
  const [importRows, setImportRows] = useState<ScheduleImportRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [lenientMode, setLenientMode] = useState(false);
  
  const { 
    staff, 
    exams,
    setExams,
    setScheduledEvents,
    createScheduleVersion,
    scheduledEvents,
    scheduleVersions
  } = useScheduleStore();
  
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    setFileName(file.name);
    
    try {
      const sheets = await parseExcelFile(file);
      if (sheets.length === 0) {
        toast({
          title: 'Leere Datei',
          description: 'Die Excel-Datei enthält keine Daten.',
          variant: 'destructive',
        });
        return;
      }
      
      // Parse the schedule data
      const result = parseScheduleXLSX(sheets, staff);
      setImportRows(result.rows);
      setWarnings(result.warnings);
      setErrors(result.errors);
      
      // Validate for conflicts
      const validation = validateScheduleImport(result.rows, staff);
      setConflicts(validation.conflicts);
      
      setStep('preview');
    } catch (error) {
      toast({
        title: 'Fehler beim Lesen',
        description: 'Die Datei konnte nicht gelesen werden.',
        variant: 'destructive',
      });
    }
  }, [staff, toast]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });
  
  const findStaffIdByName = (name: string): string => {
    if (!name) return '';
    const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
    
    // Try exact match
    let found = staff.find(s => s.name.toLowerCase() === normalized);
    if (found) return found.id;
    
    // Try partial match
    found = staff.find(s => 
      s.name.toLowerCase().includes(normalized) || 
      normalized.includes(s.name.toLowerCase())
    );
    if (found) return found.id;
    
    // Try last name match
    const nameParts = name.split(/\s+/);
    const lastName = nameParts[nameParts.length - 1].toLowerCase();
    found = staff.find(s => {
      const staffParts = s.name.split(/\s+/);
      return staffParts[staffParts.length - 1].toLowerCase() === lastName;
    });
    if (found) return found.id;
    
    // Create placeholder ID
    return `staff-${normalized.replace(/[^a-z0-9]/g, '-')}`;
  };
  
  const handleImport = () => {
    // Create new version
    const versionId = createScheduleVersion();
    
    // Build exams and events from import rows
    const newExams: Exam[] = [];
    const newEvents: ScheduledEvent[] = [];
    
    // Keep track of existing exams by student name to avoid duplicates
    const existingExamsByStudent = new Map(exams.map(e => [e.studentName.toLowerCase(), e]));
    
    for (const row of importRows) {
      const studentKey = row.studentName.toLowerCase();
      
      // Check if exam already exists
      let exam = existingExamsByStudent.get(studentKey);
      
      if (!exam) {
        // Create new exam
        exam = {
          id: crypto.randomUUID(),
          degree: row.degree as Degree,
          kompetenzfeld: row.kompetenzfeld === 'Master' ? null : row.kompetenzfeld,
          studentName: row.studentName,
          topic: row.topic,
          examiner1Id: findStaffIdByName(row.examiner1Name),
          examiner2Id: findStaffIdByName(row.examiner2Name),
          isPublic: row.isPublic,
        };
        newExams.push(exam);
        existingExamsByStudent.set(studentKey, exam);
      }
      
      // Create scheduled event
      const event: ScheduledEvent = {
        id: crypto.randomUUID(),
        scheduleVersionId: versionId,
        examId: exam.id,
        dayDate: row.dayDate,
        room: row.room,
        startTime: row.startTime,
        endTime: row.endTime,
        protocolistId: findStaffIdByName(row.protocolistName),
        status: row.status === 'CANCELLED' ? 'cancelled' : 'scheduled',
        cancelledReason: row.cancelledReason,
        cancelledAt: row.status === 'CANCELLED' ? new Date().toISOString() : undefined,
      };
      newEvents.push(event);
    }
    
    // Merge with existing exams (keep existing, add new)
    const mergedExams = [...exams];
    for (const newExam of newExams) {
      if (!mergedExams.some(e => e.studentName.toLowerCase() === newExam.studentName.toLowerCase())) {
        mergedExams.push(newExam);
      }
    }
    
    // Set the data
    setExams(mergedExams);
    setScheduledEvents([...scheduledEvents, ...newEvents]);
    
    toast({
      title: 'Import erfolgreich',
      description: `${newEvents.length} Termine wurden als neue Version importiert.`,
    });
    
    setStep('complete');
  };
  
  const reset = () => {
    setStep('upload');
    setImportRows([]);
    setWarnings([]);
    setErrors([]);
    setConflicts([]);
    setFileName('');
    setLenientMode(false);
  };
  
  const canImport = importRows.length > 0 && (errors.length === 0 || lenientMode) && (conflicts.length === 0 || lenientMode);
  
  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="h-5 w-5" />
          Plan aus XLSX einlesen
        </CardTitle>
        <CardDescription>
          Importieren Sie einen exportierten Plan zurück in das System (Roundtrip)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 'upload' && (
          <div className="space-y-4">
            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed p-8 text-center cursor-pointer transition-colors rounded-lg",
                isDragActive && "border-primary bg-primary/5"
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              {isDragActive ? (
                <p>Datei hier ablegen...</p>
              ) : (
                <>
                  <p className="font-medium mb-1">Exportierte Plan-Datei hierher ziehen oder klicken</p>
                  <p className="text-sm text-muted-foreground">
                    Unterstützte Formate: .xlsx (System-Export)
                  </p>
                </>
              )}
            </div>
            
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Hinweis</AlertTitle>
              <AlertDescription>
                Nur XLSX-Dateien im System-Exportformat werden unterstützt. 
                Der Import erstellt eine neue Planversion.
              </AlertDescription>
            </Alert>
          </div>
        )}
        
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              <span>{fileName}</span>
              <Badge variant="outline">{importRows.length} Termine</Badge>
            </div>
            
            {/* Errors */}
            {errors.length > 0 && (
              <Alert variant="destructive">
                <X className="h-4 w-4" />
                <AlertTitle>Fehler ({errors.length})</AlertTitle>
                <AlertDescription>
                  <ScrollArea className="h-24 mt-2">
                    <ul className="text-sm space-y-1">
                      {errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            )}
            
            {/* Conflicts */}
            {conflicts.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Konflikte ({conflicts.length})</AlertTitle>
                <AlertDescription>
                  <ScrollArea className="h-32 mt-2">
                    <ul className="text-sm space-y-1">
                      {conflicts.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            )}
            
            {/* Warnings */}
            {warnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Warnungen ({warnings.length})</AlertTitle>
                <AlertDescription>
                  <ScrollArea className="h-20 mt-2">
                    <ul className="text-sm space-y-1">
                      {warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            )}
            
            {/* Lenient mode toggle */}
            {(errors.length > 0 || conflicts.length > 0) && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Switch 
                  id="lenient" 
                  checked={lenientMode} 
                  onCheckedChange={setLenientMode}
                />
                <Label htmlFor="lenient" className="cursor-pointer">
                  Toleranter Import (Fehler/Konflikte ignorieren und trotzdem laden)
                </Label>
              </div>
            )}
            
            {/* Preview table */}
            <ScrollArea className="h-64 border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Zeit</TableHead>
                    <TableHead>Raum</TableHead>
                    <TableHead>Protokollant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importRows.slice(0, 50).map((row, i) => (
                    <TableRow key={i} className={row.status === 'CANCELLED' ? 'opacity-50' : ''}>
                      <TableCell>
                        <Badge variant={row.status === 'CANCELLED' ? 'destructive' : 'default'}>
                          {row.status === 'CANCELLED' ? 'Abgesagt' : 'Geplant'}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.degree}</TableCell>
                      <TableCell className={row.status === 'CANCELLED' ? 'line-through' : ''}>
                        {row.studentName}
                      </TableCell>
                      <TableCell>{row.dayDate}</TableCell>
                      <TableCell>{row.startTime} - {row.endTime}</TableCell>
                      <TableCell>{row.room}</TableCell>
                      <TableCell>{row.protocolistName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {importRows.length > 50 && (
                <p className="text-sm text-muted-foreground p-2 text-center">
                  ... und {importRows.length - 50} weitere
                </p>
              )}
            </ScrollArea>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>
                Abbrechen
              </Button>
              <Button onClick={handleImport} disabled={!canImport}>
                <Check className="h-4 w-4 mr-2" />
                {importRows.length} Termine importieren
              </Button>
            </div>
          </div>
        )}
        
        {step === 'complete' && (
          <div className="text-center py-8">
            <Check className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-medium mb-2">Import abgeschlossen</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {importRows.length} Termine wurden als neue Planversion importiert.
            </p>
            <Button variant="outline" onClick={reset}>
              Weiteren Plan importieren
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
