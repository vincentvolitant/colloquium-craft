import { useState } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AdminAuthGateProps {
  children: React.ReactNode;
}

export function AdminAuthGate({ children }: AdminAuthGateProps) {
  const { isAdminAuthenticated, authenticateAdmin } = useScheduleStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const { toast } = useToast();
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = authenticateAdmin(password);
    
    if (success) {
      toast({
        title: 'Anmeldung erfolgreich',
        description: 'Willkommen im Admin-Bereich.',
      });
      setPassword('');
      setError(false);
    } else {
      setError(true);
      toast({
        title: 'Falsches Passwort',
        description: 'Bitte versuchen Sie es erneut.',
        variant: 'destructive',
      });
    }
  };
  
  if (isAdminAuthenticated) {
    return <>{children}</>;
  }
  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-2">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Admin-Bereich</CardTitle>
          <CardDescription>
            Bitte geben Sie das Passwort ein, um fortzufahren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(false);
                }}
                placeholder="Admin-Passwort eingeben"
                className={error ? 'border-destructive' : ''}
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  Falsches Passwort
                </p>
              )}
            </div>
            <Button type="submit" className="w-full">
              Anmelden
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
