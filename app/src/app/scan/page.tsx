'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Nav } from '@/components/nav';
import { QRScanner } from '@/components/qr-scanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { Spool } from '@/lib/api/spoolman';
import { QRCodeGenerator } from '@/components/qr-code-generator';
import { NFCWriter } from '@/components/nfc-writer';

function ScanPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [allSpools, setAllSpools] = useState<Spool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [spoolsLoading, setSpoolsLoading] = useState(true);
  const [directAccessPort, setDirectAccessPort] = useState<number | undefined>(undefined);
  const [qrBaseUrl, setQrBaseUrl] = useState<string | undefined>(undefined);

  const handleScan = useCallback(async (scannedData: string) => {
    setLoading(true);
    setError(null);

    try {
      // Try to extract spool ID from various formats
      let spoolId: string | null = null;
      const trimmedData = scannedData.trim();

      // 1. Spoolman QR code format: web+spoolman:s-ID
      const spoolmanMatch = trimmedData.match(/web\+spoolman:s-(\d+)/i);
      if (spoolmanMatch) {
        spoolId = spoolmanMatch[1];
      }

      // 2. URL format: http(s)://hostname/spool/show/ID
      if (!spoolId) {
        const urlMatch = trimmedData.match(/\/spool\/show\/(\d+)/i);
        if (urlMatch) {
          spoolId = urlMatch[1];
        }
      }

      // 3. SpoolmanSync URL format: /scan/spool/ID
      if (!spoolId) {
        const syncMatch = trimmedData.match(/\/scan\/spool\/(\d+)/i);
        if (syncMatch) {
          spoolId = syncMatch[1];
        }
      }

      // 4. Plain number (assume it's a spool ID)
      if (!spoolId && /^\d+$/.test(trimmedData)) {
        spoolId = trimmedData;
      }

      // If we got a direct spool ID, redirect immediately
      if (spoolId) {
        router.push(`/scan/spool/${spoolId}`);
        return;
      }

      // 5. If no ID extracted, try matching by barcode in extra field
      const res = await fetch('/api/spools');
      if (!res.ok) throw new Error('Failed to fetch spools');

      const data = await res.json();
      const spools: Spool[] = data.spools || [];

      const matchedSpool = spools.find((s) => {
        if (!s.extra?.['barcode']) return false;
        const storedBarcode = s.extra['barcode'];
        // Compare with raw value and JSON-encoded value
        return storedBarcode === trimmedData ||
               storedBarcode === JSON.stringify(trimmedData) ||
               storedBarcode === `"${trimmedData}"`;
      });

      if (matchedSpool) {
        router.push(`/scan/spool/${matchedSpool.id}`);
      } else {
        setError(`No spool found for: ${scannedData}`);
        toast.error('No matching spool found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to look up spool');
      toast.error('Failed to look up spool');
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Check for barcode in URL params
  useEffect(() => {
    const barcode = searchParams.get('barcode');
    if (barcode) {
      handleScan(barcode);
    }
  }, [searchParams, handleScan]);

  // Fetch direct access port for addon mode QR/NFC URLs
  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.directAccessPort) {
          setDirectAccessPort(data.directAccessPort);
        }
        if (data.qrBaseUrl) {
          setQrBaseUrl(data.qrBaseUrl);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch all spools for QR code generator
  useEffect(() => {
    const fetchAllSpools = async () => {
      try {
        const res = await fetch('/api/spools');
        if (res.ok) {
          const data = await res.json();
          setAllSpools(data.spools || []);
        }
      } catch (err) {
        console.error('Failed to fetch spools:', err);
      } finally {
        setSpoolsLoading(false);
      }
    };
    fetchAllSpools();
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      handleScan(manualBarcode.trim());
    }
  };

  return (
    <div className="space-y-6">
      {/* QR Scanner */}
      <Card>
        <CardHeader>
          <CardTitle>Сканировать QR-код</CardTitle>
          <CardDescription>
            Наведите камеру на QR-код или штрихкод Spoolman
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QRScanner
            onScan={handleScan}
            onError={(err) => toast.error(err)}
          />
        </CardContent>
      </Card>

      {/* Ручной ввод */}
      <Card>
        <CardHeader>
          <CardTitle>Ручной ввод</CardTitle>
          <CardDescription>
            Введите штрихкод Spoolman или ID катушки вручную
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <Input
              placeholder="Введите ID катушки, штрихкод Spoolman или web+spoolman:s-123"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
            />
            <Button type="submit" disabled={loading || !manualBarcode.trim()}>
              {loading ? 'Looking up...' : 'Найти'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* QR Code Generator */}
      <Card>
        <CardHeader>
          <CardTitle>Печать QR-меток</CardTitle>
          <CardDescription>
            Печатайте QR-метки для любого размера бумаги или этикетки. Выберите несколько катушек и настройте макет.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {spoolsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : allSpools.length > 0 ? (
            <QRCodeGenerator spools={allSpools} directAccessPort={directAccessPort} qrBaseUrl={qrBaseUrl} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Катушки не найдены. Добавьте катушки в Spoolman для создания QR-меток.
            </p>
          )}
        </CardContent>
      </Card>

      {/* NFC Tag Writer */}
      <Card>
        <CardHeader>
          <CardTitle>Запись NFC-метки</CardTitle>
          <CardDescription>
            Запишите ссылку на катушку в NFC-стикер. Прикоснитесь телефоном к метке для быстрого назначения в лоток AMS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {spoolsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : allSpools.length > 0 ? (
            <NFCWriter spools={allSpools} directAccessPort={directAccessPort} qrBaseUrl={qrBaseUrl} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Катушки не найдены. Добавьте катушки в Spoolman для записи NFC-меток.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="w-full max-w-2xl mx-auto py-6 px-3 sm:px-4 md:px-6">
        <h1 className="text-xl sm:text-2xl font-bold mb-6">Сканирование катушки</h1>
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        }>
          <ScanPageContent />
        </Suspense>
      </main>
    </div>
  );
}
