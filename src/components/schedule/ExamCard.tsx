import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { Exam, StaffMember, ScheduledEvent } from '@/types';
import { KOMPETENZFELD_MASTER_LABEL, getAllExaminerIds, getExamDisplayNames } from '@/types';
import { cn } from '@/lib/utils';
import { Clock, MapPin, Users, Eye, EyeOff, X } from 'lucide-react';

interface ExamCardProps {
  exam: Exam;
  event: ScheduledEvent;
  examiner1?: StaffMember;
  examiner2?: StaffMember;
  protocolist?: StaffMember;
  // For team exams, pass all examiners
  allExaminers?: (StaffMember | undefined)[];
  onClick?: () => void;
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