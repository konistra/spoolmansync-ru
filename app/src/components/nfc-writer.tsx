'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpoolFilterBar } from '@/components/dashboard/spool-filter-bar';
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
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Nfc, CheckCircle2, XCircle, Loader2, AlertTriangle, Smartphone } from 'lucide-react';
import { SpoolColorSwatch } from '@/components/spool-color-swatch';
import type { Spool } from '@/lib/api/spoolman';
import { buildSpoolSearchValue, parseExtraValue } from '@/lib/api/spoolman';
import { buildExternalUrl } from '@/lib/ingress-path';

type SortBy = 'id' | 'name' | 'material' | 'vendor';

interface NFCWriterProps {
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

type WriteStatus = 'idle' | 'writing' | 'success' | 'error';

// Extend Window interface for Web NFC API
declare global {
  interface Window {
    NDEFReader?: new () => NDEFReader;
  }

  interface NDEFReader {
    write(message: NDEFMessageInit): Promise<void>;
    scan(): Promise<void>;
    onreading: ((event: NDEFReadingEvent) => void) | null;
    onreadingerror: ((event: Event) => void) | null;
  }

  interface NDEFMessageInit {
    records: NDEFRecordInit[];
  }

  interface NDEFRecordInit {
    recordType: string;
    data?: string | BufferSource;
    mediaType?: string;
    id?: string;
    encoding?: string;
    lang?: string;
  }

  interface NDEFReadingEvent extends Event {
    message: NDEFMessage;
    serialNumber: string;
  }

  interface NDEFMessage {
    records: NDEFRecord[];
  }

  interface NDEFRecord {
    recordType: string;
    data: DataView;
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

export function NFCWriter({ spools, directAccessPort, qrBaseUrl }: NFCWriterProps) {
  const [selectedSpool, setSelectedSpool] = useState<Spool | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [filters, setFilters] = useState<Record<string, string | null>>({});
  const [enabledFields, setEnabledFields] = useState<FilterField[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>('id');
  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);
  const [writeStatus, setWriteStatus] = useState<WriteStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Check for NFC support on mount
  useEffect(() => {
    setNfcSupported('NDEFReader' in window);
  }, []);

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
      for (const [key, value] of Object.entries(filters)) {
        if (value) {
          const spoolValue = getSpoolFieldValue(spool, key);
          if (spoolValue !== value) return false;
        }
      }
      return true;
    });
    return sortSpools(filtered, sortBy);
  }, [spools, filters, sortBy]);

  const nfcUrl = selectedSpool
    ? buildExternalUrl(`/scan/spool/${selectedSpool.id}`, directAccessPort, qrBaseUrl)
    : null;

  const handleSpoolSelect = (spool: Spool) => {
    setSelectedSpool(spool);
    setSearchValue('');
    setWriteStatus('idle');
    setErrorMessage('');
  };

  const handleFilterChange = (key: string, value: string | null) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({});
  };

  const handleWriteNFC = async () => {
    if (!nfcUrl || !window.NDEFReader) return;

    setWriteStatus('writing');
    setErrorMessage('');

    try {
      // Check NFC permission status first
      if ('permissions' in navigator) {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'nfc' as PermissionName });
          if (permissionStatus.state === 'denied') {
            setWriteStatus('error');
            setErrorMessage('Доступ NFC заблокирован. Пожалуйста, включите разрешение NFC для этого сайта в настройках браузера.');
            return;
          }
        } catch {
          // Permission query not supported, continue anyway
        }
      }

      const ndef = new window.NDEFReader();

      // Request permission by initiating a scan first
      // This triggers the browser's NFC permission prompt if not yet granted
      await ndef.scan();

      // Now write to the tag
      await ndef.write({
        records: [{ recordType: 'url', data: nfcUrl }],
      });
      setWriteStatus('success');
    } catch (err) {
      setWriteStatus('error');
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setErrorMessage('Доступ NFC заблокирован. Пожалуйста, включите разрешение NFC для этого сайта в настройках браузера.');
        } else if (err.name === 'NotSupportedError') {
          setErrorMessage('NFC не поддерживается на этом устройстве.');
        } else if (err.name === 'NotReadableError') {
          setErrorMessage('Не удалось прочитать NFC-метку. Убедитесь, что она расположена правильно.');
        } else if (err.name === 'NetworkError') {
          setErrorMessage('Ошибка передачи NFC. Пожалуйста, попробуйте снова.');
        } else if (err.name === 'AbortError') {
          setErrorMessage('Операция NFC была отменена.');
        } else {
          setErrorMessage(err.message || 'Не удалось записать NFC-метку.');
        }
      } else {
        setErrorMessage('Произошла неизвестная ошибка.');
      }
    }
  };

  // Show loading state while checking NFC support
  if (nfcSupported === null) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show unsupported message for non-NFC browsers
  if (!nfcSupported) {
    const baseUrl = typeof window !== 'undefined' ? buildExternalUrl('/scan/spool/', directAccessPort, qrBaseUrl) : '/scan/spool/';

    return (
      <Alert>
        <Smartphone className="h-4 w-4" />
        <AlertTitle>Web NFC не поддерживается</AlertTitle>
        <AlertDescription>
          <p className="mb-2">
            Web NFC поддерживается только на <strong>Android</strong> с определёнными браузерами
            (Chrome, Edge, Opera, Samsung Internet).
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            iOS, Firefox и Brave не поддерживают Web NFC. Используйте QR-коды или специальное приложение для записи NFC.
          </p>
          <p className="text-xs text-muted-foreground">
            Для ручной записи с помощью другого приложения используйте этот формат URL:
          </p>
          <p className="text-xs font-mono bg-muted p-2 rounded mt-1 break-all select-all">
            {baseUrl}<span className="text-primary">[ID_КАТУШКИ]</span>
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters & Sort */}
      {enabledFields.length > 0 ? (
        <SpoolFilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearAll={handleClearFilters}
          fields={enabledFields}
          extra={
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id">По ID</SelectItem>
                <SelectItem value="name">По названию</SelectItem>
                <SelectItem value="material">По материалу</SelectItem>
                <SelectItem value="vendor">По производителю</SelectItem>
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
              <SelectItem value="id">По ID</SelectItem>
              <SelectItem value="name">По названию</SelectItem>
              <SelectItem value="material">По материалу</SelectItem>
              <SelectItem value="vendor">По производителю</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Spool Selector */}
      <Command className="rounded-lg border">
        <CommandInput
          placeholder="Поиск катушек по названию, производителю, материалу или ID..."
          value={searchValue}
          onValueChange={setSearchValue}
        />
        <CommandList className="max-h-[200px]">
          <CommandEmpty>Катушки не найдены.</CommandEmpty>
          <CommandGroup heading={`${filteredSpools.length} катушек`}>
            {filteredSpools.map((spool) => (
              <CommandItem
                key={spool.id}
                value={buildSpoolSearchValue(spool)}
                onSelect={() => handleSpoolSelect(spool)}
                className="flex items-center gap-3 py-2 cursor-pointer"
              >
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
            ))}
          </CommandGroup>
        </CommandList>
      </Command>

      {/* Selected Spool & Write Button */}
      {selectedSpool && nfcUrl && (
        <div className="space-y-4">
          {/* Selected Spool Info */}
          <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/50">
            <SpoolColorSwatch filament={selectedSpool.filament} size="h-10 w-10" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">
                {selectedSpool.filament.vendor?.name} {selectedSpool.filament.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {selectedSpool.filament.material} • Катушка #{selectedSpool.id}
              </p>
            </div>
          </div>

          {/* Write Status Feedback */}
          {writeStatus === 'success' && (
            <Alert className="border-green-500 bg-green-500/10">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertTitle className="text-green-500">Успешно!</AlertTitle>
              <AlertDescription>
                NFC-метка успешно записана. Теперь вы можете наклеить её на катушку.
              </AlertDescription>
            </Alert>
          )}

          {writeStatus === 'error' && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Ошибка записи</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Buttons Row */}
          <div className="flex gap-2">
            <Button
              onClick={handleWriteNFC}
              disabled={writeStatus === 'writing'}
              className="flex-1"
            >
              {writeStatus === 'writing' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Поднесите метку к телефону...
                </>
              ) : (
                <>
                  <Nfc className="h-4 w-4 mr-2" />
                  Записать NFC-метку
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedSpool(null);
                setWriteStatus('idle');
                setErrorMessage('');
              }}
            >
              Очистить
            </Button>
          </div>

          {writeStatus === 'idle' && (
            <p className="text-xs text-muted-foreground text-center">
              Нажмите кнопку, затем поднесите NFC-метку к считывателю телефона.
            </p>
          )}

          {/* URL Preview */}
          <p className="text-xs text-muted-foreground/70 text-center font-mono break-all">
            {nfcUrl}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!selectedSpool && (
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <Nfc className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-sm">Выберите катушку выше для записи NFC-метки</p>
        </div>
      )}

      {/* Instructions */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Перед началом</AlertTitle>
        <AlertDescription className="text-xs space-y-1">
          <p>• Используйте NFC-стикеры NTAG213, NTAG215 или NTAG216</p>
          <p>• Они не должны мешать RFID-меткам Bambu Lab AMS (разные протоколы), но сначала протестируйте</p>
          <p>• Поместите NFC-стикер на внешнюю сторону катушки, чтобы он не тёрся об AMS</p>
          <p>• Сканирование метки откроет страницу назначения лотка SpoolmanSync</p>
        </AlertDescription>
      </Alert>
    </div>
  );
}