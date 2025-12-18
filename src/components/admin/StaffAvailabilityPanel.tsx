import { useState } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Clock, User, AlertTriangle, Check, Edit2, X } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import type { StaffMember, AvailabilityOverride, TimeWindow } from '@/types';
import { EMPLOYMENT_TYPE_LABELS, canBeProtocolist } from '@/types';

function getAvailabilityBadges(staff: StaffMember, configDays: string[]): React.ReactNode[] {
  const badges: React.ReactNode[] = [];
  const override = staff.availabilityOverride;
  
  if (!override) {
    badges.push(<Badge key="full" variant="outline" className="bg-green-50 text-green-700 border-green-200">voll verfügbar</Badge>);
    return badges;
  }
  
  if (override.availableDays && override.availableDays.length > 0 && override.availableDays.length < configDays.length) {
    const dayLabels = override.availableDays.map(d => {
      const idx = parseInt(d);
      if (!isNaN(idx) && configDays[idx - 1]) {
        return `Tag ${idx}`;
      }
      try {
        return format(new Date(d), 'EEE', { locale: de });
      } catch {
        return d;
      }
    });
    badges.push(<Badge key="days" variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">nur {dayLabels.join(', ')}</Badge>);
  }
  
  if (override.timeWindows) {
    const windows = Object.values(override.timeWindows).flat();
    if (windows.length > 0) {
      const timeStr = windows.map(w => `${w.startTime}-${w.endTime}`).join(', ');
      badges.push(<Badge key="time" variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{timeStr}</Badge>);
    }
  }
  
  if (override.unavailableBlocks && override.unavailableBlocks.length > 0) {
    badges.push(<Badge key="blocks" variant="outline" className="bg-red-50 text-red-700 border-red-200">{override.unavailableBlocks.length} Sperrzeit(en)</Badge>);
  }
  
  if (badges.length === 0) {
    badges.push(<Badge key="full" variant="outline" className="bg-green-50 text-green-700 border-green-200">voll verfügbar</Badge>);
  }
  
  return badges;
}

interface EditDialogProps {
  staff: StaffMember;
  configDays: string[];
  onSave: (override: AvailabilityOverride | undefined) => void;
}

function EditAvailabilityDialog({ staff, configDays, onSave }: EditDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>(staff.availabilityOverride?.availableDays || []);
  const [timeWindows, setTimeWindows] = useState<Record<string, TimeWindow[]>>(staff.availabilityOverride?.timeWindows || {});
  const [notes, setNotes] = useState(staff.availabilityOverride?.notes || '');
  
  const handleDayToggle = (day: string) => {
    setSelectedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };
  
  const handleSave = () => {
    const hasRestrictions = selectedDays.length > 0 || Object.keys(timeWindows).length > 0 || notes;
    
    if (!hasRestrictions) {
      onSave(undefined);
    } else {
      onSave({
        id: staff.availabilityOverride?.id || crypto.randomUUID(),
        availableDays: selectedDays.length > 0 ? selectedDays : undefined,
        timeWindows: Object.keys(timeWindows).length > 0 ? timeWindows : undefined,
        notes: notes || undefined,
      });
    }
    setOpen(false);
  };
  
  const handleReset = () => {
    setSelectedDays([]);
    setTimeWindows({});
    setNotes('');
  };
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Edit2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Verfügbarkeit: {staff.name}</DialogTitle>
          <DialogDescription>
            Standardmäßig sind alle Mitarbeitenden an allen Tagen von 09:00-18:00 verfügbar.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Nur anwesend an Tagen
            </Label>
            <div className="flex flex-wrap gap-2">
              {configDays.map((day, idx) => {
                const dayLabel = `Tag ${idx + 1}`;
                const dateLabel = format(new Date(day), 'EEE dd.MM', { locale: de });
                const isSelected = selectedDays.includes(String(idx + 1)) || selectedDays.includes(day);
                
                return (
                  <Button
                    key={day}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDayToggle(String(idx + 1))}
                  >
                    {dayLabel} ({dateLabel})
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Keine Auswahl = an allen Tagen verfügbar
            </p>
          </div>
          
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Zeitfenster pro Tag
            </Label>
            {configDays.map((day, idx) => {
              const dayWindows = timeWindows[day] || [];
              const dateLabel = format(new Date(day), 'EEE dd.MM', { locale: de });
              
              return (
                <div key={day} className="flex items-center gap-2">
                  <span className="text-sm w-24">{dateLabel}:</span>
                  <Input
                    placeholder="z.B. 09:00-12:00"
                    className="w-32"
                    value={dayWindows[0]?.startTime ? `${dayWindows[0].startTime}-${dayWindows[0].endTime}` : ''}
                    onChange={(e) => {
                      const match = e.target.value.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
                      if (match) {
                        setTimeWindows(prev => ({
                          ...prev,
                          [day]: [{ startTime: match[1], endTime: match[2] }]
                        }));
                      } else if (!e.target.value) {
                        setTimeWindows(prev => {
                          const next = { ...prev };
                          delete next[day];
                          return next;
                        });
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
          
          <div className="space-y-2">
            <Label>Hinweise</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="z.B. Nur vormittags, nach Absprache"
            />
          </div>
        </div>
        
        <div className="flex justify-between">
          <Button variant="outline" onClick={handleReset}>
            Zurücksetzen
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave}>
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StaffAvailabilityPanel() {
  const { staff, config, updateStaffAvailability } = useScheduleStore();
  
  if (staff.length === 0) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Verfügbarkeiten pflegen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Bitte importieren Sie zuerst die Mitarbeiterliste.</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (config.days.length === 0) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Verfügbarkeiten pflegen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Bitte konfigurieren Sie zuerst die Prüfungstage unter "Konfiguration".</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const internalStaff = staff.filter(s => s.employmentType === 'internal');
  const externalStaff = staff.filter(s => s.employmentType !== 'internal');
  
  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Verfügbarkeiten pflegen
        </CardTitle>
        <CardDescription>
          Standardregel: Alle Mitarbeitenden sind an allen Prüfungstagen von {config.startTime} bis {config.endTime} verfügbar.
          Hier können Sie Einschränkungen pro Person definieren.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Internal staff */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <User className="h-4 w-4" />
            Interne Mitarbeitende ({internalStaff.length})
            <Badge variant="outline" className="ml-2">können protokollieren</Badge>
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kompetenzfeld</TableHead>
                <TableHead>Verfügbarkeit</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {internalStaff.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.primaryCompetenceField || '-'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {getAvailabilityBadges(s, config.days)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <EditAvailabilityDialog
                      staff={s}
                      configDays={config.days}
                      onSave={(override) => updateStaffAvailability(s.id, override)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        {/* External staff */}
        {externalStaff.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Externe / Lehrbeauftragte ({externalStaff.length})
              <Badge variant="outline" className="ml-2 bg-orange-50 text-orange-700 border-orange-200">
                <X className="h-3 w-3 mr-1" />
                können nicht protokollieren
              </Badge>
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Kompetenzfeld</TableHead>
                  <TableHead>Verfügbarkeit</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {externalStaff.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{EMPLOYMENT_TYPE_LABELS[s.employmentType]}</Badge>
                    </TableCell>
                    <TableCell>{s.primaryCompetenceField || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {getAvailabilityBadges(s, config.days)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <EditAvailabilityDialog
                        staff={s}
                        configDays={config.days}
                        onSave={(override) => updateStaffAvailability(s.id, override)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
