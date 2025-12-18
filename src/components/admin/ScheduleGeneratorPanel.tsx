import { useState, useMemo } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Play, AlertTriangle, CheckCircle, XCircle, RefreshCw, Send, Users, UserCheck, UserX } from 'lucide-react';
import { generateSchedule } from '@/lib/scheduler';
import { useToast } from '@/hooks/use-toast';
import type { ConflictReport } from '@/types';
import { canBeProtocolist, SLOT_DURATIONS } from '@/types';

export function ScheduleGeneratorPanel() {
  const { 
    exams, 
    staff, 
    roomMappings, 
    config, 
    setScheduledEvents, 
    setConflicts,
    createScheduleVersion,
    publishVersion,
    scheduleVersions,
    scheduledEvents,
    currentVersionId,
  } = useScheduleStore();
  
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [localConflicts, setLocalConflicts] = useState<ConflictReport[]>([]);
  
  const currentVersion = scheduleVersions.find(v => v.id === currentVersionId);
  const currentEvents = currentVersionId 
    ? scheduledEvents.filter(e => e.scheduleVersionId === currentVersionId)
    : [];
  
  const canGenerate = exams.length > 0 && 
    staff.length > 0 && 
    config.days.length > 0 && 
    config.rooms.length > 0;

  // Capacity analysis
  const capacityAnalysis = useMemo(() => {
    const internalStaff = staff.filter(s => canBeProtocolist(s));
    const externalStaff = staff.filter(s => !canBeProtocolist(s));
    
    // Calculate slots per day (rough estimate using BA duration)
    const startMinutes = parseInt(config.startTime.split(':')[0]) * 60 + parseInt(config.startTime.split(':')[1] || '0');
    const endMinutes = parseInt(config.endTime.split(':')[0]) * 60 + parseInt(config.endTime.split(':')[1] || '0');
    const availableMinutes = endMinutes - startMinutes;
    const avgSlotDuration = (SLOT_DURATIONS.BA + SLOT_DURATIONS.MA) / 2;
    const slotsPerRoomPerDay = Math.floor(availableMinutes / avgSlotDuration);
    
    const totalSlots = slotsPerRoomPerDay * config.rooms.length * config.days.length;
    
    // Each exam needs 1 protocolist, but protocolists can do multiple exams (not at same time)
    // Maximum protocolist capacity = internal staff × slots per day × days
    const maxProtocolistCapacity = internalStaff.length * slotsPerRoomPerDay * config.days.length;
    
    // Detailed examiner workload analysis
    const examinerCounts = new Map<string, { total: number; perDay: Map<string, number> }>();
    for (const exam of exams) {
      // Examiner 1
      if (!examinerCounts.has(exam.examiner1Id)) {
        examinerCounts.set(exam.examiner1Id, { total: 0, perDay: new Map() });
      }
      examinerCounts.get(exam.examiner1Id)!.total++;
      
      // Examiner 2
      if (!examinerCounts.has(exam.examiner2Id)) {
        examinerCounts.set(exam.examiner2Id, { total: 0, perDay: new Map() });
      }
      examinerCounts.get(exam.examiner2Id)!.total++;
    }
    
    // Calculate max exams per day per room (theoretical)
    const maxExamsPerDayTotal = slotsPerRoomPerDay * config.rooms.length;
    
    // Find overloaded examiners (more exams than can fit in available days)
    const overloadedExaminers: { staff: typeof staff[0]; total: number; maxPossible: number }[] = [];
    for (const s of staff) {
      const count = examinerCounts.get(s.id);
      if (count) {
        // An examiner can only do 1 exam per slot, so max = slots per day * days
        const maxPossibleForExaminer = slotsPerRoomPerDay * config.days.length;
        if (count.total > maxPossibleForExaminer) {
          overloadedExaminers.push({ staff: s, total: count.total, maxPossible: maxPossibleForExaminer });
        }
      }
    }
    
    const heavyExaminers = internalStaff.filter(s => {
      const count = examinerCounts.get(s.id)?.total || 0;
      return count > slotsPerRoomPerDay; // More exams than slots per day
    });
    
    const warnings: string[] = [];
    
    if (exams.length > totalSlots) {
      warnings.push(`Mehr Prüfungen (${exams.length}) als verfügbare Slots (${totalSlots})`);
    }
    
    if (internalStaff.length === 0) {
      warnings.push('Keine internen Mitarbeiter - Protokollführung nicht möglich');
    } else if (exams.length > maxProtocolistCapacity) {
      warnings.push(`Protokollanten-Kapazität kritisch: ${exams.length} Prüfungen, max. ${maxProtocolistCapacity} Protokoll-Einsätze möglich`);
    }
    
    // Add overloaded examiner warnings
    for (const ol of overloadedExaminers) {
      warnings.push(`⚠️ ${ol.staff.name}: ${ol.total} Prüfungen, aber max. ${ol.maxPossible} möglich (${slotsPerRoomPerDay} Slots/Tag × ${config.days.length} Tage)`);
    }
    
    if (heavyExaminers.length > 0 && overloadedExaminers.length === 0) {
      const names = heavyExaminers.slice(0, 3).map(s => s.name).join(', ');
      const suffix = heavyExaminers.length > 3 ? ` (+${heavyExaminers.length - 3} weitere)` : '';
      warnings.push(`Hohe Prüfer-Auslastung: ${names}${suffix} - reduziert Protokollanten-Verfügbarkeit`);
    }
    
    return {
      internalCount: internalStaff.length,
      externalCount: externalStaff.length,
      totalSlots,
      maxProtocolistCapacity,
      maxExamsPerDayTotal,
      slotsPerRoomPerDay,
      heavyExaminers,
      overloadedExaminers,
      warnings,
      isCapacityCritical: warnings.length > 0,
    };
  }, [staff, exams, config]);
  
  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setLocalConflicts([]);
    
    try {
      // Simulate progress
      for (let i = 0; i <= 100; i += 10) {
        setGenerationProgress(i);
        await new Promise(r => setTimeout(r, 100));
      }
      
      const versionId = createScheduleVersion();
      const { events, conflicts } = generateSchedule(
        exams,
        staff,
        roomMappings,
        config,
        versionId
      );
      
      setScheduledEvents([...scheduledEvents, ...events]);
      setConflicts(conflicts);
      setLocalConflicts(conflicts);
      
      const errorCount = conflicts.filter(c => c.severity === 'error').length;
      const warningCount = conflicts.filter(c => c.severity === 'warning').length;
      
      if (errorCount === 0) {
        toast({
          title: 'Plan erfolgreich generiert',
          description: `${events.length} Prüfungen wurden eingeplant.${warningCount > 0 ? ` ${warningCount} Warnung(en).` : ''}`,
        });
      } else {
        toast({
          title: 'Plan mit Konflikten generiert',
          description: `${events.length} Prüfungen eingeplant, ${errorCount} Fehler, ${warningCount} Warnungen.`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Fehler bei der Generierung',
        description: 'Der Plan konnte nicht erstellt werden.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };
  
  const handlePublish = () => {
    if (!currentVersionId) return;
    
    publishVersion(currentVersionId);
    toast({
      title: 'Plan veröffentlicht',
      description: 'Der Kolloquiumsplan ist jetzt öffentlich einsehbar.',
    });
  };
  
  const scheduledCount = currentEvents.filter(e => e.status === 'scheduled').length;
  const unscheduledCount = exams.length - scheduledCount;
  
  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle>Planungsstatus</CardTitle>
          <CardDescription>
            Übersicht über die aktuellen Daten und Konfiguration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 border-2">
              <div className="text-3xl font-bold">{exams.length}</div>
              <div className="text-sm text-muted-foreground">Prüfungen</div>
            </div>
            <div className="text-center p-4 border-2">
              <div className="text-3xl font-bold">{staff.length}</div>
              <div className="text-sm text-muted-foreground">Mitarbeiter</div>
            </div>
            <div className="text-center p-4 border-2">
              <div className="text-3xl font-bold">{config.days.length}</div>
              <div className="text-sm text-muted-foreground">Tage</div>
            </div>
            <div className="text-center p-4 border-2">
              <div className="text-3xl font-bold">{config.rooms.length}</div>
              <div className="text-sm text-muted-foreground">Räume</div>
            </div>
          </div>
          
          {!canGenerate && (
            <Alert className="mt-4" variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Fehlende Daten</AlertTitle>
              <AlertDescription>
                Bitte laden Sie zunächst Prüfungen und Mitarbeiter hoch und konfigurieren Sie Tage und Räume.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Capacity Analysis */}
      {staff.length > 0 && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Kapazitätsanalyse
            </CardTitle>
            <CardDescription>
              Prüfung der Protokollanten-Verfügbarkeit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2 p-3 border-2 rounded">
                <UserCheck className="h-5 w-5 text-green-600" />
                <div>
                  <div className="text-2xl font-bold">{capacityAnalysis.internalCount}</div>
                  <div className="text-xs text-muted-foreground">Intern (Protokollanten)</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 border-2 rounded">
                <UserX className="h-5 w-5 text-orange-500" />
                <div>
                  <div className="text-2xl font-bold">{capacityAnalysis.externalCount}</div>
                  <div className="text-xs text-muted-foreground">Extern/Lehrbeauftragt</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 border-2 rounded">
                <div>
                  <div className="text-2xl font-bold">{capacityAnalysis.totalSlots}</div>
                  <div className="text-xs text-muted-foreground">Verfügbare Slots</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 border-2 rounded">
                <div>
                  <div className="text-2xl font-bold">{capacityAnalysis.slotsPerRoomPerDay}</div>
                  <div className="text-xs text-muted-foreground">Slots/Raum/Tag</div>
                </div>
              </div>
            </div>
            
            {capacityAnalysis.warnings.length > 0 && (
              <div className="space-y-2">
                {capacityAnalysis.warnings.map((warning, i) => (
                  <Alert key={i} variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{warning}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}
            
            {capacityAnalysis.warnings.length === 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Kapazität ausreichend: {capacityAnalysis.internalCount} Protokollanten für {exams.length} Prüfungen
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Generate Button */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Plan generieren
          </CardTitle>
          <CardDescription>
            Erstellen Sie automatisch einen optimierten Kolloquiumsplan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isGenerating ? (
            <div className="space-y-2">
              <Progress value={generationProgress} />
              <p className="text-sm text-center text-muted-foreground">
                Generiere Plan... {generationProgress}%
              </p>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button 
                onClick={handleGenerate} 
                disabled={!canGenerate}
                className="gap-2"
              >
                {currentEvents.length > 0 ? (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Neu generieren
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Plan erstellen
                  </>
                )}
              </Button>
              
              {currentEvents.length > 0 && currentVersion?.status !== 'published' && (
                <Button onClick={handlePublish} variant="default" className="gap-2">
                  <Send className="h-4 w-4" />
                  Veröffentlichen
                </Button>
              )}
              
              {currentVersion?.status === 'published' && (
                <Badge variant="default" className="self-center">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Veröffentlicht
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Results */}
      {currentEvents.length > 0 && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle>Ergebnis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 flex-wrap">
              <Badge variant="default" className="text-lg px-3 py-1">
                <CheckCircle className="h-4 w-4 mr-1" />
                {scheduledCount} eingeplant
              </Badge>
              {unscheduledCount > 0 && (
                <Badge variant="destructive" className="text-lg px-3 py-1">
                  <XCircle className="h-4 w-4 mr-1" />
                  {unscheduledCount} nicht eingeplant
                </Badge>
              )}
            </div>
            
            {localConflicts.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Konflikte & Warnungen</h4>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {localConflicts.map((conflict, i) => (
                    <Alert 
                      key={i} 
                      variant={conflict.severity === 'error' ? 'destructive' : 'default'}
                    >
                      {conflict.severity === 'error' ? (
                        <XCircle className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                      <AlertDescription>
                        {conflict.message}
                        {conflict.suggestion && (
                          <span className="block text-xs mt-1 opacity-70">
                            Vorschlag: {conflict.suggestion}
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
