import { useScheduleStore } from '@/store/scheduleStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { exportScheduleToXLSX, exportScheduleToCSV } from '@/lib/excelParser';
import { useToast } from '@/hooks/use-toast';
import { getAllExaminerIds } from '@/types';

export function ExportPanel() {
  const { exams, staff, scheduledEvents, scheduleVersions, getStaffById } = useScheduleStore();
  const { toast } = useToast();
  
  const publishedVersion = scheduleVersions.find(v => v.status === 'published');
  const events = publishedVersion 
    ? scheduledEvents.filter(e => e.scheduleVersionId === publishedVersion.id)
    : [];
  
  const prepareExportData = () => {
    return events.map(event => {
      const exam = exams.find(e => e.id === event.examId)!;
      // Get all examiners for team exams
      const examinerIds = getAllExaminerIds(exam);
      const allExaminers = examinerIds.map(id => getStaffById(id));
      
      return {
        exam,
        event: {
          dayDate: event.dayDate,
          room: event.room,
          startTime: event.startTime,
          endTime: event.endTime,
          status: event.status,
          cancelledReason: event.cancelledReason,
          durationMinutes: event.durationMinutes,
        },
        protocolist: getStaffById(event.protocolistId),
        examiner1: getStaffById(exam.examiner1Id),
        examiner2: getStaffById(exam.examiner2Id),
        allExaminers,
      };
    });
  };
  
  const handleExportXLSX = () => {
    const data = prepareExportData();
    const blob = exportScheduleToXLSX(data);
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kolloquiumsplan_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Export erfolgreich',
      description: 'Die Excel-Datei wurde heruntergeladen.',
    });
  };
  
  const handleExportCSV = () => {
    const data = prepareExportData();
    const csv = exportScheduleToCSV(data);
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kolloquiumsplan_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Export erfolgreich',
      description: 'Die CSV-Datei wurde heruntergeladen.',
    });
  };
  
  const hasPublishedSchedule = events.length > 0;
  
  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Export
        </CardTitle>
        <CardDescription>
          Exportieren Sie den veröffentlichten Kolloquiumsplan
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasPublishedSchedule ? (
          <p className="text-muted-foreground text-center py-4">
            Noch kein veröffentlichter Plan zum Exportieren vorhanden.
          </p>
        ) : (
          <div className="flex gap-4">
            <Button onClick={handleExportXLSX} variant="outline" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Excel (.xlsx)
            </Button>
            <Button onClick={handleExportCSV} variant="outline" className="gap-2">
              <FileText className="h-4 w-4" />
              CSV
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
