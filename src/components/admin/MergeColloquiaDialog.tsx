import { useState, useMemo } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Merge, 
  Search, 
  Users, 
  Clock, 
  Check,
  ChevronRight,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { SLOT_DURATIONS, canBeProtocolist } from '@/types';
import type { ScheduledEvent, Exam, Degree } from '@/types';

type WizardStep = 'select1' | 'select2' | 'confirm';

export function MergeColloquiaDialog() {
  const { 
    scheduledEvents, 
    scheduleVersions,
    exams, 
    staff,
    getStaffById,
    mergeExams
  } = useScheduleStore();
  const { toast } = useToast();
  
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>('select1');
  const [search, setSearch] = useState('');
  const [selectedExam1, setSelectedExam1] = useState<string | null>(null);
  const [selectedExam2, setSelectedExam2] = useState<string | null>(null);
  const [selectedProtocolist, setSelectedProtocolist] = useState<string>('');
  
  // Get active version events
  const publishedVersion = scheduleVersions.find(v => v.status === 'published');
  const latestVersion = scheduleVersions[scheduleVersions.length - 1];
  const activeVersion = publishedVersion || latestVersion;
  
  const versionEvents = useMemo(() => {
    if (!activeVersion) return [];
    return scheduledEvents.filter(e => 
      e.scheduleVersionId === activeVersion.id && 
      e.status === 'scheduled'
    );
  }, [scheduledEvents, activeVersion]);
  
  // Get exam data for events
  const eventsWithExams = useMemo(() => {
    return versionEvents.map(event => {
      const exam = exams.find(e => e.id === event.examId);
      return exam ? { event, exam } : null;
    }).filter((item): item is { event: ScheduledEvent; exam: Exam } => 
      item !== null && !item.exam.isTeam
    );
  }, [versionEvents, exams]);
  
  // Filter events based on step
  const filteredEvents = useMemo(() => {
    let items = eventsWithExams;
    
    // If step 2, only show same degree as exam1
    if (step === 'select2' && selectedExam1) {
      const exam1 = exams.find(e => e.id === selectedExam1);
      if (exam1) {
        items = items.filter(({ exam }) => 
          exam.degree === exam1.degree && exam.id !== selectedExam1
        );
      }
    }
    
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      items = items.filter(({ exam }) => {
        const matchesStudent = exam.studentName.toLowerCase().includes(searchLower);
        const examiner1 = getStaffById(exam.examiner1Id);
        const matchesExaminer = examiner1?.name?.toLowerCase().includes(searchLower);
        return matchesStudent || matchesExaminer;
      });
    }
    
    return items.sort((a, b) => {
      if (a.event.dayDate !== b.event.dayDate) return a.event.dayDate.localeCompare(b.event.dayDate);
      return a.event.startTime.localeCompare(b.event.startTime);
    });
  }, [eventsWithExams, search, step, selectedExam1, exams, getStaffById]);
  
  // Get merged exam preview
  const mergePreview = useMemo(() => {
    if (!selectedExam1 || !selectedExam2) return null;
    
    const exam1 = exams.find(e => e.id === selectedExam1);
    const exam2 = exams.find(e => e.id === selectedExam2);
    if (!exam1 || !exam2) return null;
    
    const event1 = versionEvents.find(e => e.examId === selectedExam1);
    if (!event1) return null;
    
    const examinerIds = [...new Set([
      exam1.examiner1Id, exam1.examiner2Id,
      exam2.examiner1Id, exam2.examiner2Id
    ])].filter(Boolean);
    
    const baseDuration = SLOT_DURATIONS[exam1.degree];
    const durationMinutes = baseDuration * 2;
    
    return {
      studentNames: [exam1.studentName, exam2.studentName],
      examinerIds,
      degree: exam1.degree,
      durationMinutes,
      dayDate: event1.dayDate,
      room: event1.room,
      startTime: event1.startTime,
    };
  }, [selectedExam1, selectedExam2, exams, versionEvents]);
  
  const eligibleProtocolists = useMemo(() => {
    return staff.filter(s => canBeProtocolist(s));
  }, [staff]);
  
  const handleSelectExam = (examId: string) => {
    if (step === 'select1') {
      setSelectedExam1(examId);
      setStep('select2');
      setSearch('');
    } else if (step === 'select2') {
      setSelectedExam2(examId);
      setStep('confirm');
    }
  };
  
  const handleBack = () => {
    if (step === 'select2') {
      setSelectedExam1(null);
      setStep('select1');
    } else if (step === 'confirm') {
      setSelectedExam2(null);
      setStep('select2');
    }
    setSearch('');
  };
  
  const handleMerge = () => {
    if (!selectedExam1 || !selectedExam2) return;
    
    const result = mergeExams(selectedExam1, selectedExam2, selectedProtocolist || undefined);
    
    if (result) {
      toast({
        title: 'Kolloquien zusammengelegt',
        description: `${result.mergedExam.studentName} - Doppelslot (${result.mergedExam.durationMinutes} Min.)`,
      });
      setOpen(false);
      resetSelection();
    } else {
      toast({
        title: 'Fehler',
        description: 'Die Kolloquien konnten nicht zusammengelegt werden.',
        variant: 'destructive',
      });
    }
  };
  
  const resetSelection = () => {
    setSelectedExam1(null);
    setSelectedExam2(null);
    setSelectedProtocolist('');
    setSearch('');
    setStep('select1');
  };
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { 
      weekday: 'short', 
      day: '2-digit', 
      month: '2-digit'
    });
  };
  
  const getSelectedExamInfo = (examId: string | null) => {
    if (!examId) return null;
    const exam = exams.find(e => e.id === examId);
    const event = versionEvents.find(e => e.examId === examId);
    if (!exam || !event) return null;
    return { exam, event };
  };
  
  const exam1Info = getSelectedExamInfo(selectedExam1);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetSelection();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Merge className="h-4 w-4" />
          Zusammenlegen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Team-Kolloquium erstellen
          </DialogTitle>
          <DialogDescription>
            {step === 'select1' && 'Wählen Sie das erste Kolloquium aus.'}
            {step === 'select2' && 'Wählen Sie das zweite Kolloquium (gleicher Abschluss).'}
            {step === 'confirm' && 'Bestätigen Sie die Zusammenlegung.'}
          </DialogDescription>
        </DialogHeader>
        
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm">
          <span className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
            step === 'select1' ? "bg-primary text-primary-foreground" : "bg-muted"
          )}>1</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
            step === 'select2' ? "bg-primary text-primary-foreground" : "bg-muted"
          )}>2</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
            step === 'confirm' ? "bg-primary text-primary-foreground" : "bg-muted"
          )}>✓</span>
        </div>
        
        {/* Selected exam 1 banner */}
        {exam1Info && step !== 'select1' && (
          <div className="flex items-center gap-3 p-2 bg-primary/10 rounded-md text-sm">
            <Check className="h-4 w-4 text-primary" />
            <Badge variant={exam1Info.exam.degree === 'BA' ? 'default' : 'secondary'} className="text-xs">
              {exam1Info.exam.degree}
            </Badge>
            <span className="font-medium truncate">{exam1Info.exam.studentName}</span>
            <span className="text-muted-foreground">{formatDate(exam1Info.event.dayDate)} {exam1Info.event.startTime}</span>
            {step === 'select2' && (
              <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={handleBack}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
        
        {/* List view for steps 1 & 2 */}
        {(step === 'select1' || step === 'select2') && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Name oder Prüfer suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <ScrollArea className="h-[280px] border rounded-md">
              {filteredEvents.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Keine passenden Kolloquien gefunden
                </div>
              ) : (
                <div className="divide-y">
                  {filteredEvents.map(({ event, exam }) => {
                    const examiner1 = getStaffById(exam.examiner1Id);
                    
                    return (
                      <button
                        key={event.id}
                        onClick={() => handleSelectExam(exam.id)}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
                      >
                        <Badge variant={exam.degree === 'BA' ? 'default' : 'secondary'} className="text-xs shrink-0">
                          {exam.degree}
                        </Badge>
                        <span className="font-medium truncate flex-1">{exam.studentName}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDate(event.dayDate)}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {event.startTime}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 max-w-[80px] truncate">
                          {examiner1?.name}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </>
        )}
        
        {/* Confirmation view */}
        {step === 'confirm' && mergePreview && (
          <div className="space-y-4">
            <div className="p-4 border-2 border-primary rounded-md bg-primary/5">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={mergePreview.degree === 'BA' ? 'default' : 'secondary'}>
                  {mergePreview.degree}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Users className="h-3 w-3" />
                  Teamarbeit
                </Badge>
                <Badge variant="secondary">{mergePreview.durationMinutes} Min.</Badge>
              </div>
              <p className="font-semibold text-lg">{mergePreview.studentNames.join(' & ')}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {formatDate(mergePreview.dayDate)} • {mergePreview.startTime} • {mergePreview.room}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {mergePreview.examinerIds.length} Prüfer: {mergePreview.examinerIds.map(id => getStaffById(id)?.name).filter(Boolean).join(', ')}
              </p>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Protokollant (optional)</label>
              <Select value={selectedProtocolist} onValueChange={setSelectedProtocolist}>
                <SelectTrigger>
                  <SelectValue placeholder="Protokollant auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {eligibleProtocolists.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        
        <DialogFooter className="gap-2">
          {step !== 'select1' && (
            <Button variant="outline" onClick={handleBack}>
              Zurück
            </Button>
          )}
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          {step === 'confirm' && (
            <Button onClick={handleMerge} className="gap-2">
              <Merge className="h-4 w-4" />
              Zusammenlegen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}