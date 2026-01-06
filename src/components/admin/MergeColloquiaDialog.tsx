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
  MapPin,
  Check,
  AlertTriangle,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { KOMPETENZFELD_MASTER_LABEL, SLOT_DURATIONS, canBeProtocolist } from '@/types';
import type { ScheduledEvent, Exam, Degree } from '@/types';

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
  const [search, setSearch] = useState('');
  const [degreeFilter, setDegreeFilter] = useState<Degree | 'all'>('all');
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
      item !== null && !item.exam.isTeam // Exclude already merged exams
    );
  }, [versionEvents, exams]);
  
  // Filter events
  const filteredEvents = useMemo(() => {
    return eventsWithExams.filter(({ exam }) => {
      // Degree filter
      if (degreeFilter !== 'all' && exam.degree !== degreeFilter) return false;
      
      // If exam1 is selected, only show same degree
      if (selectedExam1) {
        const exam1 = exams.find(e => e.id === selectedExam1);
        if (exam1 && exam.degree !== exam1.degree) return false;
      }
      
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesStudent = exam.studentName.toLowerCase().includes(searchLower);
        const matchesTopic = exam.topic.toLowerCase().includes(searchLower);
        const examiner1 = getStaffById(exam.examiner1Id);
        const examiner2 = getStaffById(exam.examiner2Id);
        const matchesExaminer = 
          examiner1?.name?.toLowerCase().includes(searchLower) ||
          examiner2?.name?.toLowerCase().includes(searchLower);
        if (!matchesStudent && !matchesTopic && !matchesExaminer) return false;
      }
      
      return true;
    }).sort((a, b) => {
      // Sort by date, then time
      if (a.event.dayDate !== b.event.dayDate) return a.event.dayDate.localeCompare(b.event.dayDate);
      return a.event.startTime.localeCompare(b.event.startTime);
    });
  }, [eventsWithExams, search, degreeFilter, selectedExam1, exams, getStaffById]);
  
  // Get merged exam preview
  const mergePreview = useMemo(() => {
    if (!selectedExam1 || !selectedExam2) return null;
    
    const exam1 = exams.find(e => e.id === selectedExam1);
    const exam2 = exams.find(e => e.id === selectedExam2);
    if (!exam1 || !exam2) return null;
    
    const event1 = versionEvents.find(e => e.examId === selectedExam1);
    const event2 = versionEvents.find(e => e.examId === selectedExam2);
    if (!event1 || !event2) return null;
    
    // Collect unique examiners
    const examinerIds = [...new Set([
      exam1.examiner1Id,
      exam1.examiner2Id,
      exam2.examiner1Id,
      exam2.examiner2Id
    ])].filter(Boolean);
    
    const baseDuration = SLOT_DURATIONS[exam1.degree];
    const durationMinutes = baseDuration * 2;
    
    // Use earlier event's slot
    const earlierEvent = event1.startTime <= event2.startTime ? event1 : event2;
    const startMinutes = parseInt(earlierEvent.startTime.split(':')[0]) * 60 + parseInt(earlierEvent.startTime.split(':')[1]);
    const endMinutes = startMinutes + durationMinutes;
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;
    
    return {
      studentNames: [exam1.studentName, exam2.studentName],
      topic: exam1.topic === exam2.topic ? exam1.topic : `${exam1.topic} / ${exam2.topic}`,
      examinerIds,
      degree: exam1.degree,
      durationMinutes,
      dayDate: earlierEvent.dayDate,
      room: earlierEvent.room,
      startTime: earlierEvent.startTime,
      endTime,
    };
  }, [selectedExam1, selectedExam2, exams, versionEvents]);
  
  // Get eligible protocolists
  const eligibleProtocolists = useMemo(() => {
    return staff.filter(s => canBeProtocolist(s));
  }, [staff]);
  
  const handleSelectExam = (examId: string) => {
    if (!selectedExam1) {
      setSelectedExam1(examId);
    } else if (selectedExam1 === examId) {
      setSelectedExam1(null);
    } else if (!selectedExam2) {
      setSelectedExam2(examId);
    } else if (selectedExam2 === examId) {
      setSelectedExam2(null);
    } else {
      // Replace exam2
      setSelectedExam2(examId);
    }
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
    setDegreeFilter('all');
  };
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { 
      weekday: 'short', 
      day: '2-digit', 
      month: '2-digit'
    });
  };
  
  const isSelected = (examId: string) => examId === selectedExam1 || examId === selectedExam2;
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetSelection();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Merge className="h-4 w-4" />
          Kolloquien zusammenlegen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Kolloquien zusammenlegen (Teamarbeit)
          </DialogTitle>
          <DialogDescription>
            Wählen Sie zwei Kolloquien desselben Abschlusses aus, um sie zu einem Doppelslot zusammenzulegen.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Left: Selection list */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suchen..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={degreeFilter} onValueChange={(v) => setDegreeFilter(v as Degree | 'all')}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="BA">BA</SelectItem>
                  <SelectItem value="MA">MA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <ScrollArea className="h-[400px] border rounded-md p-2">
              {filteredEvents.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Keine Kolloquien gefunden
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredEvents.map(({ event, exam }) => {
                    const examiner1 = getStaffById(exam.examiner1Id);
                    const examiner2 = getStaffById(exam.examiner2Id);
                    const selected = isSelected(exam.id);
                    const kompetenzfeldDisplay = exam.degree === 'MA' ? KOMPETENZFELD_MASTER_LABEL : exam.kompetenzfeld;
                    
                    // Disable if different degree from first selection
                    const disabled = selectedExam1 && !selected && 
                      exams.find(e => e.id === selectedExam1)?.degree !== exam.degree;
                    
                    return (
                      <button
                        key={event.id}
                        onClick={() => !disabled && handleSelectExam(exam.id)}
                        disabled={disabled}
                        className={cn(
                          "w-full text-left p-3 rounded-md border-2 transition-all",
                          selected && "border-primary bg-primary/5",
                          !selected && !disabled && "border-border hover:border-primary/50",
                          disabled && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={exam.degree === 'BA' ? 'default' : 'secondary'} className="text-xs">
                                {exam.degree}
                              </Badge>
                              {kompetenzfeldDisplay && (
                                <Badge variant="outline" className="text-xs font-normal">
                                  {kompetenzfeldDisplay}
                                </Badge>
                              )}
                            </div>
                            <p className="font-medium truncate">{exam.studentName}</p>
                            <p className="text-xs text-muted-foreground truncate">{exam.topic}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(event.dayDate)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {event.startTime}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {event.room}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {examiner1?.name} / {examiner2?.name}
                            </div>
                          </div>
                          {selected && (
                            <div className="flex-shrink-0">
                              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                                <Check className="h-4 w-4 text-primary-foreground" />
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
          
          {/* Right: Preview */}
          <div className="space-y-3">
            <h3 className="font-semibold">Vorschau Team-Kolloquium</h3>
            
            {!selectedExam1 && !selectedExam2 ? (
              <div className="border-2 border-dashed rounded-md p-8 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Wählen Sie zwei Kolloquien aus der Liste aus</p>
              </div>
            ) : !mergePreview ? (
              <div className="border-2 border-dashed rounded-md p-8 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Wählen Sie ein zweites Kolloquium aus</p>
                <p className="text-xs mt-2">(gleicher Abschluss erforderlich)</p>
              </div>
            ) : (
              <div className="border-2 rounded-md p-4 space-y-4">
                <div>
                  <Badge variant={mergePreview.degree === 'BA' ? 'default' : 'secondary'} className="mb-2">
                    {mergePreview.degree} - Teamarbeit
                  </Badge>
                  <h4 className="font-semibold text-lg">
                    {mergePreview.studentNames.join(' & ')}
                  </h4>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {mergePreview.topic}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(mergePreview.dayDate)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{mergePreview.room}</span>
                  </div>
                  <div className="flex items-center gap-2 col-span-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {mergePreview.startTime} – {mergePreview.endTime}
                    </span>
                    <Badge variant="outline" className="ml-2">
                      {mergePreview.durationMinutes} Min.
                    </Badge>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Prüfer ({mergePreview.examinerIds.length})
                  </p>
                  <div className="grid grid-cols-2 gap-1 text-sm">
                    {mergePreview.examinerIds.map((id, idx) => {
                      const s = getStaffById(id);
                      return (
                        <span key={id} className="text-muted-foreground">
                          Prüfer {idx + 1}: {s?.name || '—'}
                        </span>
                      );
                    })}
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Protokollant</label>
                  <Select value={selectedProtocolist} onValueChange={setSelectedProtocolist}>
                    <SelectTrigger>
                      <SelectValue placeholder="Protokollant auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleProtocolists.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-start gap-2 p-3 bg-muted rounded-md text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Hinweis</p>
                    <p className="text-muted-foreground">
                      Die ursprünglichen Einzelkolloquien werden durch diesen Doppelslot ersetzt. 
                      Konflikte müssen ggf. manuell gelöst werden.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleMerge} 
            disabled={!selectedExam1 || !selectedExam2}
            className="gap-2"
          >
            <Merge className="h-4 w-4" />
            Zusammenlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}