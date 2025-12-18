import { Link } from 'react-router-dom';
import { useScheduleStore } from '@/store/scheduleStore';
import { AdminAuthGate } from '@/components/admin/AdminAuthGate';
import { ExcelUploadWizard } from '@/components/admin/ExcelUploadWizard';
import { ScheduleConfigPanel } from '@/components/admin/ScheduleConfigPanel';
import { ScheduleGeneratorPanel } from '@/components/admin/ScheduleGeneratorPanel';
import { ExportPanel } from '@/components/admin/ExportPanel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Home, LogOut, Upload, Settings, Play, Download, Users, GraduationCap, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Exam, StaffMember } from '@/types';

export default function AdminPage() {
  const { 
    exams, 
    staff, 
    setExams, 
    addExams, 
    setStaff, 
    logoutAdmin,
  } = useScheduleStore();
  const { toast } = useToast();
  
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
    setStaff([...staff, ...newStaff]);
    
    toast({
      title: 'Mitarbeiter importiert',
      description: `${newStaff.length} Mitarbeiter wurden hinzugefügt.${warnings.length > 0 ? ` ${warnings.length} Warnung(en).` : ''}`,
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
      title: 'Mitarbeiter gelöscht',
      description: 'Alle Mitarbeiterdaten wurden entfernt.',
    });
  };
  
  return (
    <AdminAuthGate>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b-2 bg-card sticky top-0 z-10">
          <div className="container py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link to="/">
                  <Button variant="outline" size="icon">
                    <Home className="h-4 w-4" />
                  </Button>
                </Link>
                <div>
                  <h1 className="text-xl font-bold">Admin-Bereich</h1>
                  <p className="text-sm text-muted-foreground">Kolloquiumsplaner</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  <Badge variant="outline" className="gap-1">
                    <GraduationCap className="h-3 w-3" />
                    {exams.length} Prüfungen
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Users className="h-3 w-3" />
                    {staff.length} Mitarbeiter
                  </Badge>
                </div>
                <Link to="/" target="_blank">
                  <Button variant="outline" className="gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Öffentliche Ansicht
                  </Button>
                </Link>
                <Button variant="ghost" onClick={logoutAdmin} className="gap-2">
                  <LogOut className="h-4 w-4" />
                  Abmelden
                </Button>
              </div>
            </div>
          </div>
        </header>
        
        <main className="container py-6">
          <Tabs defaultValue="upload" className="space-y-6">
            <TabsList className="w-full justify-start flex-wrap h-auto gap-2 bg-transparent p-0">
              <TabsTrigger value="upload" className="gap-2 border-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Upload className="h-4 w-4" />
                Daten importieren
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-2 border-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Settings className="h-4 w-4" />
                Konfiguration
              </TabsTrigger>
              <TabsTrigger value="generate" className="gap-2 border-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Play className="h-4 w-4" />
                Plan erstellen
              </TabsTrigger>
              <TabsTrigger value="export" className="gap-2 border-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Download className="h-4 w-4" />
                Export
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="upload" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <GraduationCap className="h-5 w-5" />
                      Prüfungen
                    </h2>
                    {exams.length > 0 && (
                      <Button variant="outline" size="sm" onClick={handleClearExams}>
                        Alle löschen
                      </Button>
                    )}
                  </div>
                  <ExcelUploadWizard 
                    type="exams" 
                    onComplete={handleExamsImport}
                    existingStaff={staff}
                  />
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Mitarbeiter
                    </h2>
                    {staff.length > 0 && (
                      <Button variant="outline" size="sm" onClick={handleClearStaff}>
                        Alle löschen
                      </Button>
                    )}
                  </div>
                  <ExcelUploadWizard 
                    type="staff" 
                    onComplete={handleStaffImport}
                  />
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="config">
              <ScheduleConfigPanel />
            </TabsContent>
            
            <TabsContent value="generate">
              <ScheduleGeneratorPanel />
            </TabsContent>
            
            <TabsContent value="export">
              <ExportPanel />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </AdminAuthGate>
  );
}
