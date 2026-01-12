import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Users, Check, Clock, AlertTriangle, Star } from 'lucide-react';
import { useScheduleStore } from '@/store/scheduleStore';
import { canBeProtocolist, getAllExaminerIds } from '@/types';
import { isStaffAvailableForSlot } from '@/lib/scheduler';
import type { ScheduledEvent, StaffMember } from '@/types';

interface ChangeProtocolistDialogProps {
  event: ScheduledEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newProtocolistId: string) => void;
}

interface ProtocolistCandidate {
  staff: StaffMember;
  available: boolean;
  notDoubleBooked: boolean;
  breakRuleOk: boolean;
  supervisionCount: number;
  protocolCount: number;
  score: number;
  reasons: string[];
}

// Constants for break rule
const MAX_CONSECUTIVE = 4;
const BREAK_DURATION = 45;
const GAP_TOLERANCE = 5;

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

export function ChangeProtocolistDialog({ event, open, onOpenChange, onConfirm }: ChangeProtocolistDialogProps) {
  const { staff, exams, scheduledEvents, config, scheduleVersions, getStaffById } = useScheduleStore();
  const [selectedProtocolistId, setSelectedProtocolistId] = useState<string>('');
  
  const exam = event ? exams.find(e => e.id === event.examId) : null;
  const activeVersion = scheduleVersions.find(v => v.status === 'published') || scheduleVersions[scheduleVersions.length - 1];
  
  const candidates = useMemo((): ProtocolistCandidate[] => {
    if (!event || !exam || !activeVersion) return [];
    
    const slotStart = timeToMinutes(event.startTime);
    const slotEnd = timeToMinutes(event.endTime);
    const examinerIds = getAllExaminerIds(exam);
    
    // Get all events for this version on same day
    const dayEvents = scheduledEvents.filter(e => 
      e.scheduleVersionId === activeVersion.id && 
      e.dayDate === event.dayDate && 
      e.status === 'scheduled' &&
      e.id !== event.id
    );
    
    // Calculate loads
    const versionEvents = scheduledEvents.filter(e => 
      e.scheduleVersionId === activeVersion.id && 
      e.status === 'scheduled'
    );
    const supervisionCounts = new Map<string, number>();
    const protocolCounts = new Map<string, number>();
    
    for (const e of versionEvents) {
      const ex = exams.find(ex => ex.id === e.examId);
      if (ex) {
        const exIds = getAllExaminerIds(ex);
        for (const id of exIds) {
          supervisionCounts.set(id, (supervisionCounts.get(id) || 0) + 1);
        }
      }
      if (e.protocolistId) {
        protocolCounts.set(e.protocolistId, (protocolCounts.get(e.protocolistId) || 0) + 1);
      }
    }
    
    return staff
      .filter(s => canBeProtocolist(s) && !examinerIds.includes(s.id))
      .map(s => {
        const reasons: string[] = [];
        
        // Check availability
        const durationMinutes = slotEnd - slotStart;
        const available = isStaffAvailableForSlot(s, event.dayDate, event.startTime, durationMinutes, config);
        if (!available) reasons.push('Nicht verfügbar (Zeitbeschränkung)');
        
        // Check double booking
        let notDoubleBooked = true;
        for (const other of dayEvents) {
          const otherStart = timeToMinutes(other.startTime);
          const otherEnd = timeToMinutes(other.endTime);
          // Overlap check
          if (!(slotEnd <= otherStart || slotStart >= otherEnd)) {
            const otherExam = exams.find(e => e.id === other.examId);
            const otherExaminerIds = otherExam ? getAllExaminerIds(otherExam) : [];
            if (otherExaminerIds.includes(s.id) || other.protocolistId === s.id) {
              notDoubleBooked = false;
              reasons.push('Bereits eingeteilt zur selben Zeit');
              break;
            }
          }
        }
        
        // Check break rule (simplified)
        let breakRuleOk = true;
        const staffDayEvents = dayEvents.filter(e => {
          const ex = exams.find(ex => ex.id === e.examId);
          const exIds = ex ? getAllExaminerIds(ex) : [];
          return exIds.includes(s.id) || e.protocolistId === s.id;
        }).sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
        
        // Count consecutive exams before this slot
        let consecutiveCount = 0;
        let lastEndTime = 0;
        for (const e of staffDayEvents) {
          const eStart = timeToMinutes(e.startTime);
          const eEnd = timeToMinutes(e.endTime);
          if (eStart >= slotStart) continue;
          
          if (lastEndTime > 0 && eStart - lastEndTime >= BREAK_DURATION) {
            consecutiveCount = 1;
          } else if (lastEndTime > 0 && eStart <= lastEndTime + GAP_TOLERANCE) {
            consecutiveCount++;
          } else {
            consecutiveCount = 1;
          }
          lastEndTime = eEnd;
        }
        
        if (consecutiveCount >= MAX_CONSECUTIVE && lastEndTime > 0) {
          if (slotStart - lastEndTime < BREAK_DURATION) {
            breakRuleOk = false;
            reasons.push('Würde Pausenregel verletzen (>4 Prüfungen ohne 45min Pause)');
          }
        }
        
        const supervisionCount = supervisionCounts.get(s.id) || 0;
        const protocolCount = protocolCounts.get(s.id) || 0;
        
        // Score: lower is better
        let score = 0;
        score += protocolCount * 2; // Prefer staff with fewer protocols
        score += supervisionCount * 0.5; // Slightly prefer staff with fewer supervisions
        if (!available) score += 1000;
        if (!notDoubleBooked) score += 1000;
        if (!breakRuleOk) score += 100;
        
        return {
          staff: s,
          available,
          notDoubleBooked,
          breakRuleOk,
          supervisionCount,
          protocolCount,
          score,
          reasons,
        };
      })
      .sort((a, b) => a.score - b.score);
  }, [event, exam, activeVersion, staff, exams, scheduledEvents, config]);
  
  const eligibleCandidates = candidates.filter(c => c.available && c.notDoubleBooked);
  const currentProtocolist = event ? getStaffById(event.protocolistId) : null;
  
  const handleConfirm = () => {
    if (selectedProtocolistId) {
      onConfirm(selectedProtocolistId);
      setSelectedProtocolistId('');
    }
  };
  
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) setSelectedProtocolistId('');
    onOpenChange(newOpen);
  };
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Protokollant ändern
          </DialogTitle>
          <DialogDescription>
            {exam?.studentName} – {event?.dayDate} {event?.startTime}–{event?.endTime}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          {currentProtocolist && (
            <div className="p-3 bg-muted rounded-lg">
              <span className="text-sm text-muted-foreground">Aktueller Protokollant:</span>
              <span className="ml-2 font-medium">{currentProtocolist.name}</span>
            </div>
          )}
          
          <div className="text-sm font-medium">
            Verfügbare Protokollanten ({eligibleCandidates.length})
          </div>
          
          {eligibleCandidates.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground border rounded-lg">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Keine verfügbaren Protokollanten für diesen Zeitslot.</p>
            </div>
          ) : (
            <ScrollArea className="h-64 border rounded-lg">
              <RadioGroup value={selectedProtocolistId} onValueChange={setSelectedProtocolistId} className="p-2">
                {eligibleCandidates.map((candidate, idx) => (
                  <div 
                    key={candidate.staff.id} 
                    className={`flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer ${
                      candidate.staff.id === event?.protocolistId ? 'bg-muted' : ''
                    }`}
                    onClick={() => setSelectedProtocolistId(candidate.staff.id)}
                  >
                    <RadioGroupItem value={candidate.staff.id} id={candidate.staff.id} />
                    <Label htmlFor={candidate.staff.id} className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{candidate.staff.name}</span>
                        {idx === 0 && (
                          <Badge variant="outline" className="text-xs gap-1 bg-green-50 text-green-700 border-green-200">
                            <Star className="h-3 w-3" />
                            Empfohlen
                          </Badge>
                        )}
                        {candidate.staff.id === event?.protocolistId && (
                          <Badge variant="secondary" className="text-xs">Aktuell</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex gap-3 mt-1">
                        <span>Protokolle: {candidate.protocolCount}</span>
                        <span>Prüfungen: {candidate.supervisionCount}</span>
                        {!candidate.breakRuleOk && (
                          <span className="text-yellow-600 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Pausenwarnung
                          </span>
                        )}
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </ScrollArea>
          )}
          
          {candidates.filter(c => !c.available || !c.notDoubleBooked).length > 0 && (
            <details className="text-sm">
              <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                {candidates.filter(c => !c.available || !c.notDoubleBooked).length} nicht verfügbar
              </summary>
              <div className="mt-2 pl-4 space-y-1 text-muted-foreground">
                {candidates.filter(c => !c.available || !c.notDoubleBooked).slice(0, 5).map(c => (
                  <div key={c.staff.id} className="text-xs">
                    <span className="font-medium">{c.staff.name}:</span> {c.reasons.join(', ')}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!selectedProtocolistId || selectedProtocolistId === event?.protocolistId}
          >
            <Check className="h-4 w-4 mr-2" />
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}