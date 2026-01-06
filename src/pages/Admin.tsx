import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useScheduleStore } from '@/store/scheduleStore';
import { AdminAuthGate } from '@/components/admin/AdminAuthGate';
import { ExcelUploadWizard } from '@/components/admin/ExcelUploadWizard';
import { StaffAvailabilityPanel } from '@/components/admin/StaffAvailabilityPanel';
import { ScheduleConfigPanel } from '@/components/admin/ScheduleConfigPanel';
import { ScheduleGeneratorPanel } from '@/components/admin/ScheduleGeneratorPanel';
import { ExportPanel } from '@/components/admin/ExportPanel';
import { AdminScheduleManager } from '@/components/admin/AdminScheduleManager';
import { ScheduleImportWizard } from '@/components/admin/ScheduleImportWizard';
import { AdminStatusDashboard } from '@/components/admin/AdminStatusDashboard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Home, LogOut, Users, GraduationCap, Calendar, Settings, Play, Download, ListChecks, FileUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Exam, StaffMember } from '@/types';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('staff');
  const { 
    exams, 
    staff, 
    setExams, 
    addExams, 
    addOrUpdateStaff,
    setStaff,
    logoutAdmin,
  } = useScheduleStore();
  const { toast } = useToast();
  
  const handleStepClick = (step: string) => {
    setActiveTab(step);
  };
  
  const handleExamsImport = (data: Exam[] | StaffMember[], warnings: string[]) => {
    const newExams = data as Exam[];
    addExams(newExams);
    
    toast({
      title: 'Prüfungen importiert',
      description: `${newExams.length} Prüfungen wurden hinzugefügt.${warnings.length > 0 ? ` ${warnings.length} Warnung(en).` : ''}`,
    });
  };
  
  const handleStaffImport = (data: Exam[] | StaffMember[], warnings: string[]) => {
    const newStaff = data as StaffMember[];
    addOrUpdateStaff(newStaff, false); // Don't reset availability
    
    toast({
      title: 'Mitarbeitende importiert',
      description: `${newStaff.length} Mitarbeitende wurden hinzugefügt/aktualisiert.${warnings.length > 0 ? ` ${warnings.length} Warnung(en).` : ''}`,
    });
  };
  
  const handleClearExams = () => {
    setExams([]);
    toast({
      title: 'Prüfungen gelöscht',
      description: 'Alle Prüfungsdaten wurden entfernt.',
    });
  };
  
  const handleClearStaff = () => {
    setStaff([]);
    toast({
      title: 'Mitarbeitende gelöscht',
      description: 'Alle Mitarbeiterdaten wurden entfernt.',
    });
  };
  
  return (
    <AdminAuthGate>
      <div className="min-h-screen bg-background">
        {/* Header - simplified */}
        <header className="border-b bg-card sticky top-0 z-10">
          <div className="container py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link to="/">
                  <Button variant="ghost" size="icon">
                    <Home className="h-4 w-4" />
                  </Button>
                </Link>
                <h1 className="text-lg font-semibold">Admin</h1>
              </div>
              <Button variant="ghost" size="sm" onClick={logoutAdmin} className="gap-2">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Abmelden</span>
              </Button>
            </div>
          </div>
        </header>
        
        <main className="container py-4 space-y-4">
          {/* Status Dashboard */}
          <AdminStatusDashboard onStepClick={handleStepClick} />
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-lg">
              <TabsTrigger value="staff" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Mitarbeitende</span>
              </TabsTrigger>
              <TabsTrigger value="availability" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Verfügbarkeiten</span>
              </TabsTrigger>
              <TabsTrigger value="exams" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
                <GraduationCap className="h-4 w-4" />
                <span className="hidden sm:inline">Prüfungen</span>
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Räume & Tage</span>
              </TabsTrigger>
              <TabsTrigger value="generate" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
                <Play className="h-4 w-4" />
                <span className="hidden sm:inline">Generieren</span>
              </TabsTrigger>
              <TabsTrigger value="manage" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
                <ListChecks className="h-4 w-4" />
                <span className="hidden sm:inline">Termine</span>
              </TabsTrigger>
              <TabsTrigger value="export" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
              </TabsTrigger>
              <TabsTrigger value="import" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
                <FileUp className="h-4 w-4" />
                <span className="hidden sm:inline">Import</span>
              </TabsTrigger>
            </TabsList>
            
            {/* Step 1: Import Staff */}
            <TabsContent value="staff" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Schritt 1: Mitarbeitende importieren</h2>
                {staff.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handleClearStaff}>
                    Alle löschen
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Laden Sie eine Excel-Datei mit Mitarbeiterdaten hoch. Erforderliche Spalten: Name, Beschäftigungsart (Intern/Extern/Lehrbeauftragt), Primäres Kompetenzfeld.
              </p>
              <ExcelUploadWizard 
                type="staff" 
                onComplete={handleStaffImport}
              />
            </TabsContent>
            
            {/* Step 2: Availability */}
            <TabsContent value="availability">
              <h2 className="text-lg font-semibold mb-4">Schritt 2: Verfügbarkeiten pflegen</h2>
              <StaffAvailabilityPanel />
            </TabsContent>
            
            {/* Step 3: Import Exams */}
            <TabsContent value="exams" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Schritt 3: Prüfungen importieren</h2>
                {exams.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handleClearExams}>
                    Alle löschen
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Laden Sie Excel-Dateien mit Prüfungsdaten hoch. Die Prüfer müssen in der Mitarbeiterliste vorhanden sein.
              </p>
              <ExcelUploadWizard 
                type="exams" 
                onComplete={handleExamsImport}
                existingStaff={staff}
              />
            </TabsContent>
            
            {/* Step 4: Config */}
            <TabsContent value="config">
              <h2 className="text-lg font-semibold mb-4">Schritt 4: Räume & Tage konfigurieren</h2>
              <ScheduleConfigPanel />
            </TabsContent>
            
            {/* Step 5: Generate */}
            <TabsContent value="generate">
              <h2 className="text-lg font-semibold mb-4">Schritt 5: Plan generieren</h2>
              <ScheduleGeneratorPanel />
            </TabsContent>
            
            {/* Step 6: Manage Events */}
            <TabsContent value="manage">
              <h2 className="text-lg font-semibold mb-4">Schritt 6: Termine verwalten</h2>
              <AdminScheduleManager />
            </TabsContent>
            
            {/* Step 7: Export */}
            <TabsContent value="export">
              <h2 className="text-lg font-semibold mb-4">Schritt 7: Export & Veröffentlichung</h2>
              <ExportPanel />
            </TabsContent>
            
            {/* Step 8: Import (Roundtrip) */}
            <TabsContent value="import">
              <h2 className="text-lg font-semibold mb-4">Schritt 8: Plan aus XLSX einlesen</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Importieren Sie einen exportierten Plan zurück ins System (z.B. nach manueller Korrektur in Excel).
              </p>
              <ScheduleImportWizard />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </AdminAuthGate>
  );
}
