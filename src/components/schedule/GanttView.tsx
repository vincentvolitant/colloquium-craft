import { useMemo } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ScheduledEvent, Exam } from '@/types';

interface GanttViewProps {
  events: Array<{ event: ScheduledEvent; exam: Exam }>;
  rooms: string[];
}

// Convert time string (HH:MM) to minutes from start of day
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function GanttView({ events, rooms }: GanttViewProps) {
  const { getStaffById } = useScheduleStore();
  
  // Calculate time range
  const timeRange = useMemo(() => {
    if (events.length === 0) return { start: 8 * 60, end: 18 * 60 };
    
    let minTime = Infinity;
    let maxTime = -Infinity;
    
    events.forEach(({ event }) => {
      const start = timeToMinutes(event.startTime);
      const end = timeToMinutes(event.endTime);
      minTime = Math.min(minTime, start);
      maxTime = Math.max(maxTime, end);
    });
    
    // Round to full hours with padding
    const startHour = Math.floor(minTime / 60);
    const endHour = Math.ceil(maxTime / 60);
    
    return { 
      start: startHour * 60, 
      end: endHour * 60 
    };
  }, [events]);
  
  // Generate hour markers
  const hours = useMemo(() => {
    const result: number[] = [];
    for (let h = timeRange.start / 60; h <= timeRange.end / 60; h++) {
      result.push(h);
    }
    return result;
  }, [timeRange]);
  
  // Group events by room
  const eventsByRoom = useMemo(() => {
    const grouped = new Map<string, Array<{ event: ScheduledEvent; exam: Exam }>>();
    
    rooms.forEach(room => {
      grouped.set(room, []);
    });
    
    events.forEach(item => {
      const roomEvents = grouped.get(item.event.room);
      if (roomEvents) {
        roomEvents.push(item);
      }
    });
    
    return grouped;
  }, [events, rooms]);
  
  const totalMinutes = timeRange.end - timeRange.start;
  
  const getEventPosition = (event: ScheduledEvent) => {
    const start = timeToMinutes(event.startTime) - timeRange.start;
    const duration = timeToMinutes(event.endTime) - timeToMinutes(event.startTime);
    
    return {
      left: `${(start / totalMinutes) * 100}%`,
      width: `${(duration / totalMinutes) * 100}%`,
    };
  };
  
  const getDegreeColor = (degree: string) => {
    return degree === 'MA' 
      ? 'bg-primary/80 hover:bg-primary text-primary-foreground' 
      : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground';
  };
  
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Keine Prüfungen für die Gantt-Ansicht verfügbar.</p>
      </div>
    );
  }
  
  return (
    <TooltipProvider>
      <div className="border rounded-lg bg-card overflow-hidden">
        {/* Time header */}
        <div className="flex border-b bg-muted/30">
          <div className="w-32 shrink-0 p-2 font-medium text-sm border-r">
            Raum
          </div>
          <div className="flex-1 relative">
            <div className="flex">
              {hours.map((hour, idx) => (
                <div 
                  key={hour} 
                  className="flex-1 text-center text-xs text-muted-foreground py-2 border-r last:border-r-0"
                  style={{ minWidth: '60px' }}
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Room rows */}
        {[...eventsByRoom.entries()].map(([room, roomEvents]) => (
          <div key={room} className="flex border-b last:border-b-0 min-h-[56px]">
            <div className="w-32 shrink-0 p-2 font-medium text-sm border-r bg-muted/10 flex items-center">
              {room}
            </div>
            <div className="flex-1 relative py-2">
              {/* Grid lines */}
              <div className="absolute inset-0 flex pointer-events-none">
                {hours.map((hour) => (
                  <div 
                    key={hour} 
                    className="flex-1 border-r border-dashed border-border/50 last:border-r-0"
                    style={{ minWidth: '60px' }}
                  />
                ))}
              </div>
              
              {/* Events */}
              {roomEvents.map(({ event, exam }) => {
                const position = getEventPosition(event);
                const examiner1 = getStaffById(exam.examiner1Id);
                const isCancelled = event.status === 'cancelled';
                
                return (
                  <Tooltip key={event.id}>
                    <TooltipTrigger asChild>
                      <div
                        className={`absolute top-1 bottom-1 rounded px-1.5 py-0.5 text-xs cursor-pointer transition-colors overflow-hidden ${getDegreeColor(exam.degree)} ${isCancelled ? 'opacity-50 line-through' : ''}`}
                        style={{
                          left: position.left,
                          width: position.width,
                          minWidth: '40px',
                        }}
                      >
                        <div className="font-medium truncate">
                          {exam.studentName}
                        </div>
                        <div className="truncate opacity-80 text-[10px]">
                          {event.startTime} - {event.endTime}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="space-y-1">
                        <div className="font-semibold">{exam.studentName}</div>
                        <div className="text-xs text-muted-foreground">{exam.topic}</div>
                        <div className="flex gap-2 pt-1">
                          <Badge variant="outline" className="text-xs">
                            {exam.degree}
                          </Badge>
                          {exam.kompetenzfeld && (
                            <Badge variant="secondary" className="text-xs">
                              {exam.kompetenzfeld}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs pt-1">
                          <span className="text-muted-foreground">Zeit:</span> {event.startTime} - {event.endTime}
                        </div>
                        {examiner1 && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">Prüfer:</span> {examiner1.name}
                          </div>
                        )}
                        {isCancelled && (
                          <div className="text-xs text-destructive font-medium">Abgesagt</div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      
      {/* Legend */}
      <div className="flex gap-4 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-secondary" />
          <span className="text-muted-foreground">Bachelor</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-primary/80" />
          <span className="text-muted-foreground">Master</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
