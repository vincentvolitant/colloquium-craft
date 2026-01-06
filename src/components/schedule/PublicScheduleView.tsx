import { useState, useMemo } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { ExamCard } from '@/components/schedule/ExamCard';
import { ScheduleFilters } from '@/components/schedule/ScheduleFilters';
import { GanttView } from '@/components/schedule/GanttView';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Link } from 'react-router-dom';
import { Settings, FileSpreadsheet, LayoutGrid, GanttChart, CalendarDays } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Degree, ScheduledEvent, Exam } from '@/types';
import { KOMPETENZFELD_MASTER_LABEL } from '@/types';

export function PublicScheduleView() {
  const { exams, staff, scheduledEvents, scheduleVersions, config, getStaffById } = useScheduleStore();
  
  // Get published version events
  const publishedVersion = scheduleVersions.find(v => v.status === 'published');
  const events = publishedVersion 
    ? scheduledEvents.filter(e => e.scheduleVersionId === publishedVersion.id)
    : [];
  
  // View mode state
  const [viewMode, setViewMode] = useState<'cards' | 'gantt'>('cards');
  
  // Filter state
  const [search, setSearch] = useState('');
  const [selectedDegree, setSelectedDegree] = useState<Degree | 'all'>('all');
  const [selectedKompetenzfeld, setSelectedKompetenzfeld] = useState('all');
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [selectedExaminer, setSelectedExaminer] = useState('all');
  const [selectedPublic, setSelectedPublic] = useState<'all' | 'public' | 'private'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'scheduled' | 'cancelled'>('all');
  
  // Get configured days (show all days even if no events are scheduled on a day)
  const days = useMemo(() => {
    const configuredDays = [...config.days].sort();
    if (configuredDays.length > 0) return configuredDays;
    return [...new Set(events.map(e => e.dayDate))].sort();
  }, [config.days, events]);

  // Get unique values for filters
  const kompetenzfelder = useMemo(() => {
    const kfs = new Set<string>();
    exams.forEach(e => {
      if (e.degree === 'BA' && e.kompetenzfeld) {
        kfs.add(e.kompetenzfeld);
      }
    });
    return [...kfs].sort();
  }, [exams]);
  
  const rooms = useMemo(() => {
    return [...new Set(events.map(e => e.room))].sort();
  }, [events]);
  
  const examinersList = useMemo(() => {
    const examinerIds = new Set<string>();
    exams.forEach(e => {
      if (e.examiner1Id) examinerIds.add(e.examiner1Id);
      if (e.examiner2Id) examinerIds.add(e.examiner2Id);
    });
    events.forEach(e => {
      if (e.protocolistId) examinerIds.add(e.protocolistId);
    });
    return [...examinerIds]
      .map(id => ({ id, name: getStaffById(id)?.name || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exams, events, getStaffById]);
  
  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const exam = exams.find(e => e.id === event.examId);
      if (!exam) return false;
      
      // Search filter - includes student name, topic, and examiner names
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesStudent = exam.studentName.toLowerCase().includes(searchLower);
        const matchesTopic = exam.topic.toLowerCase().includes(searchLower);
        const examiner1Name = getStaffById(exam.examiner1Id)?.name?.toLowerCase() || '';
        const examiner2Name = getStaffById(exam.examiner2Id)?.name?.toLowerCase() || '';
        const protocolistName = getStaffById(event.protocolistId)?.name?.toLowerCase() || '';
        const matchesExaminer = examiner1Name.includes(searchLower) || 
                                examiner2Name.includes(searchLower) || 
                                protocolistName.includes(searchLower);
        if (!matchesStudent && !matchesTopic && !matchesExaminer) return false;
      }
      
      // Degree filter
      if (selectedDegree !== 'all' && exam.degree !== selectedDegree) return false;
      
      // Kompetenzfeld filter
      if (selectedKompetenzfeld !== 'all') {
        if (selectedKompetenzfeld === KOMPETENZFELD_MASTER_LABEL) {
          if (exam.degree !== 'MA') return false;
        } else {
          if (exam.kompetenzfeld !== selectedKompetenzfeld) return false;
        }
      }
      
      // Room filter
      if (selectedRoom !== 'all' && event.room !== selectedRoom) return false;
      
      // Examiner/Protocolist filter
      if (selectedExaminer !== 'all') {
        const matches = 
          exam.examiner1Id === selectedExaminer ||
          exam.examiner2Id === selectedExaminer ||
          event.protocolistId === selectedExaminer;
        if (!matches) return false;
      }
      
      // Public filter
      if (selectedPublic !== 'all') {
        if (selectedPublic === 'public' && !exam.isPublic) return false;
        if (selectedPublic === 'private' && exam.isPublic) return false;
      }
      
      // Status filter
      if (selectedStatus !== 'all' && event.status !== selectedStatus) return false;
      
      return true;
    });
  }, [events, exams, search, selectedDegree, selectedKompetenzfeld, selectedRoom, selectedExaminer, selectedPublic, selectedStatus]);
  
  // Group filtered events by day, then by room
  const eventsByDayAndRoom = useMemo(() => {
    const grouped = new Map<string, Map<string, Array<{ event: ScheduledEvent; exam: Exam }>>>();
    
    days.forEach(day => {
      grouped.set(day, new Map());
    });
    
    filteredEvents.forEach(event => {
      const exam = exams.find(e => e.id === event.examId);
      if (!exam) return;
      
      let dayMap = grouped.get(event.dayDate);
      if (!dayMap) {
        dayMap = new Map();
        grouped.set(event.dayDate, dayMap);
      }
      
      const roomEvents = dayMap.get(event.room) || [];
      roomEvents.push({ event, exam });
      dayMap.set(event.room, roomEvents);
    });
    
    // Sort events within each room by time
    grouped.forEach(dayMap => {
      dayMap.forEach(roomEvents => {
        roomEvents.sort((a, b) => a.event.startTime.localeCompare(b.event.startTime));
      });
    });
    
    return grouped;
  }, [filteredEvents, exams, days]);
  
  // Prepare data for Gantt view - grouped by day
  const ganttDataByDay = useMemo(() => {
    const grouped = new Map<string, { events: Array<{ event: ScheduledEvent; exam: Exam }>; rooms: string[] }>();
    
    days.forEach(day => {
      const dayEvents = filteredEvents.filter(e => e.dayDate === day);
      const dayExamEvents = dayEvents.map(event => {
        const exam = exams.find(e => e.id === event.examId);
        return exam ? { event, exam } : null;
      }).filter(Boolean) as Array<{ event: ScheduledEvent; exam: Exam }>;
      
      const rooms = [...new Set(dayEvents.map(e => e.room))].sort();
      grouped.set(day, { events: dayExamEvents, rooms });
    });
    
    return grouped;
  }, [filteredEvents, exams, days]);
  
  const activeFilterCount = [
    selectedDegree !== 'all',
    selectedKompetenzfeld !== 'all',
    selectedRoom !== 'all',
    selectedExaminer !== 'all',
    selectedPublic !== 'all',
    selectedStatus !== 'all',
    search !== '',
  ].filter(Boolean).length;
  
  const clearFilters = () => {
    setSearch('');
    setSelectedDegree('all');
    setSelectedKompetenzfeld('all');
    setSelectedRoom('all');
    setSelectedExaminer('all');
    setSelectedPublic('all');
    setSelectedStatus('all');
  };
  
  const hasSchedule = events.length > 0;
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-2 bg-card">
        <div className="container py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Kolloquiumsplaner</h1>
              <p className="text-muted-foreground mt-1">
                Fakultät Gestaltung
              </p>
            </div>
            <Link to="/admin">
              <Button variant="outline" className="gap-2">
                <Settings className="h-4 w-4" />
                Admin
              </Button>
            </Link>
          </div>
        </div>
      </header>
      
      <main className="container py-6 space-y-6">
        {!hasSchedule ? (
          <div className="text-center py-20">
            <FileSpreadsheet className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-2xl font-semibold mb-2">Noch kein Zeitplan veröffentlicht</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Der Kolloquiumsplan wird hier angezeigt, sobald er vom Administrator erstellt und veröffentlicht wurde.
            </p>
          </div>
        ) : (
        <>
            {/* Filters */}
            <ScheduleFilters
              search={search}
              onSearchChange={setSearch}
              selectedDegree={selectedDegree}
              onDegreeChange={setSelectedDegree}
              selectedKompetenzfeld={selectedKompetenzfeld}
              onKompetenzfeldChange={setSelectedKompetenzfeld}
              selectedRoom={selectedRoom}
              onRoomChange={setSelectedRoom}
              selectedExaminer={selectedExaminer}
              onExaminerChange={setSelectedExaminer}
              selectedPublic={selectedPublic}
              onPublicChange={setSelectedPublic}
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
              kompetenzfelder={kompetenzfelder}
              rooms={rooms}
              examiners={examinersList}
              onClearFilters={clearFilters}
              activeFilterCount={activeFilterCount}
            />
            
            {/* View Toggle */}
            <div className="flex justify-end">
              <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as 'cards' | 'gantt')}>
                <ToggleGroupItem value="cards" aria-label="Kartenansicht">
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  Karten
                </ToggleGroupItem>
                <ToggleGroupItem value="gantt" aria-label="Gantt-Ansicht">
                  <GanttChart className="h-4 w-4 mr-2" />
                  Gantt
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            
            {/* Schedule View */}
            {filteredEvents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>Keine Prüfungen gefunden, die den Filterkriterien entsprechen.</p>
              </div>
            ) : viewMode === 'gantt' ? (
              <div className="space-y-8">
                {[...ganttDataByDay.entries()].map(([day, { events: dayEvents, rooms }]) => {
                  const date = parseISO(day);
                  const dayName = format(date, 'EEEE', { locale: de });
                  const dateStr = format(date, 'd. MMMM yyyy', { locale: de });

                  return (
                    <section key={day}>
                      <h2 className="text-xl font-semibold mb-4 pb-2 border-b-2 flex items-center gap-2">
                        <CalendarDays className="h-5 w-5" />
                        {dayName}, {dateStr}
                        <span className="text-muted-foreground font-normal ml-2">
                          ({dayEvents.length} Prüfungen)
                        </span>
                      </h2>

                      {dayEvents.length === 0 ? (
                        <div className="border-2 rounded-md p-6 text-sm text-muted-foreground">
                          Keine Prüfungen für diesen Tag (oder durch Filter ausgeblendet).
                        </div>
                      ) : (
                        <GanttView events={dayEvents} rooms={rooms} />
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-10">
                {[...eventsByDayAndRoom.entries()].map(([day, roomMap]) => {
                  const date = parseISO(day);
                  const dayName = format(date, 'EEEE', { locale: de });
                  const dateStr = format(date, 'd. MMMM yyyy', { locale: de });
                  const totalForDay = [...roomMap.values()].reduce((sum, arr) => sum + arr.length, 0);

                  return (
                    <div key={day}>
                      <h2 className="text-2xl font-bold mb-6 pb-2 border-b-2 flex items-center gap-2">
                        <CalendarDays className="h-6 w-6" />
                        {dayName}, {dateStr}
                        <span className="text-muted-foreground font-normal text-lg ml-2">
                          ({totalForDay} Prüfungen)
                        </span>
                      </h2>

                      {totalForDay === 0 ? (
                        <div className="border-2 rounded-md p-6 text-sm text-muted-foreground">
                          Keine Prüfungen für diesen Tag (oder durch Filter ausgeblendet).
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {[...roomMap.entries()].map(([room, roomEvents]) => (
                            <section key={room}>
                              <h3 className="text-lg font-semibold mb-3 text-muted-foreground">
                                {room}
                                <span className="font-normal ml-2">
                                  ({roomEvents.length} Prüfungen)
                                </span>
                              </h3>
                              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {roomEvents.map(({ event, exam }) => (
                                  <ExamCard
                                    key={event.id}
                                    exam={exam}
                                    event={event}
                                    examiner1={getStaffById(exam.examiner1Id)}
                                    examiner2={getStaffById(exam.examiner2Id)}
                                    protocolist={getStaffById(event.protocolistId)}
                                  />
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
      
      {/* Footer */}
      <footer className="border-t-2 mt-12">
        <div className="container py-6 text-center text-sm text-muted-foreground">
          <p>Kolloquiumsplaner • Automatisch generierter Prüfungsplan</p>
        </div>
      </footer>
    </div>
  );
}
