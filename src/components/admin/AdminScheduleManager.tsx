import { useState, useMemo } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search, 
  X, 
  RotateCcw, 
  Clock, 
  MapPin, 
  Users,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { KOMPETENZFELD_MASTER_LABEL, getAllExaminerIds, getExamDisplayNames } from '@/types';
import type { ScheduledEvent } from '@/types';
import { MergeColloquiaDialog } from './MergeColloquiaDialog';

export function AdminScheduleManager() {
  const { 
    scheduledEvents, 
    scheduleVersions,
    exams, 
    getStaffById,
    cancelEvent,
    updateScheduledEvent
  } = useScheduleStore();
  const { toast } = useToast();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'cancelled'>('all');
  const [dayFilter, setDayFilter] = useState<string>('all');
  
  // Dialog states
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [reinstateDialogOpen, setReinstateDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduledEvent | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  
  // Get published version events, or latest version if none published
  const publishedVersion = scheduleVersions.find(v => v.status === 'published');
  const latestVersion = scheduleVersions[scheduleVersions.length - 1];
  const activeVersion = publishedVersion || latestVersion;
  
  const versionEvents = useMemo(() => {
    if (!activeVersion) return [];
    return scheduledEvents.filter(e => e.scheduleVersionId === activeVersion.id);
  }, [scheduledEvents, activeVersion]);
  
  // Get unique days from events
  const availableDays = useMemo(() => {
    const days = [...new Set(versionEvents.map(e => e.dayDate))];
    return days.sort();
  }, [versionEvents]);
  
  // Filter and search events
  const filteredEvents = useMemo(() => {
    return versionEvents.filter(event => {
      const exam = exams.find(e => e.id === event.examId);
      if (!exam) return false;
      
      // Status filter
      if (statusFilter !== 'all' && event.status !== statusFilter) return false;
      
      // Day filter
      if (dayFilter !== 'all' && event.dayDate !== dayFilter) return false;
      
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const examiner1 = getStaffById(exam.examiner1Id);
        const examiner2 = getStaffById(exam.examiner2Id);
        const protocolist = getStaffById(event.protocolistId);
        
        const matchesStudent = exam.studentName.toLowerCase().includes(searchLower);
        const matchesTopic = exam.topic.toLowerCase().includes(searchLower);
        const matchesExaminer = 
          examiner1?.name?.toLowerCase().includes(searchLower) ||
          examiner2?.name?.toLowerCase().includes(searchLower) ||
          protocolist?.name?.toLowerCase().includes(searchLower);
        const matchesRoom = event.room.toLowerCase().includes(searchLower);
        
        if (!matchesStudent && !matchesTopic && !matchesExaminer && !matchesRoom) {
          return false;
        }
      }
      
      return true;
    }).sort((a, b) => {
      // Sort by date, then time
      if (a.dayDate !== b.dayDate) return a.dayDate.localeCompare(b.dayDate);
      return a.startTime.localeCompare(b.startTime);
    });
  }, [versionEvents, exams, statusFilter, dayFilter, search, getStaffById]);
  
  const handleOpenCancelDialog = (event: ScheduledEvent) => {
    setSelectedEvent(event);
    setCancelReason('');
    setCancelDialogOpen(true);
  };
  
  const handleOpenReinstateDialog = (event: ScheduledEvent) => {
    setSelectedEvent(event);
    setReinstateDialogOpen(true);
  };
  
  const handleConfirmCancel = () => {
    if (!selectedEvent) return;
    
    cancelEvent(selectedEvent.id, cancelReason || undefined);
    
    toast({
      title: 'Termin abgesagt',
      description: 'Der Termin wurde als abgesagt markiert.',
    });
    
    setCancelDialogOpen(false);
    setSelectedEvent(null);
    setCancelReason('');
  };
  
  const handleConfirmReinstate = () => {
    if (!selectedEvent) return;
    
    updateScheduledEvent({
      ...selectedEvent,
      status: 'scheduled',
      cancelledReason: undefined,
      cancelledAt: undefined,
    });
    
    toast({
      title: 'Termin reaktiviert',
      description: 'Der Termin wurde wiederhergestellt.',
    });
    
    setReinstateDialogOpen(false);
    setSelectedEvent(null);
  };
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { 
      weekday: 'short', 
      day: '2-digit', 
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (!activeVersion || versionEvents.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Keine Termine vorhanden</h3>
          <p className="text-muted-foreground">
            Bitte generieren Sie zuerst einen Zeitplan im Tab "Generieren".
          </p>
        </CardContent>
      </Card>
    );
  }

  const scheduledCount = versionEvents.filter(e => e.status === 'scheduled').length;
  const cancelledCount = versionEvents.filter(e => e.status === 'cancelled').length;

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1">
            <Calendar className="h-3 w-3" />
            {versionEvents.length} Termine gesamt
          </Badge>
          <Badge variant="default" className="gap-1">
            {scheduledCount} aktiv
          </Badge>
          {cancelledCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <X className="h-3 w-3" />
              {cancelledCount} abgesagt
            </Badge>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <MergeColloquiaDialog />
          {!publishedVersion && (
            <Badge variant="secondary">Entwurf (nicht veröffentlicht)</Badge>
          )}
        </div>
      </div>
      
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen nach Name, Thema, Prüfer, Raum..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="scheduled">Aktiv</SelectItem>
                <SelectItem value="cancelled">Abgesagt</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dayFilter} onValueChange={setDayFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Tage</SelectItem>
                {availableDays.map(day => (
                  <SelectItem key={day} value={day}>
                    {formatDate(day)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {/* Events list */}
      <div className="space-y-3">
        {filteredEvents.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Keine Termine gefunden.
            </CardContent>
          </Card>
        ) : (
          filteredEvents.map(event => {
            const exam = exams.find(e => e.id === event.examId);
            if (!exam) return null;
            
            const examiner1 = getStaffById(exam.examiner1Id);
            const examiner2 = getStaffById(exam.examiner2Id);
            const protocolist = getStaffById(event.protocolistId);
            const isCancelled = event.status === 'cancelled';
            const kompetenzfeldDisplay = exam.degree === 'MA' ? KOMPETENZFELD_MASTER_LABEL : exam.kompetenzfeld;
            
            // Team exam support
            const isTeam = exam.isTeam;
            const displayNames = getExamDisplayNames(exam);
            const allExaminerIds = getAllExaminerIds(exam);
            const allExaminers = allExaminerIds.map(id => getStaffById(id));
            
            return (
              <Card 
                key={event.id}
                className={cn(
                  "border-2 transition-all",
                  isCancelled && "bg-muted/50",
                  isTeam && "border-primary/50"
                )}
              >
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-2 items-center mb-2">
                        <Badge variant={exam.degree === 'BA' ? 'default' : 'secondary'}>
                          {exam.degree}
                        </Badge>
                        {isTeam && (
                          <Badge variant="outline" className="gap-1 bg-primary/10">
                            <Users className="h-3 w-3" />
                            Teamarbeit
                          </Badge>
                        )}
                        {kompetenzfeldDisplay && (
                          <Badge variant="outline" className="font-normal">
                            {kompetenzfeldDisplay}
                          </Badge>
                        )}
                        {isCancelled && (
                          <Badge variant="destructive" className="gap-1">
                            <X className="h-3 w-3" />
                            Abgesagt
                          </Badge>
                        )}
                      </div>
                      <CardTitle className={cn(
                        "text-lg",
                        isCancelled && "line-through text-muted-foreground"
                      )}>
                        {displayNames.join(' & ')}
                      </CardTitle>
                      <p className={cn(
                        "text-sm text-muted-foreground line-clamp-1",
                        isCancelled && "line-through"
                      )}>
                        {exam.topic}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {isCancelled ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => handleOpenReinstateDialog(event)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Reaktivieren
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-1"
                          onClick={() => handleOpenCancelDialog(event)}
                        >
                          <X className="h-4 w-4" />
                          Absagen
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 px-4 pb-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4 flex-shrink-0" />
                      <span>{formatDate(event.dayDate)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4 flex-shrink-0" />
                      <span>{event.startTime} – {event.endTime}</span>
                      {isTeam && (
                        <Badge variant="secondary" className="text-xs ml-1">
                          {event.durationMinutes || exam.durationMinutes} Min.
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4 flex-shrink-0" />
                      <span>{event.room}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-muted-foreground mt-3">
                    <Users className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {isTeam && allExaminers.length > 0 ? (
                        // Team: show all examiners
                        <>
                          {allExaminers.map((examiner, idx) => (
                            <span key={idx}>
                              <strong>Prüfer {idx + 1}:</strong> {examiner?.name || '—'}
                            </span>
                          ))}
                          <span><strong>Protokoll:</strong> {protocolist?.name || '—'}</span>
                        </>
                      ) : (
                        // Regular: show 2 examiners
                        <>
                          <span><strong>Prüfer 1:</strong> {examiner1?.name || '—'}</span>
                          <span><strong>Prüfer 2:</strong> {examiner2?.name || '—'}</span>
                          <span><strong>Protokoll:</strong> {protocolist?.name || '—'}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {isCancelled && event.cancelledReason && (
                    <p className="mt-3 text-sm text-destructive italic">
                      Grund: {event.cancelledReason}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
                    <div className="flex gap-2 flex-shrink-0">
                      {isCancelled ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => handleOpenReinstateDialog(event)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Reaktivieren
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-1"
                          onClick={() => handleOpenCancelDialog(event)}
                        >
                          <X className="h-4 w-4" />
                          Absagen
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 px-4 pb-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4 flex-shrink-0" />
                      <span>{formatDate(event.dayDate)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4 flex-shrink-0" />
                      <span>{event.startTime} – {event.endTime}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4 flex-shrink-0" />
                      <span>{event.room}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-muted-foreground mt-3">
                    <Users className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span><strong>Prüfer 1:</strong> {examiner1?.name || '—'}</span>
                      <span><strong>Prüfer 2:</strong> {examiner2?.name || '—'}</span>
                      <span><strong>Protokoll:</strong> {protocolist?.name || '—'}</span>
                    </div>
                  </div>
                  {isCancelled && event.cancelledReason && (
                    <p className="mt-3 text-sm text-destructive italic">
                      Grund: {event.cancelledReason}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
      
      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Termin absagen</DialogTitle>
            <DialogDescription>
              {selectedEvent && exams.find(e => e.id === selectedEvent.examId)?.studentName}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Grund (optional)</label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="z.B. Krankheit, Terminverschiebung..."
              className="mt-2"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel}>
              Termin absagen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Reinstate Dialog */}
      <Dialog open={reinstateDialogOpen} onOpenChange={setReinstateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Termin reaktivieren</DialogTitle>
            <DialogDescription>
              Möchten Sie diesen Termin wiederherstellen?
              {selectedEvent && (
                <span className="block mt-2 font-medium text-foreground">
                  {exams.find(e => e.id === selectedEvent.examId)?.studentName}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReinstateDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleConfirmReinstate}>
              Reaktivieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
