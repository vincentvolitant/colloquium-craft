import { useState, useMemo } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Clock, MapPin, User, Users, MoreVertical, XCircle, Check, CalendarDays, ArrowRight, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { ChangeProtocolistDialog } from './ChangeProtocolistDialog';
import { MoveEventDialog } from './MoveEventDialog';
import { MergeColloquiaDialog } from './MergeColloquiaDialog';
import type { ScheduledEvent } from '@/types';

export function AdminScheduleManager() {
  const { 
    exams, 
    scheduledEvents, 
    scheduleVersions, 
    getStaffById,
    updateScheduledEvent,
    cancelEvent,
  } = useScheduleStore();
  const { toast } = useToast();
  
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [eventToCancel, setEventToCancel] = useState<ScheduledEvent | null>(null);
  
  // Protocolist change dialog
  const [protocolistDialogOpen, setProtocolistDialogOpen] = useState(false);
  const [eventForProtocolist, setEventForProtocolist] = useState<ScheduledEvent | null>(null);
  
  // Move event dialog
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [eventToMove, setEventToMove] = useState<ScheduledEvent | null>(null);
  
  // Get active/published version
  const activeVersion = scheduleVersions.find(v => v.status === 'published') || scheduleVersions[scheduleVersions.length - 1];
  
  // Filter events for active version
  const versionEvents = useMemo(() => {
    if (!activeVersion) return [];
    return scheduledEvents.filter(e => e.scheduleVersionId === activeVersion.id);
  }, [scheduledEvents, activeVersion]);
  
  // Get unique days
  const days = useMemo(() => {
    const uniqueDays = [...new Set(versionEvents.map(e => e.dayDate))];
    return uniqueDays.sort();
  }, [versionEvents]);
  
  // Filter events by day
  const filteredEvents = useMemo(() => {
    if (selectedDay === 'all') return versionEvents;
    return versionEvents.filter(e => e.dayDate === selectedDay);
  }, [versionEvents, selectedDay]);
  
  // Group by day and sort by time
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, ScheduledEvent[]>();
    for (const event of filteredEvents) {
      const dayEvents = grouped.get(event.dayDate) || [];
      dayEvents.push(event);
      grouped.set(event.dayDate, dayEvents);
    }
    // Sort each day's events by time
    for (const [day, events] of grouped) {
      grouped.set(day, events.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    }
    return grouped;
  }, [filteredEvents]);
  
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'EEEE, dd.MM.yyyy', { locale: de });
    } catch {
      return dateStr;
    }
  };
  
  const handleCancelClick = (event: ScheduledEvent) => {
    setEventToCancel(event);
    setCancelReason('');
    setCancelDialogOpen(true);
  };
  
  const handleConfirmCancel = () => {
    if (eventToCancel) {
      cancelEvent(eventToCancel.id, cancelReason || undefined);
      toast({
        title: 'Termin abgesagt',
        description: 'Der Termin wurde als abgesagt markiert.',
      });
      setCancelDialogOpen(false);
      setEventToCancel(null);
    }
  };
  
  const handleReschedule = (event: ScheduledEvent) => {
    if (event.status === 'cancelled') {
      updateScheduledEvent({ ...event, status: 'scheduled', cancelledReason: undefined });
      toast({
        title: 'Termin wiederhergestellt',
        description: 'Der Termin wurde wieder aktiviert.',
      });
    }
  };
  
  const handleChangeProtocolist = (event: ScheduledEvent) => {
    setEventForProtocolist(event);
    setProtocolistDialogOpen(true);
  };
  
  const handleProtocolistConfirm = (newProtocolistId: string) => {
    if (eventForProtocolist) {
      updateScheduledEvent({ ...eventForProtocolist, protocolistId: newProtocolistId });
      const newProtocolist = getStaffById(newProtocolistId);
      toast({
        title: 'Protokollant geändert',
        description: `Neuer Protokollant: ${newProtocolist?.name || 'Unbekannt'}`,
      });
      setProtocolistDialogOpen(false);
      setEventForProtocolist(null);
    }
  };
  
  const handleMoveEvent = (event: ScheduledEvent) => {
    setEventToMove(event);
    setMoveDialogOpen(true);
  };
  
  const handleMoveConfirm = (newSlot: { dayDate: string; room: string; startTime: string; endTime: string }) => {
    if (eventToMove) {
      updateScheduledEvent({
        ...eventToMove,
        dayDate: newSlot.dayDate,
        room: newSlot.room,
        startTime: newSlot.startTime,
        endTime: newSlot.endTime,
      });
      toast({
        title: 'Termin verschoben',
        description: `Neuer Termin: ${formatDate(newSlot.dayDate)} ${newSlot.startTime}–${newSlot.endTime}, Raum ${newSlot.room}`,
      });
      setMoveDialogOpen(false);
      setEventToMove(null);
    }
  };
  
  if (!activeVersion) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Kein Plan vorhanden.</p>
          <p className="text-sm mt-1">Generieren Sie zuerst einen Plan.</p>
        </CardContent>
      </Card>
    );
  }
  
  if (versionEvents.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Keine Termine in diesem Plan.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-sm">Tag:</Label>
          <Select value={selectedDay} onValueChange={setSelectedDay}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Alle Tage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Tage ({versionEvents.length})</SelectItem>
              {days.map(day => (
                <SelectItem key={day} value={day}>
                  {formatDate(day)} ({versionEvents.filter(e => e.dayDate === day).length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <MergeColloquiaDialog />
        
        <div className="flex-1" />
        
        <div className="text-sm text-muted-foreground">
          {filteredEvents.filter(e => e.status === 'scheduled').length} aktive, {' '}
          {filteredEvents.filter(e => e.status === 'cancelled').length} abgesagt
        </div>
      </div>
      
      {/* Events by day */}
      <ScrollArea className="h-[600px] w-full">
        <div className="space-y-6 pr-4 overflow-hidden">
          {Array.from(eventsByDay.entries()).map(([day, dayEvents]) => (
            <div key={day}>
              <div className="sticky top-0 bg-background/95 backdrop-blur py-2 mb-2 z-10">
                <h3 className="font-semibold flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  {formatDate(day)}
                  <Badge variant="secondary" className="ml-2">{dayEvents.length} Termine</Badge>
                </h3>
              </div>
              
              <div className="space-y-2">
                {dayEvents.map(event => {
                  const exam = exams.find(e => e.id === event.examId);
                  const examiner1 = getStaffById(exam?.examiner1Id);
                  const examiner2 = getStaffById(exam?.examiner2Id);
                  const protocolist = getStaffById(event.protocolistId);
                  const isCancelled = event.status === 'cancelled';
                  
                  return (
                    <Card key={event.id} className={`overflow-hidden ${isCancelled ? 'opacity-60 border-destructive/30' : ''}`}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {/* Time & Room */}
                          <div className="w-24 shrink-0">
                            <div className="flex items-center gap-1 font-mono text-sm">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {event.startTime}–{event.endTime}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <MapPin className="h-3 w-3" />
                              {event.room}
                            </div>
                          </div>
                          
                          {/* Exam info */}
                          <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{exam?.studentName}</span>
                              {exam?.isTeam && (
                                <Badge variant="outline" className="text-xs">Team</Badge>
                              )}
                              <Badge variant="secondary" className="text-xs">{exam?.degree}</Badge>
                              {isCancelled && (
                                <Badge variant="destructive" className="text-xs">Abgesagt</Badge>
                              )}
                              {exam?.isPublic === false && (
                                <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                                  Nicht öffentlich
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 truncate">
                              {exam?.topic}
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                P1: {examiner1?.name || '—'}
                              </span>
                              {examiner2 && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  P2: {examiner2.name}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                Prot: {protocolist?.name || '—'}
                              </span>
                            </div>
                            {isCancelled && event.cancelledReason && (
                              <div className="text-xs text-destructive mt-1">
                                Grund: {event.cancelledReason}
                              </div>
                            )}
                          </div>
                          
                          {/* Actions */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleChangeProtocolist(event)}>
                                <Users className="h-4 w-4 mr-2" />
                                Protokollant ändern
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleMoveEvent(event)}>
                                <ArrowRight className="h-4 w-4 mr-2" />
                                Termin verschieben
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {isCancelled ? (
                                <DropdownMenuItem onClick={() => handleReschedule(event)}>
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Wiederherstellen
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem 
                                  onClick={() => handleCancelClick(event)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Absagen
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      
      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Termin absagen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie diesen Termin wirklich absagen? Der Termin wird als abgesagt markiert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="cancelReason" className="text-sm font-medium">
              Absagegrund (optional)
            </Label>
            <Textarea
              id="cancelReason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="z.B. Krankheit, Terminverschiebung..."
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Absagen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Protocolist Change Dialog */}
      <ChangeProtocolistDialog
        event={eventForProtocolist}
        open={protocolistDialogOpen}
        onOpenChange={setProtocolistDialogOpen}
        onConfirm={handleProtocolistConfirm}
      />
      
      {/* Move Event Dialog */}
      <MoveEventDialog
        event={eventToMove}
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        onConfirm={handleMoveConfirm}
      />
      
      {/* Merge Colloquia Dialog - it manages its own open state via trigger */}
    </div>
  );
}
