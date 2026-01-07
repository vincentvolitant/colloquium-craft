import { useEffect } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';

interface SupabaseInitializerProps {
  children: React.ReactNode;
}

export function SupabaseInitializer({ children }: SupabaseInitializerProps) {
  const initializeFromSupabase = useScheduleStore((state) => state.initializeFromSupabase);
  const isLoading = useScheduleStore((state) => state.isLoading);
  const isInitialized = useScheduleStore((state) => state.isInitialized);

  useEffect(() => {
    initializeFromSupabase();
  }, [initializeFromSupabase]);

  if (isLoading && !isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Lade Daten...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
