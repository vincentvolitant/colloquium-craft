import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, Check, AlertTriangle, X } from 'lucide-react';
import { parseExcelFile, autoDetectExamMapping, autoDetectStaffMapping, parseExams, parseStaff, type ParsedSheet, type ExamColumnMapping, type StaffColumnMapping } from '@/lib/excelParser';
import type { Degree, Exam, StaffMember } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ExcelUploadWizardProps {
  type: 'exams' | 'staff';
  onComplete: (data: Exam[] | StaffMember[], warnings: string[]) => void;
  existingStaff?: StaffMember[];
}

type WizardStep = 'upload' | 'sheet' | 'mapping' | 'preview' | 'complete';

export function ExcelUploadWizard({ type, onComplete, existingStaff }: ExcelUploadWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>('upload');
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<ParsedSheet | null>(null);
  const [examMapping, setExamMapping] = useState<ExamColumnMapping>({});
  const [staffMapping, setStaffMapping] = useState<StaffColumnMapping>({});
  const [defaultDegree, setDefaultDegree] = useState<Degree | undefined>();
  const [parsedData, setParsedData] = useState<Exam[] | StaffMember[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    setFileName(file.name);
    
    try {
      const parsedSheets = await parseExcelFile(file);
      if (parsedSheets.length === 0) {
        toast({
          title: 'Leere Datei',
          description: 'Die Excel-Datei enthält keine Daten.',
          variant: 'destructive',
        });
        return;
      }
      
      setSheets(parsedSheets);
      
      if (parsedSheets.length === 1) {
        handleSheetSelect(parsedSheets[0]);
      } else {
        setStep('sheet');
      }
    } catch (error) {
      toast({
        title: 'Fehler beim Lesen',
        description: 'Die Datei konnte nicht gelesen werden.',
        variant: 'destructive',
      });
    }
  }, [toast]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });
  
  const handleSheetSelect = (sheet: ParsedSheet) => {
    setSelectedSheet(sheet);
    
    if (type === 'exams') {
      const detected = autoDetectExamMapping(sheet.headers);
      setExamMapping(detected);
    } else {
      const detected = autoDetectStaffMapping(sheet.headers);
      setStaffMapping(detected);
    }
    
    setStep('mapping');
  };
  
  const handleMappingComplete = () => {
    if (!selectedSheet) return;
    
    if (type === 'exams') {
      const result = parseExams(selectedSheet.data, examMapping, defaultDegree, existingStaff);
      setParsedData(result.exams);
      setWarnings(result.warnings);
    } else {
      const result = parseStaff(selectedSheet.data, staffMapping);
      setParsedData(result.staff);
      setWarnings(result.warnings);
    }
    
    setStep('preview');
  };
  
  const handleComplete = () => {
    onComplete(parsedData, warnings);
    setStep('complete');
  };
  
  const reset = () => {
    setStep('upload');
    setSheets([]);
    setSelectedSheet(null);
    setExamMapping({});
    setStaffMapping({});
    setParsedData([]);
    setWarnings([]);
    setFileName('');
    setDefaultDegree(undefined);
  };
  
  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          {type === 'exams' ? 'Prüfungen importieren' : 'Mitarbeiter importieren'}
        </CardTitle>
        <CardDescription>
          {type === 'exams' 
            ? 'Laden Sie eine Excel-Datei mit Prüfungsdaten hoch'
            : 'Laden Sie eine Excel-Datei mit Mitarbeiterdaten hoch'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 'upload' && (
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
              isDragActive && "border-primary bg-primary/5"
            )}
          >
            <input {...getInputProps()} />
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p>Datei hier ablegen...</p>
            ) : (
              <>
                <p className="font-medium mb-1">Datei hierher ziehen oder klicken</p>
                <p className="text-sm text-muted-foreground">
                  Unterstützte Formate: .xlsx, .xls
                </p>
              </>
            )}
          </div>
        )}
        
        {step === 'sheet' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Die Datei <strong>{fileName}</strong> enthält mehrere Tabellenblätter. Bitte wählen Sie eines aus:
            </p>
            <div className="grid gap-2">
              {sheets.map((sheet) => (
                <Button
                  key={sheet.name}
                  variant="outline"
                  className="justify-start h-auto py-3"
                  onClick={() => handleSheetSelect(sheet)}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  <div className="text-left">
                    <div className="font-medium">{sheet.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {sheet.data.length} Zeilen, {sheet.headers.length} Spalten
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}
        
        {step === 'mapping' && selectedSheet && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Check className="h-4 w-4 text-primary" />
              <span>{fileName} • {selectedSheet.name}</span>
            </div>
            
            <p className="text-sm">
              Ordnen Sie die Spalten den entsprechenden Feldern zu. Automatisch erkannte Zuordnungen sind vorausgewählt.
            </p>
            
            {type === 'exams' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Abschluss (BA/MA)</Label>
                  <Select 
                    value={examMapping.degree || '__none__'} 
                    onValueChange={(v) => setExamMapping({...examMapping, degree: v === '__none__' ? undefined : v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Keine Spalte —</SelectItem>
                      {selectedSheet.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {!examMapping.degree && (
                  <div className="space-y-2">
                    <Label>Standard-Abschluss</Label>
                    <Select 
                      value={defaultDegree || '__none__'} 
                      onValueChange={(v) => setDefaultDegree(v === '__none__' ? undefined : v as Degree)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Wählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Keiner —</SelectItem>
                        <SelectItem value="BA">Bachelor (BA)</SelectItem>
                        <SelectItem value="MA">Master (MA)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Select 
                    value={examMapping.studentName || '__none__'} 
                    onValueChange={(v) => setExamMapping({...examMapping, studentName: v === '__none__' ? undefined : v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Keine Spalte —</SelectItem>
                      {selectedSheet.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Thema</Label>
                  <Select 
                    value={examMapping.topic || '__none__'} 
                    onValueChange={(v) => setExamMapping({...examMapping, topic: v === '__none__' ? undefined : v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Keine Spalte —</SelectItem>
                      {selectedSheet.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Kompetenzfeld</Label>
                  <Select 
                    value={examMapping.kompetenzfeld || '__none__'} 
                    onValueChange={(v) => setExamMapping({...examMapping, kompetenzfeld: v === '__none__' ? undefined : v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Keine Spalte —</SelectItem>
                      {selectedSheet.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Prüfer 1</Label>
                  <Select 
                    value={examMapping.examiner1 || '__none__'} 
                    onValueChange={(v) => setExamMapping({...examMapping, examiner1: v === '__none__' ? undefined : v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Keine Spalte —</SelectItem>
                      {selectedSheet.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Prüfer 2</Label>
                  <Select 
                    value={examMapping.examiner2 || '__none__'} 
                    onValueChange={(v) => setExamMapping({...examMapping, examiner2: v === '__none__' ? undefined : v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Keine Spalte —</SelectItem>
                      {selectedSheet.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Ohne Öffentlichkeit</Label>
                  <Select 
                    value={examMapping.isPublic || '__none__'} 
                    onValueChange={(v) => setExamMapping({...examMapping, isPublic: v === '__none__' ? undefined : v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Keine Spalte —</SelectItem>
                      {selectedSheet.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Select 
                    value={staffMapping.name || '__none__'} 
                    onValueChange={(v) => setStaffMapping({...staffMapping, name: v === '__none__' ? undefined : v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Keine Spalte —</SelectItem>
                      {selectedSheet.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Kompetenzfelder</Label>
                  <Select 
                    value={staffMapping.competenceFields || '__none__'} 
                    onValueChange={(v) => setStaffMapping({...staffMapping, competenceFields: v === '__none__' ? undefined : v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Keine Spalte —</SelectItem>
                      {selectedSheet.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Verfügbarkeit / Einschränkungen</Label>
                  <Select 
                    value={staffMapping.availability || '__none__'} 
                    onValueChange={(v) => setStaffMapping({...staffMapping, availability: v === '__none__' ? undefined : v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Keine Spalte —</SelectItem>
                      {selectedSheet.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Anstellungsart (Intern/Extern)</Label>
                  <Select 
                    value={staffMapping.employmentType || '__none__'} 
                    onValueChange={(v) => setStaffMapping({...staffMapping, employmentType: v === '__none__' ? undefined : v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Keine Spalte —</SelectItem>
                      {selectedSheet.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={reset}>
                Zurück
              </Button>
              <Button onClick={handleMappingComplete}>
                Vorschau anzeigen
              </Button>
            </div>
          </div>
        )}
        
        {step === 'preview' && (
          <div className="space-y-4">
            {warnings.length > 0 && (
              <div className="border-2 border-destructive/50 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 font-medium text-destructive mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  Warnungen ({warnings.length})
                </div>
                <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                  {warnings.map((w, i) => (
                    <li key={i} className="text-muted-foreground">{w}</li>
                  ))}
                </ul>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-lg px-3 py-1">
                {parsedData.length} {type === 'exams' ? 'Prüfungen' : 'Mitarbeiter'} erkannt
              </Badge>
            </div>
            
            <div className="border-2 max-h-64 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {type === 'exams' ? (
                      <>
                        <TableHead>Abschluss</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Kompetenzfeld</TableHead>
                        <TableHead>Thema</TableHead>
                        <TableHead>Öffentlich</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>Name</TableHead>
                        <TableHead>Kompetenzfelder</TableHead>
                        <TableHead>Typ</TableHead>
                        <TableHead>Protokoll</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {type === 'exams' ? (
                    (parsedData as Exam[]).slice(0, 10).map((exam) => (
                      <TableRow key={exam.id}>
                        <TableCell>
                          <Badge variant={exam.degree === 'BA' ? 'default' : 'secondary'}>
                            {exam.degree}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{exam.studentName}</TableCell>
                        <TableCell>{exam.kompetenzfeld || '—'}</TableCell>
                        <TableCell className="max-w-xs truncate">{exam.topic}</TableCell>
                        <TableCell>
                          {exam.isPublic ? (
                            <Check className="h-4 w-4 text-primary" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    (parsedData as StaffMember[]).slice(0, 10).map((staff) => (
                      <TableRow key={staff.id}>
                        <TableCell className="font-medium">{staff.name}</TableCell>
                        <TableCell>{staff.competenceFields.join(', ') || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={staff.employmentType === 'internal' ? 'default' : 'secondary'}>
                            {staff.employmentType === 'internal' ? 'Intern' : 
                             staff.employmentType === 'external' ? 'Extern' : 'Lehrbeauftragter'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {staff.canProtocol ? (
                            <Check className="h-4 w-4 text-primary" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            
            {parsedData.length > 10 && (
              <p className="text-sm text-muted-foreground text-center">
                ... und {parsedData.length - 10} weitere
              </p>
            )}
            
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Zurück
              </Button>
              <Button onClick={handleComplete}>
                <Check className="h-4 w-4 mr-2" />
                Importieren
              </Button>
            </div>
          </div>
        )}
        
        {step === 'complete' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <p className="text-lg font-medium mb-2">Import erfolgreich!</p>
            <p className="text-muted-foreground mb-4">
              {parsedData.length} {type === 'exams' ? 'Prüfungen' : 'Mitarbeiter'} wurden importiert.
            </p>
            <Button onClick={reset}>
              Weitere Datei importieren
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
