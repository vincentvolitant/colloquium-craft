import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Search, X } from 'lucide-react';
import type { Degree } from '@/types';
import { KOMPETENZFELD_MASTER_LABEL } from '@/types';

interface ScheduleFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  selectedDegree: Degree | 'all';
  onDegreeChange: (value: Degree | 'all') => void;
  selectedKompetenzfeld: string;
  onKompetenzfeldChange: (value: string) => void;
  selectedRoom: string;
  onRoomChange: (value: string) => void;
  selectedExaminer: string;
  onExaminerChange: (value: string) => void;
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
  selectedExaminer,
  onExaminerChange,
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
              <SelectItem value={KOMPETENZFELD_MASTER_LABEL}>{KOMPETENZFELD_MASTER_LABEL}</SelectItem>
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
          <Select value={selectedExaminer} onValueChange={onExaminerChange}>
            <SelectTrigger>
              <SelectValue placeholder="Alle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {examiners.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
