import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, ChevronDown, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StaffMember } from '@/types';

interface StaffMultiSelectProps {
  staff: StaffMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function StaffMultiSelect({
  staff,
  selectedIds,
  onChange,
  max = 4,
  placeholder = 'Auswählen...',
  className,
  disabled = false,
}: StaffMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = staff.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else if (selectedIds.length < max) {
      onChange([...selectedIds, id]);
    }
  };

  const remove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedIds.filter(i => i !== id));
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const selectedStaff = selectedIds
    .map(id => staff.find(s => s.id === id))
    .filter(Boolean) as StaffMember[];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal h-auto min-h-[2.5rem] py-1.5',
            !selectedIds.length && 'text-muted-foreground',
            className
          )}
        >
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedStaff.length === 0 ? (
              <span className="text-sm">{placeholder}</span>
            ) : (
              selectedStaff.map(s => (
                <Badge key={s.id} variant="secondary" className="gap-1 pr-1 text-xs shrink-0">
                  {s.name}
                  <button
                    onClick={(e) => remove(s.id, e)}
                    className="ml-0.5 hover:bg-accent rounded-sm p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {selectedIds.length > 0 && (
              <button
                onClick={clearAll}
                className="hover:bg-accent rounded-sm p-0.5"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        <ScrollArea className="max-h-[200px]">
          <div className="p-1">
            {filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                Keine Ergebnisse
              </div>
            ) : (
              filtered.map(s => {
                const isSelected = selectedIds.includes(s.id);
                const isDisabled = !isSelected && selectedIds.length >= max;
                return (
                  <button
                    key={s.id}
                    onClick={() => !isDisabled && toggle(s.id)}
                    disabled={isDisabled}
                    className={cn(
                      'flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm text-left',
                      isSelected ? 'bg-accent' : 'hover:bg-muted',
                      isDisabled && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    <div className={cn(
                      'h-4 w-4 border rounded-sm flex items-center justify-center shrink-0',
                      isSelected ? 'bg-primary border-primary' : 'border-input'
                    )}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{s.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">
                      {s.employmentType === 'internal' ? 'Int' : s.employmentType === 'external' ? 'Ext' : 'LB'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
        {selectedIds.length > 0 && (
          <div className="border-t p-2 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{selectedIds.length}/{max} ausgewählt</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { onChange([]); }}>
              Alle entfernen
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
