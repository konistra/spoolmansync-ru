'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Nav } from '@/components/nav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface PrinterRegistration {
  prefix: string;
  name: string;
  trayIds: string[];
}

interface AutomationData {
  trayCount: number;
  printerCount: number;
  automationsYaml: string;
  configurationYaml: string;
  printerRegistrations: PrinterRegistration[];
}

interface RegisteredAutomation {
  id: string;
  haAutomationId: string;
  trayId: string;
  printerId: string;
  createdAt: string;
}

export default function AutomationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [automationData, setAutomationData] = useState<AutomationData | null>(null);
  const [registeredAutomations, setRegisteredAutomations] = useState<RegisteredAutomation[]>([]);
  const [haConnected, setHaConnected] = useState(false);
  const [embeddedMode, setEmbeddedMode] = useState(false);
  const [addonMode, setAddonMode] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [copiedAutomations, setCopiedAutomations] = useState(false);
  const [printerCount, setPrinterCount] = useState<number | null>(null);
  const [checkingPrinters, setCheckingPrinters] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    fetchRegistered();
    // Initialize webhook URL with a sensible default
    // Replace 0.0.0.0 with localhost as a starting point
    const origin = window.location.origin.replace('0.0.0.0', 'localhost');
    setWebhookUrl(origin);
  }, []);

  // Check for printers when HA is connected in embedded or addon mode
  useEffect(() => {
    if ((embeddedMode || addonMode) && haConnected && printerCount === null) {
      checkForPrinters();
    }
  }, [embeddedMode, addonMode, haConnected, printerCount]);

  const checkForPrinters = async () => {
    setCheckingPrinters(true);
    try {
      const res = await fetch('/api/printers');
      const data = await res.json();
      setPrinterCount(data.printers?.length || 0);
    } catch (err) {
      console.error('Не удалось проверить принтеры:', err);
      setPrinterCount(0);
    } finally {
      setCheckingPrinters(false);
    }
  };

  const fetchRegistered = async () => {
    try {
      const res = await fetch('/api/automations');
      const data = await res.json();
      setRegisteredAutomations(data.automations || []);
      setHaConnected(data.haConnected);
      setEmbeddedMode(data.embeddedMode || false);
      setAddonMode(data.addonMode || false);
      setConfigured(data.configured || false);
    } catch (err) {
      console.error('Не удалось загрузить автоматизации:', err);
    }
  };

  // Auto-configure for embedded mode
  const autoConfigure = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auto-configure',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Не удалось настроить автоматизации');
      }

      setConfigured(true);
      fetchRegistered();

      if (data.needsRestart) {
        setShowRestartModal(true);
      } else {
        toast.success(data.message || `Настроено ${data.trayCount} лотков успешно`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось настроить');
    } finally {
      setLoading(false);
    }
  };

  const restartHA = async () => {
    setRestarting(true);
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart-ha' }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Не удалось перезапустить Home Assistant');
      }

      setShowRestartModal(false);
      toast.success('Home Assistant перезапускается. Это может занять минуту.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось перезапустить');
    } finally {
      setRestarting(false);
    }
  };

  // Generate config for manual mode
  const generateConfig = async () => {
    if (!webhookUrl.trim()) {
      toast.error('Пожалуйста, введите URL SpoolmanSync');
      return;
    }
    setLoading(true);
    try {
      // Append /api/webhook to the base URL
      const baseUrl = webhookUrl.trim().replace(/\/+$/, ''); // Remove trailing slashes
      const fullWebhookUrl = `${baseUrl}/api/webhook`;

      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'discover',
          webhookUrl: fullWebhookUrl,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Не удалось сгенерировать конфигурацию');
      }

      const data = await res.json();
      setAutomationData(data);
      toast.success(`Найдено ${data.trayCount} лотков для отслеживания`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сгенерировать конфигурацию');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'config' | 'automations') => {
    try {
      // Try using the Clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts (like HTTP)
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      if (type === 'config') {
        setCopiedConfig(true);
        setTimeout(() => setCopiedConfig(false), 2000);
      } else {
        setCopiedAutomations(true);
        setTimeout(() => setCopiedAutomations(false), 2000);
      }
      toast.success(`${type === 'config' ? 'Конфигурация' : 'Автоматизации'} скопированы в буфер обмена`);
    } catch (err) {
      toast.error('Не удалось скопировать в буфер обмена');
    }
  };

  const registerAutomations = async () => {
    if (!automationData) return;

    setLoading(true);
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          printerRegistrations: automationData.printerRegistrations,
        }),
      });

      if (!res.ok) throw new Error('Не удалось зарегистрировать автоматизации');

      toast.success('Автоматизации отмечены как настроенные');
      fetchRegistered();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось зарегистрировать');
    } finally {
      setLoading(false);
    }
  };

  // Embedded/Addon mode UI - simplified auto-configure
  if (embeddedMode || addonMode) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <main className="w-full max-w-4xl mx-auto py-6 px-3 sm:px-4 md:px-6">
          <h1 className="text-xl sm:text-2xl font-bold mb-6">Автоматизации</h1>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Автоматизации отслеживания катушек
                  <Badge variant="secondary">{addonMode ? 'Режим дополнения' : 'Встроенный режим'}</Badge>
                </CardTitle>
                <CardDescription>
                  SpoolmanSync автоматически отслеживает использование филамента и синхронизируется с Spoolman при завершении печати или смене лотков.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className={`h-3 w-3 rounded-full ${haConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span>Home Assistant: {haConnected ? 'Подключён' : 'Ожидание подключения...'}</span>
                </div>

                {configured ? (
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="font-medium">Автоматизации настроены</span>
                    </div>
                    <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                      SpoolmanSync активно отслеживает лотки ваших принтеров. При смене филамента или завершении печати
                      использование будет автоматически синхронизировано с Spoolman.
                    </p>
                  </div>
                ) : printerCount === 0 ? (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-2">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="font-medium">Принтер не найден</span>
                    </div>
                    <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">
                      Вам нужно добавить принтер Bambu Lab перед настройкой автоматизаций.
                      Перейдите на страницу Настроек и нажмите «Добавить принтер», чтобы подключить ваш принтер через Bambu Cloud или LAN.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/settings')}
                    >
                      Перейти к настройкам
                    </Button>
                  </div>
                ) : checkingPrinters ? (
                  <div className="p-4 bg-muted rounded-lg flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                    <span className="text-sm text-muted-foreground">Проверка принтеров...</span>
                  </div>
                ) : (
                  <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                      Нажмите кнопку ниже, чтобы автоматически настроить Home Assistant для отслеживания использования филамента вашего принтера.
                      Это выполнит следующие действия:
                    </p>
                    <ul className="list-disc list-inside text-sm text-blue-600 dark:text-blue-400 space-y-1 mb-4">
                      <li>Создаст автоматизации для обнаружения смены лотков</li>
                      <li>Будет отслеживать использование филамента во время печати</li>
                      <li>Синхронизирует данные использования с Spoolman при завершении печати</li>
                    </ul>
                    <Button
                      onClick={autoConfigure}
                      disabled={loading || !haConnected || printerCount === 0}
                      size="lg"
                    >
                      {loading ? 'Настройка...' : 'Настроить автоматизации'}
                    </Button>
                  </div>
                )}

                {configured && (
                  <div className="pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={autoConfigure}
                      disabled={loading}
                    >
                      {loading ? 'Перенастройка...' : 'Перенастроить автоматизации'}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Используйте это, если вы добавили новые принтеры или нужно обновить конфигурацию.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Registered Automations */}
            {registeredAutomations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Настроенное отслеживание</CardTitle>
                  <CardDescription>
                    Эти принтеры и лотки отслеживаются
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {registeredAutomations.map((auto) => (
                      <div
                        key={auto.id}
                        className="flex items-center justify-between p-3 bg-muted rounded"
                      >
                        <div>
                          <div className="font-medium">{auto.printerId}</div>
                          <div className="text-sm text-muted-foreground">
                            {auto.trayId.split(',').length} лотков отслеживается
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(auto.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Restart Required Modal */}
          <Dialog open={showRestartModal} onOpenChange={setShowRestartModal}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Требуется перезапуск Home Assistant</DialogTitle>
                <DialogDescription>
                  Конфигурация автоматизаций успешно записана. Home Assistant необходимо перезапустить для загрузки новой конфигурации (вспомогательные сущности, шаблоны и автоматизации).
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  onClick={restartHA}
                  disabled={restarting}
                  className="flex-1"
                >
                  {restarting ? 'Перезапуск...' : 'Перезапустить сейчас'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowRestartModal(false)}
                  disabled={restarting}
                  className="flex-1"
                >
                  Перезапустить позже
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Если вы решите перезапустить позже, вы можете перезапустить Home Assistant со страницы Настроек, когда будет удобно.
              </p>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    );
  }

  // External/Manual mode UI - shows YAML config
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="w-full max-w-4xl mx-auto py-6 px-3 sm:px-4 md:px-6">
        <h1 className="text-xl sm:text-2xl font-bold mb-6">Настройка автоматизаций</h1>

        <div className="space-y-6">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle>Автоматизации Home Assistant</CardTitle>
              <CardDescription>
                Настройте Home Assistant для автоматической синхронизации изменений лотков с Spoolman
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className={`h-3 w-3 rounded-full ${haConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span>Home Assistant: {haConnected ? 'Подключён' : 'Не настроен'}</span>
              </div>

              {registeredAutomations.length > 0 && (
                <div className="flex items-center gap-4">
                  <Badge variant="secondary">{registeredAutomations.length} автоматизаций зарегистрировано</Badge>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="webhookUrl" className="text-sm font-medium">
                  URL SpoolmanSync
                </label>
                <input
                  id="webhookUrl"
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="http://192.168.1.100:3000"
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  URL, по которому Home Assistant может получить доступ к этому экземпляру SpoolmanSync.
                  {webhookUrl.includes('localhost') && (
                    <span className="text-amber-600 dark:text-amber-400 block mt-1">
                      Примечание: &quot;localhost&quot; работает только если Home Assistant на той же машине.
                      Используйте IP-адрес вашей машины (например, 192.168.x.x), если HA находится в другом месте.
                    </span>
                  )}
                </p>
              </div>

              <Button onClick={generateConfig} disabled={loading || !haConnected || !webhookUrl.trim()}>
                {loading ? 'Генерация...' : 'Сгенерировать конфигурацию'}
              </Button>
            </CardContent>
          </Card>

          {/* Generated Config */}
          {automationData && (
            <>
              {/* Configuration.yaml Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>configuration.yaml</span>
                    <Badge>{automationData.printerCount} принтеров</Badge>
                  </CardTitle>
                  <CardDescription>
                    Добавьте это в файл <code>configuration.yaml</code> вашего Home Assistant
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-xs max-h-96">
                      {automationData.configurationYaml}
                    </pre>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(automationData.configurationYaml, 'config')}
                    >
                      {copiedConfig ? 'Скопировано!' : 'Копировать'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Automations.yaml Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>automations.yaml</span>
                    <Badge>{automationData.trayCount} лотков</Badge>
                  </CardTitle>
                  <CardDescription>
                    Добавьте это в файл <code>automations.yaml</code> вашего Home Assistant
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-xs max-h-96">
                      {automationData.automationsYaml}
                    </pre>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(automationData.automationsYaml, 'automations')}
                    >
                      {copiedAutomations ? 'Скопировано!' : 'Копировать'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Инструкция по настройке */}
              <Card>
                <CardHeader>
                  <CardTitle>Инструкция по настройке</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Скопируйте содержимое <strong>configuration.yaml</strong> выше и добавьте его в файл <code>configuration.yaml</code> вашего Home Assistant</li>
                    <li>Скопируйте содержимое <strong>automations.yaml</strong> выше и добавьте его в файл <code>automations.yaml</code> вашего Home Assistant</li>
                    <li>Перезапустите Home Assistant или перезагрузите автоматизации</li>
                    <li>Нажмите «Отметить как настроенное» ниже</li>
                  </ol>

                  <Button onClick={registerAutomations} disabled={loading}>
                    Отметить как настроенное
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* Registered Automations */}
          {registeredAutomations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Зарегистрированные автоматизации</CardTitle>
                <CardDescription>
                  Эти принтеры и лотки отслеживаются
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {registeredAutomations.map((auto) => (
                    <div
                      key={auto.id}
                      className="flex items-center justify-between p-3 bg-muted rounded"
                    >
                      <div>
                        <div className="font-medium">{auto.printerId}</div>
                        <div className="text-sm text-muted-foreground">
                          {auto.trayId.split(',').length} лотков отслеживается
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(auto.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}