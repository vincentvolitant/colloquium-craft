import { useState, useMemo } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { ExamCard } from '@/components/schedule/ExamCard';
import { ScheduleFilters } from '@/components/schedule/ScheduleFilters';
import { DaySelector } from '@/components/schedule/DaySelector';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Settings, FileSpreadsheet } from 'lucide-react';
import type { Degree, ScheduledEvent, Exam } from '@/types';
import { KOMPETENZFELD_MASTER_LABEL } from '@/types';

export function PublicScheduleView() {
  const { exams, staff, scheduledEvents, scheduleVersions, config, getStaffById } = useScheduleStore();
  
  // Get published version events
  const publishedVersion = scheduleVersions.find(v => v.status === 'published');
  const events = publishedVersion 
    ? scheduledEvents.filter(e => e.scheduleVersionId === publishedVersion.id)
    : [];
  
  // Filter state
  const [search, setSearch] = useState('');
  const [selectedDegree, setSelectedDegree] = useState<Degree | 'all'>('all');
  const [selectedKompetenzfeld, setSelectedKompetenzfeld] = useState('all');
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [selectedExaminer, setSelectedExaminer] = useState('all');
  const [selectedPublic, setSelectedPublic] = useState<'all' | 'public' | 'private'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'scheduled' | 'cancelled'>('all');
  
  // Get unique days from events
  const days = useMemo(() => {
    const uniqueDays = [...new Set(events.map(e => e.dayDate))].sort();
    return uniqueDays;
  }, [events]);
  
  const [selectedDay, setSelectedDay] = useState(days[0] || '');
  
  // Update selected day when days change
  useMemo(() => {
    if (days.length > 0 && !days.includes(selectedDay)) {
      setSelectedDay(days[0]);
    }
  }, [days, selectedDay]);
  
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
      
      // Day filter
      if (selectedDay && event.dayDate !== selectedDay) return false;
      
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesStudent = exam.studentName.toLowerCase().includes(searchLower);
        const matchesTopic = exam.topic.toLowerCase().includes(searchLower);
        if (!matchesStudent && !matchesTopic) return false;
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
  }, [events, exams, selectedDay, search, selectedDegree, selectedKompetenzfeld, selectedRoom, selectedExaminer, selectedPublic, selectedStatus]);
  
  // Group filtered events by room
  const eventsByRoom = useMemo(() => {
    const grouped = new Map<string, Array<{ event: ScheduledEvent; exam: Exam }>>();
    
    filteredEvents.forEach(event => {
      const exam = exams.find(e => e.id === event.examId);
      if (!exam) return;
      
      const roomEvents = grouped.get(event.room) || [];
      roomEvents.push({ event, exam });
      grouped.set(event.room, roomEvents);
    });
    
    // Sort events within each room by time
    grouped.forEach(roomEvents => {
      roomEvents.sort((a, b) => a.event.startTime.localeCompare(b.event.startTime));
    });
    
    return grouped;
  }, [filteredEvents, exams]);
  
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
                Prüfungstermine für Bachelor- und Masterarbeiten
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
            {/* Day Selector */}
            <DaySelector 
              days={days} 
              selectedDay={selectedDay} 
              onDayChange={setSelectedDay} 
            />
            
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
            
            {/* Schedule Grid by Room */}
            {filteredEvents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>Keine Prüfungen gefunden, die den Filterkriterien entsprechen.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {[...eventsByRoom.entries()].map(([room, roomEvents]) => (
                  <section key={room}>
                    <h2 className="text-xl font-semibold mb-4 pb-2 border-b-2">
                      {room}
                      <span className="text-muted-foreground font-normal ml-2">
                        ({roomEvents.length} Prüfungen)
                      </span>
                    </h2>
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
