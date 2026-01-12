import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, MapPin, Check, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useScheduleStore } from '@/store/scheduleStore';
import { getAllExaminerIds } from '@/types';
import { validateMergeSlot, type MergeSlotOption } from '@/lib/scheduler';
import type { ScheduledEvent } from '@/types';

interface MoveEventDialogProps {
  event: ScheduledEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newSlot: { dayDate: string; room: string; startTime: string; endTime: string }) => void;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function MoveEventDialog({ event, open, onOpenChange, onConfirm }: MoveEventDialogProps) {
  const { exams, staff, scheduledEvents, config, scheduleVersions, roomMappings } = useScheduleStore();
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [selectedSlot, setSelectedSlot] = useState<MergeSlotOption | null>(null);
  
  const exam = event ? exams.find(e => e.id === event.examId) : null;
  const activeVersion = scheduleVersions.find(v => v.status === 'published') || scheduleVersions[scheduleVersions.length - 1];
  
  // Calculate duration of current event
  const duration = event ? timeToMinutes(event.endTime) - timeToMinutes(event.startTime) : 0;
  
  // Find all valid slots
  const validSlots = useMemo((): MergeSlotOption[] => {
    if (!event || !exam || !activeVersion) return [];
    
    const examinerIds = getAllExaminerIds(exam);
    const slots: MergeSlotOption[] = [];
    const startMinutes = timeToMinutes(config.startTime);
    const endMinutes = timeToMinutes(config.endTime);
    
    // Get room preferences for this exam
    const preferredRooms = new Set<string>();
    if (exam.kompetenzfeld) {
      const mapping = roomMappings.find(m => 
        m.kompetenzfeld.toLowerCase() === exam.kompetenzfeld?.toLowerCase()
      );
      if (mapping) mapping.rooms.forEach(r => preferredRooms.add(r));
    }
    // Add Prüfer 1's rooms for MA
    if (exam.degree === 'MA') {
      const examiner1 = staff.find(s => s.id === exam.examiner1Id);
      if (examiner1?.primaryCompetenceField) {
        const mapping = roomMappings.find(m => 
          m.kompetenzfeld.toLowerCase() === examiner1.primaryCompetenceField!.toLowerCase()
        );
        if (mapping) mapping.rooms.forEach(r => preferredRooms.add(r));
      }
    }
    
    // All rooms as fallback
    const allRooms = config.rooms.map(r => r.name);
    const roomsToCheck = preferredRooms.size > 0 
      ? [...preferredRooms, ...allRooms.filter(r => !preferredRooms.has(r))]
      : allRooms;
    
    for (const day of config.days) {
      for (const room of roomsToCheck) {
        let currentTime = startMinutes;
        
        while (currentTime + duration <= endMinutes) {
          const slotStartTime = minutesToTime(currentTime);
          const slotEndTime = minutesToTime(currentTime + duration);
          
          // Skip current slot
          if (day === event.dayDate && room === event.room && slotStartTime === event.startTime) {
            currentTime += 15;
            continue;
          }
          
          // Validate this slot
          const validation = validateMergeSlot(
            { dayDate: day, room, startTime: slotStartTime, durationMinutes: duration },
            examinerIds,
            event.protocolistId || null,
            scheduledEvents.filter(e => e.scheduleVersionId === activeVersion.id),
            exams,
            staff,
            config,
            [event.id]
          );
          
          if (validation.valid) {
            slots.push({
              dayDate: day,
              room,
              startTime: slotStartTime,
              endTime: slotEndTime,
              isOriginal: false,
            });
          }
          
          currentTime += 15; // Try every 15 minutes
        }
      }
    }
    
    return slots;
  }, [event, exam, activeVersion, config, exams, staff, scheduledEvents, roomMappings, duration]);
  
  // Filter by selected day
  const filteredSlots = useMemo(() => {
    if (selectedDay === 'all') return validSlots;
    return validSlots.filter(s => s.dayDate === selectedDay);
  }, [validSlots, selectedDay]);
  
  // Group by day for better display
  const slotsByDay = useMemo(() => {
    const grouped = new Map<string, MergeSlotOption[]>();
    for (const slot of filteredSlots) {
      const existing = grouped.get(slot.dayDate) || [];
      existing.push(slot);
      grouped.set(slot.dayDate, existing);
    }
    return grouped;
  }, [filteredSlots]);
  
  const handleConfirm = () => {
    if (selectedSlot) {
      onConfirm({
        dayDate: selectedSlot.dayDate,
        room: selectedSlot.room,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
      });
      setSelectedSlot(null);
      setSelectedDay('all');
    }
  };
  
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedSlot(null);
      setSelectedDay('all');
    }
    onOpenChange(newOpen);
  };
  
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'EEE, dd.MM.yyyy', { locale: de });
    } catch {
      return dateStr;
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Termin verschieben
          </DialogTitle>
          <DialogDescription>
            {exam?.studentName} – Aktuell: {event?.dayDate} {event?.startTime}–{event?.endTime}, Raum {event?.room}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          {/* Day filter */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Tag filtern:</span>
            <Select value={selectedDay} onValueChange={setSelectedDay}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Alle Tage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Tage ({validSlots.length} Slots)</SelectItem>
                {config.days.map(day => {
                  const count = validSlots.filter(s => s.dayDate === day).length;
                  return (
                    <SelectItem key={day} value={day}>
                      {formatDate(day)} ({count})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          
          {filteredSlots.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground border rounded-lg">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Keine freien Slots verfügbar</p>
              <p className="text-sm mt-1">
                Alle Prüfer oder der Protokollant sind zu anderen Zeiten nicht verfügbar.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-72 border rounded-lg">
              <div className="p-2 space-y-4">
                {Array.from(slotsByDay.entries()).map(([day, daySlots]) => (
                  <div key={day}>
                    <div className="text-sm font-medium text-muted-foreground mb-2 sticky top-0 bg-background py-1">
                      {formatDate(day)}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {daySlots.slice(0, 15).map((slot, idx) => (
                        <button
                          key={`${slot.dayDate}-${slot.room}-${slot.startTime}`}
                          onClick={() => setSelectedSlot(slot)}
                          className={`p-2 text-left border rounded-lg hover:bg-muted/50 transition-colors ${
                            selectedSlot?.dayDate === slot.dayDate && 
                            selectedSlot?.room === slot.room && 
                            selectedSlot?.startTime === slot.startTime
                              ? 'border-primary bg-primary/5'
                              : ''
                          }`}
                        >
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Clock className="h-3 w-3" />
                            {slot.startTime}–{slot.endTime}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <MapPin className="h-3 w-3" />
                            {slot.room}
                          </div>
                        </button>
                      ))}
                      {daySlots.length > 15 && (
                        <div className="p-2 text-xs text-muted-foreground flex items-center justify-center">
                          +{daySlots.length - 15} weitere...
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          
          {selectedSlot && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="text-sm font-medium">Ausgewählter neuer Termin:</div>
              <div className="flex items-center gap-4 mt-1 text-sm">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDate(selectedSlot.dayDate)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {selectedSlot.startTime}–{selectedSlot.endTime}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {selectedSlot.room}
                </span>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedSlot}>
            <Check className="h-4 w-4 mr-2" />
            Verschieben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}