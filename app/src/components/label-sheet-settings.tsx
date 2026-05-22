'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown } from 'lucide-react';
import type { SheetSettings, ContentSettings, LayoutSettings } from '@/lib/label-sheet-config';
import { PAPER_SIZES } from '@/lib/label-sheet-config';

interface LabelSheetSettingsProps {
  sheet: SheetSettings;
  content: ContentSettings;
  layout: LayoutSettings;
  updateSheet: (partial: Partial<SheetSettings>) => void;
  updateContent: (partial: Partial<ContentSettings>) => void;
  updateLayout: (partial: Partial<LayoutSettings>) => void;
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium bg-muted/50 hover:bg-muted transition-colors"
      >
        {title}
        <ChevronDown
          className="h-4 w-4 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      {open && (
        <div className="px-3 py-3 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Shows Tabs on wider screens, Select dropdown on narrow screens.
 * Prevents tab buttons from overlapping adjacent controls at small widths.
 */
function ResponsiveTabSelect({
  value,
  onValueChange,
  options,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <>
      {/* Dropdown on small screens */}
      <div className="sm:hidden">
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Tabs on wider screens */}
      <div className="hidden sm:block">
        <Tabs value={value} onValueChange={onValueChange}>
          <TabsList className="h-8 w-full">
            {options.map((o) => (
              <TabsTrigger key={o.value} value={o.value} className="text-xs px-2">{o.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  const [localValue, setLocalValue] = useState(String(value));
  const [editing, setEditing] = useState(false);

  // Sync from props when not actively editing
  useEffect(() => {
    if (!editing) setLocalValue(String(value));
  }, [value, editing]);

  const handleBlur = () => {
    setEditing(false);
    const v = parseFloat(localValue);
    if (!isNaN(v)) {
      const clamped = Math.max(min, Math.min(max, v));
      onChange(clamped);
      setLocalValue(String(clamped));
    } else {
      setLocalValue(String(value));
    }
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={localValue}
          onFocus={() => setEditing(true)}
          onChange={(e) => {
            const raw = e.target.value;
            setLocalValue(raw);
            const v = parseFloat(raw);
            if (!isNaN(v) && v >= min && v <= max) onChange(v);
          }}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="h-8 text-xs"
        />
        {suffix && <span className="text-xs text-muted-foreground whitespace-nowrap">{suffix}</span>}
      </div>
    </div>
  );
}

export function LabelSheetSettings({
  sheet,
  content,
  layout,
  updateSheet,
  updateContent,
  updateLayout,
}: LabelSheetSettingsProps) {
  return (
    <div className="space-y-2">
      {/* Настройки печати */}
      <CollapsibleSection title="Настройки печати" defaultOpen>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Размер бумаги */}
          <div className="space-y-1">
            <Label className="text-xs">Размер бумаги</Label>
            <Select
              value={sheet.paperSize}
              onValueChange={(v) => updateSheet({ paperSize: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAPER_SIZES).map(([key, ps]) => (
                  <SelectItem key={key} value={key}>{ps.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Border */}
          <div className="space-y-1">
            <Label className="text-xs">Границы</Label>
            <ResponsiveTabSelect
              value={sheet.borderMode}
              onValueChange={(v) => updateSheet({ borderMode: v as SheetSettings['borderMode'] })}
              options={[
                { value: 'none', label: 'Нет' },
                { value: 'border', label: 'Рамка' },
                { value: 'grid', label: 'Сетка' },
              ]}
            />
          </div>
        </div>

        {/* Custom size inputs */}
        {sheet.paperSize === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="Ширина" value={sheet.customWidthMm} onChange={(v) => updateSheet({ customWidthMm: v })} min={10} max={500} step={0.1} suffix="mm" />
            <NumberInput label="Высота" value={sheet.customHeightMm} onChange={(v) => updateSheet({ customHeightMm: v })} min={10} max={500} step={0.1} suffix="mm" />
          </div>
        )}

        <div className="grid grid-cols-4 gap-3">
          <NumberInput label="Колонки" value={sheet.columns} onChange={(v) => updateSheet({ columns: v })} min={1} max={10} />
          <NumberInput label="Строки" value={sheet.rows} onChange={(v) => updateSheet({ rows: v })} min={1} max={15} />
          <NumberInput label="Пропустить" value={sheet.skipItems} onChange={(v) => updateSheet({ skipItems: v })} min={0} max={99} />
          <NumberInput label="Копии" value={sheet.itemCopies} onChange={(v) => updateSheet({ itemCopies: v })} min={1} max={10} />
        </div>
      </CollapsibleSection>

      {/* Настройки содержимого */}
      <CollapsibleSection title="Настройки содержимого">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">QR-код</Label>
            <ResponsiveTabSelect
              value={content.qrMode}
              onValueChange={(v) => updateContent({ qrMode: v as ContentSettings['qrMode'] })}
              options={[
                { value: 'none', label: 'Без QR' },
                { value: 'simple', label: 'QR' },
                { value: 'icon', label: 'Иконка' },
              ]}
            />
          </div>
          <NumberInput
            label="Размер текста"
            value={content.labelTextSizeMm}
            onChange={(v) => updateContent({ labelTextSizeMm: v })}
            min={1}
            max={10}
            step={0.5}
            suffix="mm"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="showLabel"
              checked={content.showLabel}
              onCheckedChange={(c) => updateContent({ showLabel: !!c })}
            />
            <label htmlFor="showLabel" className="text-xs">Печатать текст этикетки</label>
          </div>

          {content.showLabel && (
            <div className="grid grid-cols-3 gap-2 ml-6">
              <div className="flex items-center space-x-2">
                <Checkbox id="lsVendor" checked={content.showVendor} onCheckedChange={(c) => updateContent({ showVendor: !!c })} />
                <label htmlFor="lsVendor" className="text-xs">Производитель</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="lsName" checked={content.showName} onCheckedChange={(c) => updateContent({ showName: !!c })} />
                <label htmlFor="lsName" className="text-xs">Название</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="lsMaterial" checked={content.showMaterial} onCheckedChange={(c) => updateContent({ showMaterial: !!c })} />
                <label htmlFor="lsMaterial" className="text-xs">Материал</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="lsColor" checked={content.showColor} onCheckedChange={(c) => updateContent({ showColor: !!c })} />
                <label htmlFor="lsColor" className="text-xs">Цвет</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="lsId" checked={content.showSpoolId} onCheckedChange={(c) => updateContent({ showSpoolId: !!c })} />
                <label htmlFor="lsId" className="text-xs">ID катушки</label>
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Настройки макета */}
      <CollapsibleSection title="Настройки макета">
        <div className="space-y-2">
          <Label className="text-xs font-medium">Поля (мм)</Label>
          <div className="grid grid-cols-4 gap-2">
            <NumberInput label="Левое" value={layout.marginLeftMm} onChange={(v) => updateLayout({ marginLeftMm: v })} min={0} max={50} step={0.5} />
            <NumberInput label="Верхнее" value={layout.marginTopMm} onChange={(v) => updateLayout({ marginTopMm: v })} min={0} max={50} step={0.5} />
            <NumberInput label="Правое" value={layout.marginRightMm} onChange={(v) => updateLayout({ marginRightMm: v })} min={0} max={50} step={0.5} />
            <NumberInput label="Нижнее" value={layout.marginBottomMm} onChange={(v) => updateLayout({ marginBottomMm: v })} min={0} max={50} step={0.5} />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">Безопасные зоны (мм)</Label>
          <div className="grid grid-cols-4 gap-2">
            <NumberInput label="Левое" value={layout.safeZoneLeftMm} onChange={(v) => updateLayout({ safeZoneLeftMm: v })} min={0} max={20} step={0.5} />
            <NumberInput label="Верхнее" value={layout.safeZoneTopMm} onChange={(v) => updateLayout({ safeZoneTopMm: v })} min={0} max={20} step={0.5} />
            <NumberInput label="Правое" value={layout.safeZoneRightMm} onChange={(v) => updateLayout({ safeZoneRightMm: v })} min={0} max={20} step={0.5} />
            <NumberInput label="Нижнее" value={layout.safeZoneBottomMm} onChange={(v) => updateLayout({ safeZoneBottomMm: v })} min={0} max={20} step={0.5} />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">Расстояние (мм)</Label>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="Горизонтальное" value={layout.spacingHorizontalMm} onChange={(v) => updateLayout({ spacingHorizontalMm: v })} min={0} max={20} step={0.5} />
            <NumberInput label="Вертикальное" value={layout.spacingVerticalMm} onChange={(v) => updateLayout({ spacingVerticalMm: v })} min={0} max={20} step={0.5} />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
