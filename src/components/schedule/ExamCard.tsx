import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { Exam, StaffMember, ScheduledEvent } from '@/types';
import { KOMPETENZFELD_MASTER_LABEL, getAllExaminerIds, getExamDisplayNames } from '@/types';
import { cn } from '@/lib/utils';
import { Clock, MapPin, Users, Eye, EyeOff, X, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ExamCardProps {
  exam: Exam;
  event: ScheduledEvent;
  examiner1?: StaffMember;
  examiner2?: StaffMember;
  protocolist?: StaffMember;
  allExaminers?: (StaffMember | undefined)[];
  onClick?: () => void;
}

function generateICS(exam: Exam, event: ScheduledEvent, examiner1?: StaffMember, examiner2?: StaffMember, protocolist?: StaffMember, allExaminers?: (StaffMember | undefined)[]): string {
  const displayNames = getExamDisplayNames(exam);
  const title = `Kolloquium: ${displayNames.join(' & ')} – ${exam.topic}`;
  
  // Build date strings: event.dayDate is YYYY-MM-DD, times are HH:mm
  const dateClean = event.dayDate.replace(/-/g, '');
  const startClean = event.startTime.replace(':', '') + '00';
  const endClean = event.endTime.replace(':', '') + '00';
  
  // Build description with details
  const descParts: string[] = [];
  descParts.push(`Studierend: ${displayNames.join(' & ')}`);
  descParts.push(`Thema: ${exam.topic}`);
  descParts.push(`Studiengang: ${exam.degree}`);
  if (exam.isTeam && allExaminers && allExaminers.length > 0) {
    allExaminers.forEach((e, i) => {
      if (e) descParts.push(`Prüfer ${i + 1}: ${e.name}`);
    });
  } else {
    if (examiner1) descParts.push(`Prüfer 1: ${examiner1.name}`);
    if (examiner2) descParts.push(`Prüfer 2: ${examiner2.name}`);
  }
  if (protocolist) descParts.push(`Protokoll: ${protocolist.name}`);
  
  const description = descParts.join('\\n');
  const location = `Raum ${event.room}`;
  
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kolloquiumsplaner//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTART;TZID=Europe/Berlin:${dateClean}T${startClean}`,
    `DTEND;TZID=Europe/Berlin:${dateClean}T${endClean}`,
    `DTSTAMP:${stamp}`,
    `UID:${event.id}@kolloquiumsplaner`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadICS(exam: Exam, event: ScheduledEvent, examiner1?: StaffMember, examiner2?: StaffMember, protocolist?: StaffMember, allExaminers?: (StaffMember | undefined)[]) {
  const ics = generateICS(exam, event, examiner1, examiner2, protocolist, allExaminers);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const names = getExamDisplayNames(exam).join('_').replace(/\s+/g, '-');
  a.download = `Kolloquium_${names}_${event.dayDate}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExamCard({ exam, event, examiner1, examiner2, protocolist, allExaminers, onClick }: ExamCardProps) {
  const isCancelled = event.status === 'cancelled';
  const kompetenzfeldDisplay = exam.degree === 'MA' ? KOMPETENZFELD_MASTER_LABEL : exam.kompetenzfeld;
  const isTeam = exam.isTeam;
  
  const displayNames = getExamDisplayNames(exam);
  const examinerIds = getAllExaminerIds(exam);
  
  const examinersToShow = isTeam && allExaminers 
    ? allExaminers 
    : isTeam && exam.examinerIds 
      ? examinerIds.map(() => undefined)
      : [examiner1, examiner2];
  
  const handleCalendarDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadICS(exam, event, examiner1, examiner2, protocolist, allExaminers);
  };
  
  return (
    <Card 
      className={cn(
        "border-2 transition-all hover:shadow-md",
        isCancelled && "opacity-60 bg-muted",
        isTeam && "border-primary/50",
        onClick && "cursor-pointer hover:border-primary/70"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <Badge variant={exam.degree === 'BA' ? 'default' : 'secondary'}>
            {exam.degree}
          </Badge>
          {isTeam && (
            <Badge variant="outline" className="gap-1 bg-primary/10 font-normal">
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
          <div className="ml-auto flex items-center gap-1">
            {!isCancelled && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleCalendarDownload}
                    >
                      <CalendarPlus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Termin herunterladen (.ics)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Badge 
              variant={exam.isPublic ? 'outline' : 'secondary'}
              className={cn(
                "gap-1",
                !exam.isPublic && "bg-accent"
              )}
            >
              {exam.isPublic ? (
                <>
                  <Eye className="h-3 w-3" />
                  Öffentlich
                </>
              ) : (
                <>
                  <EyeOff className="h-3 w-3" />
                  Ohne Öffentlichkeit
                </>
              )}
            </Badge>
          </div>
        </div>
        <h3 className={cn(
          "font-semibold text-lg leading-tight",
          isCancelled && "line-through"
        )}>
          {displayNames.join(' & ')}
        </h3>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-4">
        <p className={cn(
          "text-sm text-muted-foreground mb-4 line-clamp-2",
          isCancelled && "line-through"
        )}>
          {exam.topic}
        </p>
        
        <div className="grid gap-2 text-sm">
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
          <div className="flex items-start gap-2 text-muted-foreground">
            <Users className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="flex flex-col">
              {isTeam && allExaminers && allExaminers.length > 0 ? (
                <>
                  {allExaminers.map((examiner, idx) => (
                    <span key={idx}>
                      <strong>Prüfer {idx + 1}:</strong> {examiner?.name || '—'}
                    </span>
                  ))}
                  <span>
                    <strong>Protokoll:</strong> {protocolist?.name || '—'}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <strong>Prüfer 1:</strong> {examiner1?.name || '—'}
                  </span>
                  <span>
                    <strong>Prüfer 2:</strong> {examiner2?.name || '—'}
                  </span>
                  <span>
                    <strong>Protokoll:</strong> {protocolist?.name || '—'}
                  </span>
                </>
              )}
            </div>
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
}
export function ExamCard({ exam, event, examiner1, examiner2, protocolist, allExaminers, onClick }: ExamCardProps) {
  const isCancelled = event.status === 'cancelled';
  const kompetenzfeldDisplay = exam.degree === 'MA' ? KOMPETENZFELD_MASTER_LABEL : exam.kompetenzfeld;
  const isTeam = exam.isTeam;
  
  // Get display names for students
  const displayNames = getExamDisplayNames(exam);
  
  // Get all examiner IDs for team exams
  const examinerIds = getAllExaminerIds(exam);
  
  // Use provided allExaminers or fall back to examiner1/examiner2
  const examinersToShow = isTeam && allExaminers 
    ? allExaminers 
    : isTeam && exam.examinerIds 
      ? examinerIds.map(() => undefined) // Placeholder - will need to be resolved
      : [examiner1, examiner2];
  
  return (
    <Card 
      className={cn(
        "border-2 transition-all hover:shadow-md",
        isCancelled && "opacity-60 bg-muted",
        isTeam && "border-primary/50",
        onClick && "cursor-pointer hover:border-primary/70"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <Badge variant={exam.degree === 'BA' ? 'default' : 'secondary'}>
            {exam.degree}
          </Badge>
          {isTeam && (
            <Badge variant="outline" className="gap-1 bg-primary/10 font-normal">
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
          <Badge 
            variant={exam.isPublic ? 'outline' : 'secondary'}
            className={cn(
              "ml-auto gap-1",
              !exam.isPublic && "bg-accent"
            )}
          >
            {exam.isPublic ? (
              <>
                <Eye className="h-3 w-3" />
                Öffentlich
              </>
            ) : (
              <>
                <EyeOff className="h-3 w-3" />
                Ohne Öffentlichkeit
              </>
            )}
          </Badge>
        </div>
        <h3 className={cn(
          "font-semibold text-lg leading-tight",
          isCancelled && "line-through"
        )}>
          {displayNames.join(' & ')}
        </h3>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-4">
        <p className={cn(
          "text-sm text-muted-foreground mb-4 line-clamp-2",
          isCancelled && "line-through"
        )}>
          {exam.topic}
        </p>
        
        <div className="grid gap-2 text-sm">
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
          <div className="flex items-start gap-2 text-muted-foreground">
            <Users className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="flex flex-col">
              {isTeam && allExaminers && allExaminers.length > 0 ? (
                // Team exam: show all examiners (up to 4)
                <>
                  {allExaminers.map((examiner, idx) => (
                    <span key={idx}>
                      <strong>Prüfer {idx + 1}:</strong> {examiner?.name || '—'}
                    </span>
                  ))}
                  <span>
                    <strong>Protokoll:</strong> {protocolist?.name || '—'}
                  </span>
                </>
              ) : (
                // Regular exam: show 2 examiners
                <>
                  <span>
                    <strong>Prüfer 1:</strong> {examiner1?.name || '—'}
                  </span>
                  <span>
                    <strong>Prüfer 2:</strong> {examiner2?.name || '—'}
                  </span>
                  <span>
                    <strong>Protokoll:</strong> {protocolist?.name || '—'}
                  </span>
                </>
              )}
            </div>
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
}