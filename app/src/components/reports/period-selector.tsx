'use client';

import { Button } from '@/components/ui/button';

interface PeriodOption {
  label: string;
  days: number | null; // null = всё время
}

const PERIODS: PeriodOption[] = [
  { label: '7д', days: 7 },
  { label: '30д', days: 30 },
  { label: '90д', days: 90 },
  { label: '1г', days: 365 },
  { label: 'Всё время', days: null },
];

interface PeriodSelectorProps {
  selectedDays: number | null;
  onChange: (days: number | null) => void;
}

export function PeriodSelector({ selectedDays, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {PERIODS.map((period) => (
        <Button
          key={period.label}
          variant={selectedDays === period.days ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(period.days)}
        >
          {period.label}
        </Button>
      ))}
    </div>
  );
}