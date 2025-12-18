import { useState } from 'react';
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
import { CalendarIcon, Plus, Trash2, MapPin, ChevronDown, X } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Room, RoomMapping } from '@/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export function ScheduleConfigPanel() {
  const { config, setConfig, rooms, setRooms, roomMappings, updateRoomMapping, exams } = useScheduleStore();
  const { toast } = useToast();
  
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedDates, setSelectedDates] = useState<Date[]>(
    config.days.map(d => new Date(d))
  );
  
  // Get unique kompetenzfelder from exams
  const kompetenzfelder = [...new Set(
    exams
      .filter(e => e.degree === 'BA' && e.kompetenzfeld)
      .map(e => e.kompetenzfeld!)
  )].filter(kf => kf.toLowerCase() !== 'integratives design').sort();
  
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
      {rooms.length > 0 && kompetenzfelder.length > 0 && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle>Raum-Zuordnung nach Kompetenzfeld</CardTitle>
            <CardDescription>
              Ordnen Sie Räume den Kompetenzfeldern zu (Mehrfachauswahl möglich).
              "Integratives Design" und Master folgen automatisch dem Prüfer 1.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {kompetenzfelder.map((kf) => {
              const selectedRooms = getRoomsForKompetenzfeld(kf);
              
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
                <div key={kf} className="space-y-2">
                  <div className="flex items-center gap-4">
                    <Label className="w-48 font-medium shrink-0">{kf}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-between min-w-[200px]">
                          {selectedRooms.length === 0 
                            ? 'Räume auswählen...' 
                            : `${selectedRooms.length} Raum/Räume ausgewählt`}
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
                  </div>
                  
                  {selectedRooms.length > 0 && (
                    <div className="flex flex-wrap gap-1 ml-52">
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
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
