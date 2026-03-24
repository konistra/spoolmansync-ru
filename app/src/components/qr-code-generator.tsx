'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SpoolFilterBar } from '@/components/dashboard/spool-filter-bar';
import { LabelSheetSettings } from '@/components/label-sheet-settings';
import { LabelSheetPreview } from '@/components/label-sheet-preview';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Printer, QrCode, Maximize2, Minimize2 } from 'lucide-react';
import { SpoolColorSwatch } from '@/components/spool-color-swatch';
import type { Spool } from '@/lib/api/spoolman';
import { buildSpoolSearchValue, parseExtraValue } from '@/lib/api/spoolman';
import {
  DEFAULT_CONFIG,
  buildLabelItems,
  paginateItems,
  type LabelSheetConfig,
  type SheetSettings,
  type ContentSettings,
  type LayoutSettings,
} from '@/lib/label-sheet-config';

type SortBy = 'id' | 'name' | 'material' | 'vendor';

const LABEL_CONFIG_KEY = 'spoolmansync-label-config';
const PRINTED_SPOOLS_KEY = 'spoolmansync-printed-spools';

function loadLabelConfig(): LabelSheetConfig {
  try {
    const stored = localStorage.getItem(LABEL_CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        sheet: { ...DEFAULT_CONFIG.sheet, ...parsed.sheet },
        content: { ...DEFAULT_CONFIG.content, ...parsed.content },
        layout: { ...DEFAULT_CONFIG.layout, ...parsed.layout },
      };
    }
  } catch {
    // Corrupt or unavailable — fall through
  }
  return DEFAULT_CONFIG;
}

function loadPrintedSpools(): Set<number> {
  try {
    const stored = localStorage.getItem(PRINTED_SPOOLS_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch {
    // Corrupt or unavailable — fall through
  }
  return new Set();
}

function savePrintedSpools(ids: Set<number>) {
  try {
    localStorage.setItem(PRINTED_SPOOLS_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage full or unavailable
  }
}

function sortSpools(spools: Spool[], sortBy: SortBy): Spool[] {
  return [...spools].sort((a, b) => {
    switch (sortBy) {
      case 'id':
        return a.id - b.id;
      case 'name':
        return (a.filament.name || a.filament.material).localeCompare(b.filament.name || b.filament.material);
      case 'material':
        return (a.filament.material || '').localeCompare(b.filament.material || '');
      case 'vendor':
        return (a.filament.vendor?.name || '').localeCompare(b.filament.vendor?.name || '');
    }
  });
}

interface QRCodeGeneratorProps {
  spools: Spool[];
  directAccessPort?: number;
  qrBaseUrl?: string;
}

interface FilterField {
  key: string;
  name: string;
  values: string[];
  builtIn: boolean;
}

function getSpoolFieldValue(spool: Spool, fieldKey: string): string | null {
  switch (fieldKey) {
    case 'material':
      return spool.filament.material || null;
    case 'vendor':
      return spool.filament.vendor?.name || null;
    case 'location':
      return spool.location || null;
    case 'lot_nr':
      return spool.lot_nr || null;
    default:
      if (fieldKey.startsWith('extra_')) {
        const extraKey = fieldKey.replace('extra_', '');
        return parseExtraValue(spool.extra?.[extraKey]) || null;
      }
      return null;
  }
}

export function QRCodeGenerator({ spools, directAccessPort, qrBaseUrl }: QRCodeGeneratorProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchValue, setSearchValue] = useState('');
  const [filters, setFilters] = useState<Record<string, string | null>>({});
  const [enabledFields, setEnabledFields] = useState<FilterField[]>([]);
  const [config, setConfig] = useState<LabelSheetConfig>(() => loadLabelConfig());
  const [sortBy, setSortBy] = useState<SortBy>('id');
  const [printedSpools, setPrintedSpools] = useState<Set<number>>(() => loadPrintedSpools());
  const [hidePrinted, setHidePrinted] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [spoolListExpanded, setSpoolListExpanded] = useState(false);

  // Persist config to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(LABEL_CONFIG_KEY, JSON.stringify(config));
    } catch {
      // Storage full or unavailable
    }
  }, [config]);

  // Fetch filter fields on mount
  useEffect(() => {
    fetch('/api/spools/extra-fields')
      .then((res) => res.json())
      .then((data) => {
        if (data.fields && data.filterConfig) {
          const enabled = data.fields.filter(
            (f: FilterField) => data.filterConfig.includes(f.key)
          );
          setEnabledFields(enabled);
        }
      })
      .catch((err) => console.error('Failed to fetch filter fields:', err));
  }, []);

  // Filter and sort spools
  const filteredSpools = useMemo(() => {
    const filtered = spools.filter((spool) => {
      if (hidePrinted && printedSpools.has(spool.id)) return false;
      for (const [key, value] of Object.entries(filters)) {
        if (value) {
          const spoolValue = getSpoolFieldValue(spool, key);
          if (spoolValue !== value) return false;
        }
      }
      return true;
    });
    return sortSpools(filtered, sortBy);
  }, [spools, filters, sortBy, hidePrinted, printedSpools]);

  // Config updaters
  const updateSheet = useCallback((partial: Partial<SheetSettings>) => {
    setConfig((prev) => ({ ...prev, sheet: { ...prev.sheet, ...partial } }));
  }, []);

  const updateContent = useCallback((partial: Partial<ContentSettings>) => {
    setConfig((prev) => ({ ...prev, content: { ...prev.content, ...partial } }));
  }, []);

  const updateLayout = useCallback((partial: Partial<LayoutSettings>) => {
    setConfig((prev) => ({ ...prev, layout: { ...prev.layout, ...partial } }));
  }, []);

  // Build label items and pages
  const selectedSpools = useMemo(() => {
    return spools.filter((s) => selectedIds.has(s.id));
  }, [spools, selectedIds]);

  const labelItems = useMemo(() => {
    return buildLabelItems(selectedSpools, config, directAccessPort, qrBaseUrl);
  }, [selectedSpools, config, directAccessPort, qrBaseUrl]);

  const pages = useMemo(() => {
    return paginateItems(labelItems, config);
  }, [labelItems, config]);

  const totalLabels = labelItems.length;
  const totalPages = pages.length;

  // Toggle a spool's selection
  const toggleSpool = useCallback((spoolId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(spoolId)) {
        next.delete(spoolId);
      } else {
        next.add(spoolId);
      }
      return next;
    });
  }, []);

  // Select/deselect all visible spools
  const selectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const spool of filteredSpools) {
        next.add(spool.id);
      }
      return next;
    });
  }, [filteredSpools]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handlePrint = () => {
    window.print();
    // Track printed spools
    setPrintedSpools((prev) => {
      const next = new Set(prev);
      for (const id of selectedIds) {
        next.add(id);
      }
      savePrintedSpools(next);
      return next;
    });
  };

  const clearPrintedHistory = useCallback(() => {
    setPrintedSpools(new Set());
    savePrintedSpools(new Set());
  }, []);

  return (
    <div className="space-y-4">
      {/* Filters & Sort */}
      {enabledFields.length > 0 ? (
        <SpoolFilterBar
          filters={filters}
          onFilterChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
          onClearAll={() => setFilters({})}
          fields={enabledFields}
          extra={
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id">Sort: ID</SelectItem>
                <SelectItem value="name">Sort: Name</SelectItem>
                <SelectItem value="material">Sort: Material</SelectItem>
                <SelectItem value="vendor">Sort: Vendor</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      ) : (
        <div className="flex items-center justify-end">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="id">Sort: ID</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="material">Sort: Material</SelectItem>
              <SelectItem value="vendor">Sort: Vendor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Spool Selector */}
      <div className="space-y-2">
        {/* Selection toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            {printedSpools.size > 0 && (
              <>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={hidePrinted}
                    onCheckedChange={(checked) => setHidePrinted(checked === true)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Hide printed ({printedSpools.size})
                  </span>
                </label>
                <button
                  onClick={() => setConfirmClearOpen(true)}
                  className="text-xs text-muted-foreground hover:text-muted-foreground/80 underline-offset-2 hover:underline whitespace-nowrap"
                  title="Clear the list of spools you've already printed QR labels for"
                >
                  Clear history
                </button>
              </>
            )}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={selectAllVisible}>
              Select All
            </Button>
            {selectedIds.size > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={deselectAll}>
                Deselect All
              </Button>
            )}
          </div>
        </div>

        <Command className="rounded-lg border relative">
          <div className="relative">
            <CommandInput
              placeholder="Search spools by name, vendor, material, or ID..."
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setSpoolListExpanded(!spoolListExpanded)}
              title={spoolListExpanded ? 'Collapse list' : 'Expand list'}
            >
              {spoolListExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <CommandList className={spoolListExpanded ? 'max-h-[60vh]' : 'max-h-[200px]'}>
            <CommandEmpty>No spools found.</CommandEmpty>
            <CommandGroup heading={`${filteredSpools.length} spools`}>
              {filteredSpools.map((spool) => {
                const isSelected = selectedIds.has(spool.id);
                return (
                  <CommandItem
                    key={spool.id}
                    value={buildSpoolSearchValue(spool)}
                    onSelect={() => toggleSpool(spool.id)}
                    className="flex items-center gap-3 py-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={isSelected}
                      className="flex-shrink-0"
                      tabIndex={-1}
                    />
                    <SpoolColorSwatch filament={spool.filament} size="h-5 w-5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {spool.filament.name || spool.filament.material}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {spool.filament.vendor?.name ? `${spool.filament.vendor.name} • ` : ''}#{spool.id}
                      </p>
                    </div>
                    <Badge variant="secondary" className="flex-shrink-0">
                      {spool.filament.material}
                    </Badge>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>

      {/* Settings */}
      <div className="no-print">
        <LabelSheetSettings
          sheet={config.sheet}
          content={config.content}
          layout={config.layout}
          updateSheet={updateSheet}
          updateContent={updateContent}
          updateLayout={updateLayout}
        />
      </div>

      {/* Preview */}
      {selectedIds.size > 0 ? (
        <>
          <LabelSheetPreview pages={pages} config={config} />

          {/* Footer */}
          <div className="space-y-2 no-print">
            <div className="flex items-center gap-3">
              <Button onClick={handlePrint} className="flex-1">
                <Printer className="h-4 w-4 mr-2" />
                Print Labels
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-center justify-between">
                <span>{totalLabels} label{totalLabels !== 1 ? 's' : ''} on {totalPages} page{totalPages !== 1 ? 's' : ''}</span>
              </div>
              <p>Tip: In the browser print dialog, set margins to &quot;None&quot; and disable headers/footers for best results.</p>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <QrCode className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-sm">Select spools above to preview labels</p>
        </div>
      )}

      {/* Confirmation dialog for clearing printed history */}
      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear QR label print history?</DialogTitle>
            <DialogDescription>
              This will forget which {printedSpools.size} spool{printedSpools.size !== 1 ? 's' : ''} you&apos;ve
              previously printed QR labels for. All spools will show as unprinted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setConfirmClearOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearPrintedHistory();
                setHidePrinted(false);
                setConfirmClearOpen(false);
              }}
            >
              Clear history
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
