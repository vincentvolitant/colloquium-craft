import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X, ChevronsUpDown } from 'lucide-react';
import type { Degree } from '@/types';

interface ScheduleFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  selectedDegree: Degree | 'all';
  onDegreeChange: (value: Degree | 'all') => void;
  selectedKompetenzfeld: string;
  onKompetenzfeldChange: (value: string) => void;
  selectedRoom: string;
  onRoomChange: (value: string) => void;
  selectedExaminers: string[];
  onExaminersChange: (value: string[]) => void;
  selectedPublic: 'all' | 'public' | 'private';
  onPublicChange: (value: 'all' | 'public' | 'private') => void;
  selectedStatus: 'all' | 'scheduled' | 'cancelled';
  onStatusChange: (value: 'all' | 'scheduled' | 'cancelled') => void;
  kompetenzfelder: string[];
  rooms: string[];
  examiners: { id: string; name: string }[];
  onClearFilters: () => void;
  activeFilterCount: number;
}

export function ScheduleFilters({
  search,
  onSearchChange,
  selectedDegree,
  onDegreeChange,
  selectedKompetenzfeld,
  onKompetenzfeldChange,
  selectedRoom,
  onRoomChange,
  selectedExaminers,
  onExaminersChange,
  selectedPublic,
  onPublicChange,
  selectedStatus,
  onStatusChange,
  kompetenzfelder,
  rooms,
  examiners,
  onClearFilters,
  activeFilterCount,
}: ScheduleFiltersProps) {
  const [examinerSearch, setExaminerSearch] = useState('');
  const [examinerPopoverOpen, setExaminerPopoverOpen] = useState(false);

  const filteredExaminers = examiners.filter(e =>
    e.name.toLowerCase().includes(examinerSearch.toLowerCase())
  );

  const toggleExaminer = (id: string) => {
    if (selectedExaminers.includes(id)) {
      onExaminersChange(selectedExaminers.filter(eid => eid !== id));
    } else {
      onExaminersChange([...selectedExaminers, id]);
    }
  };

  const examinerLabel = selectedExaminers.length === 0
    ? 'Alle'
    : selectedExaminers.length === 1
      ? examiners.find(e => e.id === selectedExaminers[0])?.name || '1 ausgewählt'
      : `${selectedExaminers.length} ausgewählt`;

  return (
    <div className="space-y-4 p-4 border-2 bg-card">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Filter & Suche</h3>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="gap-1">
            <X className="h-4 w-4" />
            Filter zurücksetzen
            <Badge variant="secondary" className="ml-1">{activeFilterCount}</Badge>
          </Button>
        )}
      </div>
      
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Suche nach Name oder Thema..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Abschluss</Label>
          <Select value={selectedDegree} onValueChange={(v) => onDegreeChange(v as Degree | 'all')}>
            <SelectTrigger>
              <SelectValue placeholder="Alle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="BA">Bachelor</SelectItem>
              <SelectItem value="MA">Master</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Kompetenzfeld</Label>
          <Select value={selectedKompetenzfeld} onValueChange={onKompetenzfeldChange}>
            <SelectTrigger>
              <SelectValue placeholder="Alle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {kompetenzfelder.map((kf) => (
                <SelectItem key={kf} value={kf}>{kf}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Raum</Label>
          <Select value={selectedRoom} onValueChange={onRoomChange}>
            <SelectTrigger>
              <SelectValue placeholder="Alle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {rooms.map((room) => (
                <SelectItem key={room} value={room}>{room}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Prüfer/Protokoll</Label>
          <Popover open={examinerPopoverOpen} onOpenChange={setExaminerPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal h-10 px-3"
              >
                <span className="truncate text-sm">{examinerLabel}</span>
                <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <div className="p-2 border-b">
                <Input
                  placeholder="Suche..."
                  value={examinerSearch}
                  onChange={(e) => setExaminerSearch(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <ScrollArea className="max-h-52">
                <div className="p-1">
                  {selectedExaminers.length > 0 && (
                    <button
                      className="w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 mb-1"
                      onClick={() => onExaminersChange([])}
                    >
                      Alle abwählen
                    </button>
                  )}
                  {filteredExaminers.map((e) => (
                    <label
                      key={e.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={selectedExaminers.includes(e.id)}
                        onCheckedChange={() => toggleExaminer(e.id)}
                      />
                      {e.name}
                    </label>
                  ))}
                  {filteredExaminers.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Keine Ergebnisse</p>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Öffentlichkeit</Label>
          <Select value={selectedPublic} onValueChange={(v) => onPublicChange(v as 'all' | 'public' | 'private')}>
            <SelectTrigger>
              <SelectValue placeholder="Alle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="public">Öffentlich</SelectItem>
              <SelectItem value="private">Ohne Öffentlichkeit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={selectedStatus} onValueChange={(v) => onStatusChange(v as 'all' | 'scheduled' | 'cancelled')}>
            <SelectTrigger>
              <SelectValue placeholder="Alle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="scheduled">Geplant</SelectItem>
              <SelectItem value="cancelled">Abgesagt</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
