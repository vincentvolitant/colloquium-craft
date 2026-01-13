import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar, Clock, MapPin, Check, AlertTriangle, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
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
  const [activeTab, setActiveTab] = useState<string>('slots');
  
  // Manual input state
  const [manualDate, setManualDate] = useState<Date | undefined>(undefined);
  const [manualStartTime, setManualStartTime] = useState<string>('');
  const [manualEndTime, setManualEndTime] = useState<string>('');
  const [manualRoom, setManualRoom] = useState<string>('');
  
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
  
  // Validate manual input
  const isManualInputValid = useMemo(() => {
    if (!manualDate || !manualStartTime || !manualEndTime || !manualRoom) return false;
    // Check time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(manualStartTime) || !timeRegex.test(manualEndTime)) return false;
    // Check end > start
    if (timeToMinutes(manualEndTime) <= timeToMinutes(manualStartTime)) return false;
    return true;
  }, [manualDate, manualStartTime, manualEndTime, manualRoom]);
  
  const handleConfirm = () => {
    if (activeTab === 'slots' && selectedSlot) {
      onConfirm({
        dayDate: selectedSlot.dayDate,
        room: selectedSlot.room,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
      });
    } else if (activeTab === 'manual' && isManualInputValid && manualDate) {
      onConfirm({
        dayDate: format(manualDate, 'yyyy-MM-dd'),
        room: manualRoom,
        startTime: manualStartTime,
        endTime: manualEndTime,
      });
    }
    resetState();
  };
  
  const resetState = () => {
    setSelectedSlot(null);
    setSelectedDay('all');
    setActiveTab('slots');
    setManualDate(undefined);
    setManualStartTime('');
    setManualEndTime('');
    setManualRoom('');
  };
  
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    } else if (event) {
      // Pre-fill manual inputs with current values
      try {
        setManualDate(new Date(event.dayDate));
      } catch {
        setManualDate(undefined);
      }
      setManualStartTime(event.startTime);
      setManualEndTime(event.endTime);
      setManualRoom(event.room);
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
  
  const canConfirm = activeTab === 'slots' ? !!selectedSlot : isManualInputValid;
  
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
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="slots" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Verfügbare Slots
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Edit className="h-4 w-4" />
              Manuell eingeben
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="slots" className="space-y-4 mt-4">
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
                <p className="text-sm mt-2">
                  Nutzen Sie "Manuell eingeben" um trotzdem einen Termin festzulegen.
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
                        {daySlots.slice(0, 15).map((slot) => (
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
          </TabsContent>
          
          <TabsContent value="manual" className="space-y-4 mt-4">
            <div className="grid gap-4">
              {/* Date picker */}
              <div className="grid gap-2">
                <Label htmlFor="manual-date">Datum</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="manual-date"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !manualDate && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {manualDate ? format(manualDate, 'PPP', { locale: de }) : <span>Datum wählen</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={manualDate}
                      onSelect={setManualDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              {/* Time inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="manual-start">Startzeit</Label>
                  <Input
                    id="manual-start"
                    type="time"
                    value={manualStartTime}
                    onChange={(e) => setManualStartTime(e.target.value)}
                    placeholder="09:00"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="manual-end">Endzeit</Label>
                  <Input
                    id="manual-end"
                    type="time"
                    value={manualEndTime}
                    onChange={(e) => setManualEndTime(e.target.value)}
                    placeholder="09:30"
                  />
                </div>
              </div>
              
              {/* Room select */}
              <div className="grid gap-2">
                <Label htmlFor="manual-room">Raum</Label>
                <Select value={manualRoom} onValueChange={setManualRoom}>
                  <SelectTrigger id="manual-room">
                    <SelectValue placeholder="Raum wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {config.rooms.map(room => (
                      <SelectItem key={room.name} value={room.name}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Oder eigenen Raum eingeben:
                </p>
                <Input
                  placeholder="Eigener Raumname..."
                  value={config.rooms.some(r => r.name === manualRoom) ? '' : manualRoom}
                  onChange={(e) => setManualRoom(e.target.value)}
                />
              </div>
            </div>
            
            {isManualInputValid && manualDate && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="text-sm font-medium">Neuer Termin:</div>
                <div className="flex flex-wrap items-center gap-4 mt-1 text-sm">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {format(manualDate, 'EEE, dd.MM.yyyy', { locale: de })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {manualStartTime}–{manualEndTime}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {manualRoom}
                  </span>
                </div>
              </div>
            )}
            
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 inline-block mr-2" />
              Bei manueller Eingabe werden Konflikte (Prüfer/Protokollant bereits belegt) nicht automatisch geprüft.
            </div>
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            <Check className="h-4 w-4 mr-2" />
            Verschieben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}