import { useState, useMemo, useCallback, useRef } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { StaffMultiSelect } from './StaffMultiSelect';
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown, Undo2, Redo2, Save, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Exam, ScheduledEvent, StaffMember } from '@/types';
import { getAllExaminerIds } from '@/types';

// Edit history for undo/redo
interface EditAction {
  type: 'exam' | 'event';
  id: string;
  before: Exam | ScheduledEvent;
  after: Exam | ScheduledEvent;
}

type SortField = 'status' | 'degree' | 'kompetenzfeld' | 'student' | 'topic' | 'date' | 'startTime' | 'room' | 'public';
type SortDir = 'asc' | 'desc';

export function AdminTableEditor() {
  const {
    exams,
    staff,
    scheduledEvents,
    scheduleVersions,
    config,
    getStaffById,
    updateScheduledEvent,
    updateExam,
  } = useScheduleStore();
  const { toast } = useToast();

  // Filters
  const [search, setSearch] = useState('');
  const [filterDay, setFilterDay] = useState('all');
  const [filterDegree, setFilterDegree] = useState('all');
  const [filterRoom, setFilterRoom] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPublic, setFilterPublic] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Editing state
  const [editingCell, setEditingCell] = useState<{ eventId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Undo/redo
  const [undoStack, setUndoStack] = useState<EditAction[]>([]);
  const [redoStack, setRedoStack] = useState<EditAction[]>([]);

  // Unsaved changes counter
  const [changeCount, setChangeCount] = useState(0);

  const activeVersion = scheduleVersions.find(v => v.status === 'published') || scheduleVersions[scheduleVersions.length - 1];

  const versionEvents = useMemo(() => {
    if (!activeVersion) return [];
    return scheduledEvents.filter(e => e.scheduleVersionId === activeVersion.id);
  }, [scheduledEvents, activeVersion]);

  // Enriched rows
  const rows = useMemo(() => {
    return versionEvents.map(event => {
      const exam = exams.find(e => e.id === event.examId);
      return { event, exam };
    }).filter(r => r.exam);
  }, [versionEvents, exams]);

  // Unique values for filters
  const uniqueDays = useMemo(() => [...new Set(versionEvents.map(e => e.dayDate))].sort(), [versionEvents]);
  const uniqueRooms = useMemo(() => [...new Set(versionEvents.map(e => e.room))].sort(), [versionEvents]);

  // Apply filters
  const filteredRows = useMemo(() => {
    return rows.filter(({ event, exam }) => {
      if (!exam) return false;
      if (filterDay !== 'all' && event.dayDate !== filterDay) return false;
      if (filterDegree !== 'all' && exam.degree !== filterDegree) return false;
      if (filterRoom !== 'all' && event.room !== filterRoom) return false;
      if (filterStatus !== 'all' && event.status !== filterStatus) return false;
      if (filterPublic !== 'all') {
        if (filterPublic === 'public' && !exam.isPublic) return false;
        if (filterPublic === 'private' && exam.isPublic) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const examiner1 = getStaffById(exam.examiner1Id);
        const examiner2 = getStaffById(exam.examiner2Id);
        const protocolist = getStaffById(event.protocolistId);
        const searchable = [
          exam.studentName, exam.topic, exam.kompetenzfeld,
          examiner1?.name, examiner2?.name, protocolist?.name,
          event.room,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterDay, filterDegree, filterRoom, filterStatus, filterPublic, search, getStaffById]);

  // Sort
  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      const ea = a.exam!;
      const eb = b.exam!;
      let cmp = 0;
      switch (sortField) {
        case 'status': cmp = a.event.status.localeCompare(b.event.status); break;
        case 'degree': cmp = ea.degree.localeCompare(eb.degree); break;
        case 'kompetenzfeld': cmp = (ea.kompetenzfeld || '').localeCompare(eb.kompetenzfeld || ''); break;
        case 'student': cmp = ea.studentName.localeCompare(eb.studentName); break;
        case 'topic': cmp = ea.topic.localeCompare(eb.topic); break;
        case 'date': cmp = a.event.dayDate.localeCompare(b.event.dayDate) || a.event.startTime.localeCompare(b.event.startTime); break;
        case 'startTime': cmp = a.event.startTime.localeCompare(b.event.startTime); break;
        case 'room': cmp = a.event.room.localeCompare(b.event.room); break;
        case 'public': cmp = (ea.isPublic ? 1 : 0) - (eb.isPublic ? 1 : 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredRows, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  // Edit handlers
  const pushEdit = useCallback((action: EditAction) => {
    setUndoStack(prev => [...prev.slice(-19), action]);
    setRedoStack([]);
    setChangeCount(c => c + 1);
  }, []);

  const startEdit = (eventId: string, field: string, value: string) => {
    setEditingCell({ eventId, field });
    setEditValue(value);
  };

  const commitEdit = (eventId: string, field: string) => {
    const row = rows.find(r => r.event.id === eventId);
    if (!row || !row.exam) return;

    const { event, exam } = row;

    if (field === 'topic' && editValue !== exam.topic) {
      pushEdit({ type: 'exam', id: exam.id, before: { ...exam }, after: { ...exam, topic: editValue } });
      updateExam({ ...exam, topic: editValue });
    } else if (field === 'room' && editValue !== event.room) {
      pushEdit({ type: 'event', id: event.id, before: { ...event }, after: { ...event, room: editValue } });
      updateScheduledEvent({ ...event, room: editValue });
    } else if (field === 'startTime' && editValue !== event.startTime) {
      pushEdit({ type: 'event', id: event.id, before: { ...event }, after: { ...event, startTime: editValue } });
      updateScheduledEvent({ ...event, startTime: editValue });
    } else if (field === 'endTime' && editValue !== event.endTime) {
      pushEdit({ type: 'event', id: event.id, before: { ...event }, after: { ...event, endTime: editValue } });
      updateScheduledEvent({ ...event, endTime: editValue });
    } else if (field === 'cancelReason' && editValue !== (event.cancelledReason || '')) {
      pushEdit({ type: 'event', id: event.id, before: { ...event }, after: { ...event, cancelledReason: editValue || undefined } });
      updateScheduledEvent({ ...event, cancelledReason: editValue || undefined });
    }

    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, eventId: string, field: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitEdit(eventId, field);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const handleStatusToggle = (event: ScheduledEvent) => {
    const newStatus = event.status === 'scheduled' ? 'cancelled' : 'scheduled';
    pushEdit({ type: 'event', id: event.id, before: { ...event }, after: { ...event, status: newStatus as 'scheduled' | 'cancelled' } });
    updateScheduledEvent({ ...event, status: newStatus as 'scheduled' | 'cancelled' });
  };

  const handlePublicToggle = (exam: Exam) => {
    pushEdit({ type: 'exam', id: exam.id, before: { ...exam }, after: { ...exam, isPublic: !exam.isPublic } });
    updateExam({ ...exam, isPublic: !exam.isPublic });
  };

  const handleDateChange = (event: ScheduledEvent, newDate: string) => {
    if (newDate !== event.dayDate) {
      pushEdit({ type: 'event', id: event.id, before: { ...event }, after: { ...event, dayDate: newDate } });
      updateScheduledEvent({ ...event, dayDate: newDate });
    }
  };

  const handleExaminerChange = (exam: Exam, field: 'examiner1Id' | 'examiner2Id', newId: string) => {
    if (newId !== exam[field]) {
      pushEdit({ type: 'exam', id: exam.id, before: { ...exam }, after: { ...exam, [field]: newId } });
      updateExam({ ...exam, [field]: newId });
    }
  };

  const handleProtocolistChange = (event: ScheduledEvent, newId: string) => {
    if (newId !== event.protocolistId) {
      pushEdit({ type: 'event', id: event.id, before: { ...event }, after: { ...event, protocolistId: newId } });
      updateScheduledEvent({ ...event, protocolistId: newId });
    }
  };

  const undo = () => {
    const action = undoStack[undoStack.length - 1];
    if (!action) return;
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, action]);

    if (action.type === 'exam') {
      updateExam(action.before as Exam);
    } else {
      updateScheduledEvent(action.before as ScheduledEvent);
    }
    setChangeCount(c => c - 1);
    toast({ title: 'Rückgängig', description: 'Letzte Änderung wurde rückgängig gemacht.' });
  };

  const redo = () => {
    const action = redoStack[redoStack.length - 1];
    if (!action) return;
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, action]);

    if (action.type === 'exam') {
      updateExam(action.after as Exam);
    } else {
      updateScheduledEvent(action.after as ScheduledEvent);
    }
    setChangeCount(c => c + 1);
    toast({ title: 'Wiederherstellen', description: 'Änderung wurde wiederhergestellt.' });
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'EEE dd.MM', { locale: de });
    } catch {
      return dateStr;
    }
  };

  const activeFilterCount = [filterDay, filterDegree, filterRoom, filterStatus, filterPublic]
    .filter(v => v !== 'all').length + (search ? 1 : 0);

  const clearFilters = () => {
    setSearch('');
    setFilterDay('all');
    setFilterDegree('all');
    setFilterRoom('all');
    setFilterStatus('all');
    setFilterPublic('all');
  };

  const protocolEligibleStaff = staff.filter(s => s.canProtocol);

  if (!activeVersion) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Kein Plan vorhanden. Generieren Sie zuerst einen Plan.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Button
          variant={showFilters ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-1.5"
        >
          <Filter className="h-4 w-4" />
          Filter
          {activeFilterCount > 0 && (
            <Badge variant="default" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-3.5 w-3.5" />
            Zurücksetzen
          </Button>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={undo} disabled={undoStack.length === 0} title="Rückgängig">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={redo} disabled={redoStack.length === 0} title="Wiederherstellen">
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>

        {changeCount > 0 && (
          <Badge variant="outline" className="text-xs">
            {changeCount} Änderung{changeCount > 1 ? 'en' : ''}
          </Badge>
        )}

        <Badge variant="secondary" className="text-xs">
          {sortedRows.length}/{rows.length} Termine
        </Badge>
      </div>

      {/* Filter row */}
      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 border rounded-lg bg-muted/30">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tag</Label>
            <Select value={filterDay} onValueChange={setFilterDay}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                {uniqueDays.map(d => <SelectItem key={d} value={d}>{formatDate(d)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Abschluss</Label>
            <Select value={filterDegree} onValueChange={setFilterDegree}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="BA">BA</SelectItem>
                <SelectItem value="MA">MA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Raum</Label>
            <Select value={filterRoom} onValueChange={setFilterRoom}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                {uniqueRooms.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="scheduled">Geplant</SelectItem>
                <SelectItem value="cancelled">Abgesagt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Öffentl.</Label>
            <Select value={filterPublic} onValueChange={setFilterPublic}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="public">Öffentlich</SelectItem>
                <SelectItem value="private">Nicht öffentlich</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="px-2 py-2 text-left font-medium text-xs cursor-pointer whitespace-nowrap border-b" onClick={() => toggleSort('status')}>
                  <span className="flex items-center gap-1">St. <SortIcon field="status" /></span>
                </th>
                <th className="px-2 py-2 text-left font-medium text-xs cursor-pointer whitespace-nowrap border-b" onClick={() => toggleSort('degree')}>
                  <span className="flex items-center gap-1">Abschl. <SortIcon field="degree" /></span>
                </th>
                <th className="px-2 py-2 text-left font-medium text-xs cursor-pointer whitespace-nowrap border-b" onClick={() => toggleSort('kompetenzfeld')}>
                  <span className="flex items-center gap-1">KF <SortIcon field="kompetenzfeld" /></span>
                </th>
                <th className="px-2 py-2 text-left font-medium text-xs cursor-pointer whitespace-nowrap border-b" onClick={() => toggleSort('student')}>
                  <span className="flex items-center gap-1">Student <SortIcon field="student" /></span>
                </th>
                <th className="px-2 py-2 text-left font-medium text-xs cursor-pointer whitespace-nowrap border-b min-w-[150px]" onClick={() => toggleSort('topic')}>
                  <span className="flex items-center gap-1">Thema <SortIcon field="topic" /></span>
                </th>
                <th className="px-2 py-2 text-left font-medium text-xs whitespace-nowrap border-b">P1</th>
                <th className="px-2 py-2 text-left font-medium text-xs whitespace-nowrap border-b">P2</th>
                <th className="px-2 py-2 text-left font-medium text-xs whitespace-nowrap border-b">Prot.</th>
                <th className="px-2 py-2 text-left font-medium text-xs cursor-pointer whitespace-nowrap border-b" onClick={() => toggleSort('date')}>
                  <span className="flex items-center gap-1">Datum <SortIcon field="date" /></span>
                </th>
                <th className="px-2 py-2 text-left font-medium text-xs whitespace-nowrap border-b">Start</th>
                <th className="px-2 py-2 text-left font-medium text-xs whitespace-nowrap border-b">Ende</th>
                <th className="px-2 py-2 text-left font-medium text-xs cursor-pointer whitespace-nowrap border-b" onClick={() => toggleSort('room')}>
                  <span className="flex items-center gap-1">Raum <SortIcon field="room" /></span>
                </th>
                <th className="px-2 py-2 text-left font-medium text-xs cursor-pointer whitespace-nowrap border-b" onClick={() => toggleSort('public')}>
                  <span className="flex items-center gap-1">Öff. <SortIcon field="public" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(({ event, exam }) => {
                if (!exam) return null;
                const isCancelled = event.status === 'cancelled';
                const examiner1 = getStaffById(exam.examiner1Id);
                const examiner2 = getStaffById(exam.examiner2Id);
                const protocolist = getStaffById(event.protocolistId);

                const isEditing = (field: string) =>
                  editingCell?.eventId === event.id && editingCell?.field === field;

                const cellClass = cn(
                  'px-2 py-1.5 border-b',
                  isCancelled && 'opacity-50'
                );

                const editableCellClass = cn(
                  cellClass,
                  'cursor-pointer hover:bg-accent/50 transition-colors'
                );

                return (
                  <tr key={event.id} className="group">
                    {/* Status */}
                    <td className={cellClass}>
                      <button
                        onClick={() => handleStatusToggle(event)}
                        title={isCancelled ? 'Reaktivieren' : 'Absagen'}
                      >
                        <Badge
                          variant={isCancelled ? 'destructive' : 'default'}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {isCancelled ? '✕' : '✓'}
                        </Badge>
                      </button>
                    </td>

                    {/* Degree */}
                    <td className={cellClass}>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{exam.degree}</Badge>
                    </td>

                    {/* Kompetenzfeld */}
                    <td className={cn(cellClass, 'max-w-[100px]')}>
                      <span className="truncate block text-xs" title={exam.kompetenzfeld || ''}>
                        {exam.degree === 'MA' ? 'Master' : exam.kompetenzfeld}
                      </span>
                    </td>

                    {/* Student */}
                    <td className={cn(cellClass, 'max-w-[130px]')}>
                      <span className="truncate block text-xs font-medium" title={exam.studentName}>
                        {exam.studentName}
                      </span>
                    </td>

                    {/* Topic - editable */}
                    <td
                      className={editableCellClass}
                      onClick={() => !isEditing('topic') && startEdit(event.id, 'topic', exam.topic)}
                    >
                      {isEditing('topic') ? (
                        <Input
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => commitEdit(event.id, 'topic')}
                          onKeyDown={e => handleKeyDown(e, event.id, 'topic')}
                          className="h-7 text-xs"
                          autoFocus
                        />
                      ) : (
                        <span className="text-xs line-clamp-2 block max-w-[200px]" title={exam.topic}>
                          {exam.topic}
                        </span>
                      )}
                    </td>

                    {/* Examiner 1 */}
                    <td className={cn(cellClass, 'min-w-[120px]')}>
                      <Select
                        value={exam.examiner1Id || 'none'}
                        onValueChange={v => handleExaminerChange(exam, 'examiner1Id', v === 'none' ? '' : v)}
                      >
                        <SelectTrigger className="h-7 text-xs border-none shadow-none px-1 hover:bg-accent/50">
                          <span className="truncate">{examiner1?.name || '—'}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* Examiner 2 */}
                    <td className={cn(cellClass, 'min-w-[120px]')}>
                      <Select
                        value={exam.examiner2Id || 'none'}
                        onValueChange={v => handleExaminerChange(exam, 'examiner2Id', v === 'none' ? '' : v)}
                      >
                        <SelectTrigger className="h-7 text-xs border-none shadow-none px-1 hover:bg-accent/50">
                          <span className="truncate">{examiner2?.name || '—'}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* Protocolist */}
                    <td className={cn(cellClass, 'min-w-[120px]')}>
                      <Select
                        value={event.protocolistId || 'none'}
                        onValueChange={v => handleProtocolistChange(event, v === 'none' ? '' : v)}
                      >
                        <SelectTrigger className="h-7 text-xs border-none shadow-none px-1 hover:bg-accent/50">
                          <span className="truncate">{protocolist?.name || '—'}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {protocolEligibleStaff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* Date */}
                    <td className={cellClass}>
                      <Select value={event.dayDate} onValueChange={v => handleDateChange(event, v)}>
                        <SelectTrigger className="h-7 text-xs border-none shadow-none px-1 hover:bg-accent/50 whitespace-nowrap">
                          <span>{formatDate(event.dayDate)}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {config.days.map(d => (
                            <SelectItem key={d} value={d}>{formatDate(d)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* Start time - editable */}
                    <td
                      className={editableCellClass}
                      onClick={() => !isEditing('startTime') && startEdit(event.id, 'startTime', event.startTime)}
                    >
                      {isEditing('startTime') ? (
                        <Input
                          type="time"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => commitEdit(event.id, 'startTime')}
                          onKeyDown={e => handleKeyDown(e, event.id, 'startTime')}
                          className="h-7 text-xs w-[90px]"
                          autoFocus
                        />
                      ) : (
                        <span className="text-xs font-mono">{event.startTime}</span>
                      )}
                    </td>

                    {/* End time - editable */}
                    <td
                      className={editableCellClass}
                      onClick={() => !isEditing('endTime') && startEdit(event.id, 'endTime', event.endTime)}
                    >
                      {isEditing('endTime') ? (
                        <Input
                          type="time"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => commitEdit(event.id, 'endTime')}
                          onKeyDown={e => handleKeyDown(e, event.id, 'endTime')}
                          className="h-7 text-xs w-[90px]"
                          autoFocus
                        />
                      ) : (
                        <span className="text-xs font-mono">{event.endTime}</span>
                      )}
                    </td>

                    {/* Room - editable */}
                    <td className={cellClass}>
                      <Select value={event.room} onValueChange={v => {
                        if (v !== event.room) {
                          pushEdit({ type: 'event', id: event.id, before: { ...event }, after: { ...event, room: v } });
                          updateScheduledEvent({ ...event, room: v });
                        }
                      }}>
                        <SelectTrigger className="h-7 text-xs border-none shadow-none px-1 hover:bg-accent/50">
                          <span>{event.room}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {uniqueRooms.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          {config.rooms.filter(r => !uniqueRooms.includes(r.name)).map(r => (
                            <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* Public */}
                    <td className={cellClass}>
                      <Switch
                        checked={exam.isPublic}
                        onCheckedChange={() => handlePublicToggle(exam)}
                        className="scale-75"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {sortedRows.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Keine Termine gefunden.
        </div>
      )}
    </div>
  );
}
