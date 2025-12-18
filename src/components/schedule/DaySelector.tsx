import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarDays } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

interface DaySelectorProps {
  days: string[]; // YYYY-MM-DD format
  selectedDay: string;
  onDayChange: (day: string) => void;
}

export function DaySelector({ days, selectedDay, onDayChange }: DaySelectorProps) {
  if (days.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CalendarDays className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>Keine Termine geplant</p>
      </div>
    );
  }
  
  return (
    <Tabs value={selectedDay} onValueChange={onDayChange} className="w-full">
      <TabsList className="w-full justify-start h-auto flex-wrap gap-2 bg-transparent p-0">
        {days.map((day) => {
          const date = parseISO(day);
          const dayName = format(date, 'EEEE', { locale: de });
          const dateStr = format(date, 'd. MMMM yyyy', { locale: de });
          
          return (
            <TabsTrigger 
              key={day} 
              value={day}
              className="border-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2"
            >
              <div className="flex flex-col items-start">
                <span className="font-semibold">{dayName}</span>
                <span className="text-xs opacity-80">{dateStr}</span>
              </div>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
