import { useScheduleStore } from '@/store/scheduleStore';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  GraduationCap, 
  Calendar, 
  CheckCircle2,
  Circle,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepStatus {
  label: string;
  icon: React.ReactNode;
  status: 'complete' | 'pending' | 'warning';
  count?: number;
  onClick?: () => void;
}

interface AdminStatusDashboardProps {
  onStepClick?: (step: string) => void;
}

export function AdminStatusDashboard({ onStepClick }: AdminStatusDashboardProps) {
  const { 
    staff, 
    exams, 
    config,
    scheduleVersions,
    scheduledEvents 
  } = useScheduleStore();
  
  const publishedVersion = scheduleVersions.find(v => v.status === 'published');
  const hasSchedule = scheduleVersions.length > 0;
  const activeEvents = scheduledEvents.filter(e => e.status === 'scheduled').length;
  
  const steps: StepStatus[] = [
    {
      label: 'Mitarbeitende',
      icon: <Users className="h-4 w-4" />,
      status: staff.length > 0 ? 'complete' : 'pending',
      count: staff.length,
      onClick: () => onStepClick?.('staff'),
    },
    {
      label: 'Prüfungen',
      icon: <GraduationCap className="h-4 w-4" />,
      status: exams.length > 0 ? 'complete' : 'pending',
      count: exams.length,
      onClick: () => onStepClick?.('exams'),
    },
    {
      label: 'Räume & Tage',
      icon: <Calendar className="h-4 w-4" />,
      status: config && config.days.length > 0 && config.rooms.length > 0 
        ? 'complete' 
        : 'pending',
      count: config?.days.length || 0,
      onClick: () => onStepClick?.('config'),
    },
    {
      label: 'Plan',
      icon: hasSchedule 
        ? (publishedVersion ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />)
        : <Circle className="h-4 w-4" />,
      status: publishedVersion ? 'complete' : (hasSchedule ? 'warning' : 'pending'),
      count: activeEvents,
      onClick: () => onStepClick?.('generate'),
    },
  ];

  return (
    <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg border">
      {steps.map((step, idx) => (
        <button
          key={step.label}
          onClick={step.onClick}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
            "hover:bg-background",
            step.status === 'complete' && "text-primary",
            step.status === 'warning' && "text-amber-600",
            step.status === 'pending' && "text-muted-foreground"
          )}
        >
          <span className={cn(
            "flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium",
            step.status === 'complete' && "bg-primary text-primary-foreground",
            step.status === 'warning' && "bg-amber-100 text-amber-700",
            step.status === 'pending' && "bg-muted text-muted-foreground"
          )}>
            {step.status === 'complete' ? '✓' : idx + 1}
          </span>
          {step.icon}
          <span className="font-medium">{step.label}</span>
          {step.count !== undefined && step.count > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">
              {step.count}
            </Badge>
          )}
        </button>
      ))}
    </div>
  );
}
