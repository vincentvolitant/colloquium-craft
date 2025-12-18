import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useScheduleStore } from '@/store/scheduleStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, Trash2, MapPin, ChevronDown, X, GraduationCap, Info, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Room, RoomMapping } from '@/types';
import { SLOT_DURATIONS } from '@/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export function ScheduleConfigPanel() {
  const { config, setConfig, rooms, setRooms, roomMappings, updateRoomMapping, exams } = useScheduleStore();
  const { toast } = useToast();
  
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedDates, setSelectedDates] = useState<Date[]>(
    config.days.map(d => new Date(d))
  );
  
  // Helper to check for "Integratives/Integriertes Design"
  const isIntegrativesDesign = (kf: string | null | undefined): boolean => {
    if (!kf) return false;
    const lower = kf.toLowerCase();
    return lower.includes('integrativ') || lower.includes('integriert');
  };
  
  // Get unique kompetenzfelder from exams (BA only, excluding Integratives/Integriertes Design)
  const regularKompetenzfelder = [...new Set(
    exams
      .filter(e => e.degree === 'BA' && e.kompetenzfeld && !isIntegrativesDesign(e.kompetenzfeld))
      .map(e => e.kompetenzfeld!)
  )].sort();
  
  // Check if there are Integratives/Integriertes Design exams
  const integrativesDesignExams = exams.filter(
    e => e.degree === 'BA' && isIntegrativesDesign(e.kompetenzfeld)
  );
  
  // Master exams
  const masterExams = exams.filter(e => e.degree === 'MA');
  
  // Count exams per kompetenzfeld
  const getExamCount = (kf: string): number => {
    if (kf === '__MASTER__') return masterExams.length;
    if (kf === '__INTEGRATIVES__') return integrativesDesignExams.length;
    return exams.filter(e => e.kompetenzfeld === kf).length;
  };
  
  // Calculate estimated time needed (in minutes)
  const getEstimatedTime = (kf: string): number => {
    if (kf === '__MASTER__') return masterExams.length * SLOT_DURATIONS.MA;
    if (kf === '__INTEGRATIVES__') return integrativesDesignExams.length * SLOT_DURATIONS.BA;
    const count = exams.filter(e => e.kompetenzfeld === kf).length;
    return count * SLOT_DURATIONS.BA;
  };
  
  // Format time as hours and minutes
  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} Min.`;
    if (mins === 0) return `${hours} Std.`;
    return `${hours} Std. ${mins} Min.`;
  };
  
  const handleAddRoom = () => {
    if (!newRoomName.trim()) return;
    
    const newRoom: Room = {
      id: crypto.randomUUID(),
      name: newRoomName.trim(),
    };
    
    setRooms([...rooms, newRoom]);
    setConfig({ rooms: [...config.rooms, newRoom] });
    setNewRoomName('');
    
    toast({
      title: 'Raum hinzugefügt',
      description: `Raum "${newRoom.name}" wurde hinzugefügt.`,
    });
  };
  
  const handleRemoveRoom = (roomId: string) => {
    const updatedRooms = rooms.filter(r => r.id !== roomId);
    setRooms(updatedRooms);
    setConfig({ rooms: updatedRooms });
  };
  
  const handleDateSelect = (dates: Date[] | undefined) => {
    if (!dates) return;
    
    const sortedDates = dates.sort((a, b) => a.getTime() - b.getTime());
    setSelectedDates(sortedDates);
    setConfig({ days: sortedDates.map(d => format(d, 'yyyy-MM-dd')) });
  };
  
  const handleRoomMappingChange = (kompetenzfeld: string, selectedRooms: string[]) => {
    const existingMapping = roomMappings.find(m => m.kompetenzfeld === kompetenzfeld);
    
    const mapping: RoomMapping = {
      id: existingMapping?.id || crypto.randomUUID(),
      degreeScope: 'BA',
      kompetenzfeld,
      rooms: selectedRooms,
    };
    
    updateRoomMapping(mapping);
  };
  
  const getRoomsForKompetenzfeld = (kompetenzfeld: string): string[] => {
    const mapping = roomMappings.find(m => m.kompetenzfeld === kompetenzfeld);
    return mapping?.rooms || [];
  };
  
  return (
    <div className="space-y-6">
      {/* Date Selection */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Kolloquiumstage
          </CardTitle>
          <CardDescription>
            Wählen Sie 2-3 Tage für das Kolloquium aus
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Tage auswählen
                  {selectedDates.length > 0 && (
                    <Badge variant="secondary">{selectedDates.length}</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="multiple"
                  selected={selectedDates}
                  onSelect={handleDateSelect}
                  locale={de}
                  className="border-2"
                />
              </PopoverContent>
            </Popover>
            
            <div className="flex flex-wrap gap-2">
              {selectedDates.map((date) => (
                <Badge key={date.toISOString()} variant="outline" className="text-sm">
                  {format(date, 'EEEE, d. MMMM yyyy', { locale: de })}
                </Badge>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <Label>Startzeit</Label>
              <Input
                type="time"
                value={config.startTime}
                onChange={(e) => setConfig({ startTime: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Endzeit</Label>
              <Input
                type="time"
                value={config.endTime}
                onChange={(e) => setConfig({ endTime: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Room Management */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Räume
          </CardTitle>
          <CardDescription>
            Verwalten Sie die verfügbaren Räume für das Kolloquium
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Neuer Raum (z.B. 'Raum A')"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddRoom()}
            />
            <Button onClick={handleAddRoom} className="gap-1">
              <Plus className="h-4 w-4" />
              Hinzufügen
            </Button>
          </div>
          
          {rooms.length > 0 && (
            <div className="border-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Raum</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.map((room) => (
                    <TableRow key={room.id}>
                      <TableCell className="font-medium">{room.name}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveRoom(room.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Room Mapping */}
      {rooms.length > 0 && (exams.length > 0) && (
        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Prüfungen & Raum-Zuordnung
                </CardTitle>
                <CardDescription className="mt-1">
                  Übersicht aller Prüfungen nach Kompetenzfeld. Ordnen Sie Räume zu (Mehrfachauswahl möglich).
                </CardDescription>
              </div>
              <Link to="/" target="_blank">
                <Button variant="outline" className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Öffentliche Ansicht
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Regular BA Kompetenzfelder */}
            {regularKompetenzfelder.map((kf) => {
              const selectedRooms = getRoomsForKompetenzfeld(kf);
              const examCount = getExamCount(kf);
              const estimatedTime = getEstimatedTime(kf);
              
              const toggleRoom = (roomName: string) => {
                const newSelection = selectedRooms.includes(roomName)
                  ? selectedRooms.filter(r => r !== roomName)
                  : [...selectedRooms, roomName];
                handleRoomMappingChange(kf, newSelection);
              };
              
              const removeRoom = (roomName: string) => {
                handleRoomMappingChange(kf, selectedRooms.filter(r => r !== roomName));
              };
              
              return (
                <div key={kf} className="border-2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="default">BA</Badge>
                      <span className="font-semibold">{kf}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{examCount} Prüfungen</span>
                      <span>≈ {formatTime(estimatedTime)}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-between min-w-[200px]">
                          {selectedRooms.length === 0 
                            ? 'Räume auswählen...' 
                            : `${selectedRooms.length} Raum/Räume`}
                          <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-2" align="start">
                        <div className="space-y-2">
                          {rooms.map((room) => (
                            <label
                              key={room.id}
                              className="flex items-center gap-2 cursor-pointer hover:bg-accent p-2 -mx-2"
                            >
                              <Checkbox
                                checked={selectedRooms.includes(room.name)}
                                onCheckedChange={() => toggleRoom(room.name)}
                              />
                              <span className="text-sm">{room.name}</span>
                            </label>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    
                    {selectedRooms.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedRooms.map((roomName) => (
                          <Badge 
                            key={roomName} 
                            variant="secondary"
                            className="gap-1 pr-1"
                          >
                            {roomName}
                            <button
                              onClick={() => removeRoom(roomName)}
                              className="ml-1 hover:bg-accent rounded-sm p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    
                    {selectedRooms.length === 0 && (
                      <span className="text-sm text-destructive">Bitte Räume zuordnen</span>
                    )}
                  </div>
                </div>
              );
            })}
            
            {/* Integratives Design */}
            {integrativesDesignExams.length > 0 && (
              <div className="border-2 border-dashed p-4 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="default">BA</Badge>
                    <span className="font-semibold">Integriertes Design</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{integrativesDesignExams.length} Prüfungen</span>
                    <span>≈ {formatTime(getEstimatedTime('__INTEGRATIVES__'))}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Info className="h-4 w-4" />
                  <span>Raum folgt automatisch dem Kompetenzfeld von Prüfer 1</span>
                </div>
              </div>
            )}
            
            {/* Master */}
            {masterExams.length > 0 && (
              <div className="border-2 border-dashed p-4 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">MA</Badge>
                    <span className="font-semibold">Master</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{masterExams.length} Prüfungen</span>
                    <span>≈ {formatTime(getEstimatedTime('__MASTER__'))}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Info className="h-4 w-4" />
                  <span>Raum folgt automatisch dem Kompetenzfeld von Prüfer 1</span>
                </div>
              </div>
            )}
            
            {regularKompetenzfelder.length === 0 && integrativesDesignExams.length === 0 && masterExams.length === 0 && (
              <p className="text-muted-foreground text-center py-4">
                Noch keine Prüfungen importiert.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
