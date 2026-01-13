import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { Exam, StaffMember, ScheduledEvent } from '@/types';
import { KOMPETENZFELD_MASTER_LABEL } from '@/types';
import { cn } from '@/lib/utils';
import { Clock, MapPin, Users, Eye, EyeOff, X, BookOpen, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

interface ExamDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: Exam;
  event: ScheduledEvent;
  examiner1?: StaffMember;
  examiner2?: StaffMember;
  protocolist?: StaffMember;
  allExaminers?: (StaffMember | undefined)[];
}

export function ExamDetailDialog({ 
  open, 
  onOpenChange, 
  exam, 
  event, 
  examiner1, 
  examiner2, 
  protocolist,
  allExaminers 
}: ExamDetailDialogProps) {
  const isCancelled = event.status === 'cancelled';
  const kompetenzfeldDisplay = exam.degree === 'MA' ? KOMPETENZFELD_MASTER_LABEL : exam.kompetenzfeld;
  const isTeam = exam.isTeam;
  
  // Get display names - use the same helper as ExamCard
  const displayNames = exam.isTeam && exam.studentNames && exam.studentNames.length > 0
    ? exam.studentNames.join(' & ')
    : exam.studentName;
  
  const date = parseISO(event.dayDate);
  const dayName = format(date, 'EEEE', { locale: de });
  const dateStr = format(date, 'd. MMMM yyyy', { locale: de });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pr-8">
          <DialogTitle className={cn(
            "text-xl font-bold leading-tight",
            isCancelled && "line-through"
          )}>
            {displayNames}
          </DialogTitle>
          <div className="flex flex-wrap gap-2 items-center pt-3">
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
        </DialogHeader>
        
        <div className="space-y-6 mt-4">
          {/* Topic - Full display */}
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <BookOpen className="h-4 w-4" />
              <span className="font-medium">Thema der Arbeit</span>
            </div>
            <p className={cn(
              "text-base leading-relaxed pl-6",
              isCancelled && "line-through text-muted-foreground"
            )}>
              {exam.topic}
            </p>
          </div>
          
          {/* Date, Time & Room */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 flex-shrink-0" />
                <span>{dayName}, {dateStr}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 flex-shrink-0" />
                <span>{event.startTime} – {event.endTime} Uhr</span>
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
            </div>
            
            {/* Examiners */}
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-muted-foreground">
                <Users className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
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
          </div>
          
          {/* Cancellation reason */}
          {isCancelled && event.cancelledReason && (
            <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="text-sm text-destructive">
                <strong>Absagegrund:</strong> {event.cancelledReason}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
