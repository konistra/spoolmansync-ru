'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Nav } from '@/components/nav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AddPrinterDialog } from '@/components/add-printer-dialog';
import type { AlertConfig, ActiveAlert, AvailableGroup } from '@/lib/alerts';

interface FilterField {
  key: string;
  name: string;
  values: string[];
  builtIn: boolean;
}

interface AdminCredentials {
  username: string;
  password: string;
}

interface Settings {
  embeddedMode: boolean;
  addonMode?: boolean;
  homeassistant: {
    url: string;
    connected: boolean;
    adminCredentials?: AdminCredentials;
    error?: string;
  } | null;
  spoolman: { url: string; connected: boolean } | null;
}

interface ConfigEntry {
  entry_id: string;
  domain: string;
  title: string;
  state: string;
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [haUrl, setHaUrl] = useState('');
  const [spoolmanUrl, setSpoolmanUrl] = useState('');
  const [saving, setSaving] = useState<'ha' | 'spoolman' | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Printer states
  const [printers, setPrinters] = useState<ConfigEntry[]>([]);
  const [hiddenPrinters, setHiddenPrinters] = useState<ConfigEntry[]>([]);
  const [addPrinterOpen, setAddPrinterOpen] = useState(false);
  const [removingPrinter, setRemovingPrinter] = useState<string | null>(null);
  const [readdingPrinter, setReaddingPrinter] = useState<string | null>(null);

  // Admin credentials state (embedded mode)
  const [showPassword, setShowPassword] = useState(false);

  // Reconnect form state (embedded mode, broken connection)
  const [reconnectUsername, setReconnectUsername] = useState('admin');
  const [reconnectPassword, setReconnectPassword] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState('');

  // Filter configuration states
  const [filterFields, setFilterFields] = useState<FilterField[]>([]);
  const [enabledFilters, setEnabledFilters] = useState<string[]>([]);
  const [savingFilters, setSavingFilters] = useState(false);

  // Dashboard display settings
  const [showSpoolLocation, setShowSpoolLocation] = useState(false);

  // QR base URL state
  const [qrBaseUrl, setQrBaseUrl] = useState('');
  const [savingQrUrl, setSavingQrUrl] = useState(false);

  // Alert configuration states
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    enabled: false,
    thresholdType: 'percentage',
    thresholdValue: 10,
    groupingStrategy: 'material',
  });
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [availableGroups, setAvailableGroups] = useState<AvailableGroup[]>([]);
  const [savingAlerts, setSavingAlerts] = useState(false);

  useEffect(() => {
    fetchSettings();

    // Handle OAuth callback messages
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success === 'ha_connected') {
      toast.success('Home Assistant подключён успешно');
      window.history.replaceState({}, '', '/settings');
    } else if (error) {
      const errorMessages: Record<string, string> = {
        missing_params: 'Отсутствуют параметры OAuth',
        invalid_state: 'Недействительное состояние OAuth — попробуйте снова',
        token_exchange_failed: 'Не удалось обменять код авторизации',
        oauth_failed: 'Ошибка аутентификации OAuth',
      };
      toast.error(errorMessages[error] || 'Ошибка аутентификации');
      window.history.replaceState({}, '', '/settings');
    }
  }, [searchParams]);

  // Fetch printers when HA is connected
  useEffect(() => {
    if (settings?.homeassistant?.connected) {
      fetchPrinters();
      const interval = setInterval(fetchPrinters, 10000);
      return () => clearInterval(interval);
    }
  }, [settings?.homeassistant?.connected]);

  // Fetch filter fields and alert config when Spoolman is connected
  useEffect(() => {
    if (settings?.spoolman) {
      fetchFilterFields();
      fetchAlertConfig();
    }
  }, [settings?.spoolman]);

  // Auto-refresh settings when in embedded mode and waiting for HA
  useEffect(() => {
    if (settings?.embeddedMode && !settings?.homeassistant && !loading) {
      const interval = setInterval(() => {
        fetchSettings();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [settings?.embeddedMode, settings?.homeassistant, loading]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);

      if (data.homeassistant) {
        setHaUrl(data.homeassistant.url);
      }
      if (data.spoolman) {
        setSpoolmanUrl(data.spoolman.url);
      }
      if (data.qrBaseUrl !== undefined) {
        setQrBaseUrl(data.qrBaseUrl);
      }
      if (data.showSpoolLocation !== undefined) {
        setShowSpoolLocation(data.showSpoolLocation);
      }
    } catch {
      toast.error('Не удалось загрузить настройки');
    } finally {
      setLoading(false);
    }
  };

  const fetchPrinters = async () => {
    try {
      const res = await fetch('/api/printers/setup');
      if (res.ok) {
        const data = await res.json();
        setPrinters(data.entries || []);
        setHiddenPrinters(data.hiddenEntries || []);
      }
    } catch {
      // Silently fail - HA might not be connected yet
    }
  };

  const removePrinter = async (entryId: string) => {
    setRemovingPrinter(entryId);
    try {
      const res = await fetch('/api/printers/setup', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId }),
      });

      if (!res.ok) {
        throw new Error('Failed to remove printer');
      }

      toast.success('Принтер удалён');
      fetchPrinters();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить принтер');
    } finally {
      setRemovingPrinter(null);
    }
  };

  const readdPrinter = async (entryId: string) => {
    setReaddingPrinter(entryId);
    try {
      const res = await fetch('/api/printers/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unhide', entryId }),
      });

      if (!res.ok) {
        throw new Error('Failed to re-add printer');
      }

      toast.success('Принтер возвращён в SpoolmanSync');
      fetchPrinters();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось вернуть принтер');
    } finally {
      setReaddingPrinter(null);
    }
  };

  const connectHomeAssistant = async () => {
    if (!haUrl) {
      toast.error('Пожалуйста, введите URL Home Assistant');
      return;
    }

    setConnecting(true);
    try {
      const res = await fetch(`/api/auth/ha?ha_url=${encodeURIComponent(haUrl)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Не удалось начать аутентификацию');
      }

      window.location.href = data.authUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось подключиться к Home Assistant');
      setConnecting(false);
    }
  };

  const disconnectHomeAssistant = async () => {
    setSaving('ha');
    try {
      const res = await fetch('/api/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'homeassistant' }),
      });

      if (!res.ok) {
        throw new Error('Failed to disconnect');
      }

      toast.success('Home Assistant отключён');
      setSettings(prev => prev ? { ...prev, homeassistant: null } : null);
      setHaUrl('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось отключить');
    } finally {
      setSaving(null);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} скопировано`);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const reconnectHomeAssistant = async () => {
    if (!reconnectPassword) {
      toast.error('Пожалуйста, введите пароль Home Assistant');
      return;
    }

    setReconnecting(true);
    setReconnectError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reconnect_ha',
          username: reconnectUsername,
          password: reconnectPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Не удалось переподключиться');
      }

      toast.success('Переподключение к Home Assistant выполнено');
      setReconnectPassword('');
      setReconnectError('');
      fetchSettings();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось переподключиться';
      setReconnectError(message);
      toast.error(message);
    } finally {
      setReconnecting(false);
    }
  };

  const saveSpoolmanSettings = async () => {
    setSaving('spoolman');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'spoolman',
          url: spoolmanUrl,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Не удалось сохранить');
      }

      toast.success('Spoolman подключён успешно');
      fetchSettings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось подключиться к Spoolman');
    } finally {
      setSaving(null);
    }
  };

  const fetchFilterFields = async () => {
    try {
      const res = await fetch('/api/spools/extra-fields');
      if (res.ok) {
        const data = await res.json();
        setFilterFields(data.fields || []);
        setEnabledFilters(data.filterConfig || []);
      }
    } catch {
      // Silently fail - Spoolman might not be connected yet
    }
  };

  const saveFilterConfig = async (newConfig: string[]) => {
    setSavingFilters(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'filter_config',
          config: newConfig,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save filter configuration');
      }

      setEnabledFilters(newConfig);
      toast.success('Настройки фильтров сохранены');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить настройки фильтров');
    } finally {
      setSavingFilters(false);
    }
  };

  const toggleFilter = (fieldKey: string) => {
    const newConfig = enabledFilters.includes(fieldKey)
      ? enabledFilters.filter((k) => k !== fieldKey)
      : [...enabledFilters, fieldKey];
    saveFilterConfig(newConfig);
  };

  const fetchAlertConfig = async () => {
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) {
        const data = await res.json();
        if (data.config) setAlertConfig(data.config);
        if (data.alerts) setActiveAlerts(data.alerts);
        if (data.availableGroups) setAvailableGroups(data.availableGroups);
      }
    } catch {
      // Silently fail
    }
  };

  const fetchAvailableGroups = async (strategy: string) => {
    try {
      const res = await fetch(`/api/alerts?strategy=${encodeURIComponent(strategy)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.availableGroups) setAvailableGroups(data.availableGroups);
      }
    } catch {
      // Silently fail
    }
  };

  const saveAlertSettings = async () => {
    setSavingAlerts(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertConfig),
      });

      if (!res.ok) {
        throw new Error('Failed to save alert settings');
      }

      const data = await res.json();
      if (data.alerts) setActiveAlerts(data.alerts);
      toast.success('Настройки уведомлений сохранены');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить настройки уведомлений');
    } finally {
      setSavingAlerts(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <main className="w-full max-w-2xl mx-auto py-6 px-3 sm:px-4 md:px-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="w-full max-w-2xl mx-auto py-6 px-3 sm:px-4 md:px-6">
        <h1 className="text-xl sm:text-2xl font-bold mb-6">Настройки</h1>

        <div className="space-y-6">
          {/* Home Assistant Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${
                  settings?.homeassistant?.connected ? 'bg-green-500'
                    : settings?.homeassistant?.error ? 'bg-orange-500'
                    : 'bg-gray-300'
                }`} />
                <CardTitle>Home Assistant</CardTitle>
                {settings?.embeddedMode && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                    Встроенный
                  </span>
                )}
                {settings?.addonMode && (
                  <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                    Дополнение
                  </span>
                )}
              </div>
              <CardDescription>
                {settings?.addonMode
                  ? 'Подключено автоматически через Supervisor Home Assistant.'
                  : settings?.embeddedMode
                    ? 'Home Assistant встроен в SpoolmanSync и настроен автоматически.'
                    : 'Подключитесь к вашему экземпляру Home Assistant для обнаружения принтеров Bambu Lab.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings?.addonMode ? (
                <div className="space-y-4">
                  {settings?.homeassistant ? (
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium text-green-600 dark:text-green-400">Подключено через Supervisor</p>
                        <p className="text-sm text-muted-foreground">
                          SpoolmanSync работает как дополнение Home Assistant с автоматическим доступом к API.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <p className="font-medium text-yellow-700 dark:text-yellow-400">Подключение к Home Assistant...</p>
                      <p className="text-sm text-yellow-600 dark:text-yellow-500 mt-1">
                        Устанавливается соединение с Supervisor.
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Интеграция Bambu Lab должна быть установлена через HACS в вашем Home Assistant.
                    Добавьте принтеры в разделе Bambu Lab ниже.
                  </p>
                </div>
              ) : settings?.embeddedMode ? (
                <div className="space-y-4">
                  {settings?.homeassistant?.connected ? (
                    <>
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="font-medium text-green-600 dark:text-green-400">Подключено</p>
                          <p className="text-sm text-muted-foreground">{settings.homeassistant.url}</p>
                        </div>
                      </div>

                      {settings.homeassistant.adminCredentials && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-3">
                          <div>
                            <p className="font-medium text-blue-700 dark:text-blue-300">Вход в Home Assistant</p>
                            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                              Используйте эти учётные данные для прямого доступа к Home Assistant по адресу{' '}
                              <a
                                href="http://localhost:8123"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:no-underline"
                              >
                                localhost:8123
                              </a>
                            </p>
                          </div>

                          <div className="grid gap-2">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                              <span className="text-sm text-muted-foreground">Имя пользователя:</span>
                              <div className="flex items-center gap-2">
                                <code className="px-2 py-1 bg-background rounded text-sm truncate max-w-[150px] sm:max-w-none">
                                  {settings.homeassistant.adminCredentials.username}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 shrink-0"
                                  onClick={() => copyToClipboard(settings.homeassistant!.adminCredentials!.username, 'Имя пользователя')}
                                >
                                  Копировать
                                </Button>
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                              <span className="text-sm text-muted-foreground">Пароль:</span>
                              <div className="flex items-center gap-2">
                                <code className="px-2 py-1 bg-background rounded text-sm font-mono truncate max-w-[150px] sm:max-w-none">
                                  {showPassword
                                    ? settings.homeassistant.adminCredentials.password
                                    : '••••••••••••'}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 shrink-0"
                                  onClick={() => setShowPassword(!showPassword)}
                                >
                                  {showPassword ? 'Скрыть' : 'Показать'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 shrink-0"
                                  onClick={() => copyToClipboard(settings.homeassistant!.adminCredentials!.password, 'Пароль')}
                                >
                                  Копировать
                                </Button>
                              </div>
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground pt-2 border-t border-blue-200 dark:border-blue-800">
                            Если вы измените пароль в Home Assistant, вы можете переподключиться здесь, используя новый пароль.
                          </p>
                        </div>
                      )}
                    </>
                  ) : settings?.homeassistant?.error ? (
                    <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg space-y-3">
                      <div>
                        <p className="font-medium text-orange-700 dark:text-orange-400">Соединение потеряно</p>
                        <p className="text-sm text-orange-600 dark:text-orange-500 mt-1">
                          Токен подключения к Home Assistant больше не действителен.
                          Обычно это происходит после смены пароля HA.
                          Введите текущие учётные данные Home Assistant для переподключения.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label htmlFor="reconnect-username">Имя пользователя</Label>
                          <Input
                            id="reconnect-username"
                            value={reconnectUsername}
                            onChange={(e) => setReconnectUsername(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="reconnect-password">Пароль</Label>
                          <Input
                            id="reconnect-password"
                            type="password"
                            value={reconnectPassword}
                            onChange={(e) => setReconnectPassword(e.target.value)}
                            placeholder="Введите пароль HA"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') reconnectHomeAssistant();
                            }}
                          />
                        </div>
                        {reconnectError && (
                          <p className="text-sm text-red-600 dark:text-red-400">{reconnectError}</p>
                        )}
                        <Button
                          onClick={reconnectHomeAssistant}
                          disabled={reconnecting || !reconnectPassword}
                        >
                          {reconnecting ? 'Переподключение...' : 'Переподключиться'}
                        </Button>
                      </div>
                    </div>
                  ) : !settings?.homeassistant ? (
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <p className="font-medium text-yellow-700 dark:text-yellow-400">Подключение к Home Assistant...</p>
                      <p className="text-sm text-yellow-600 dark:text-yellow-500 mt-1">
                        Home Assistant запускается и настраивается автоматически.
                        При первом запуске это может занять до минуты.
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600" />
                        <Button variant="outline" size="sm" onClick={fetchSettings}>
                          Обновить статус
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Встроенный Home Assistant предварительно настроен с HACS и интеграцией Bambu Lab.
                    Добавьте принтеры в разделе Bambu Lab ниже.
                  </p>
                </div>
              ) : settings?.homeassistant ? (
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Подключено</p>
                    <p className="text-sm text-muted-foreground">{settings.homeassistant.url}</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={disconnectHomeAssistant}
                    disabled={saving === 'ha'}
                  >
                    {saving === 'ha' ? 'Отключение...' : 'Отключить'}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="ha-url">URL Home Assistant</Label>
                    <Input
                      id="ha-url"
                      placeholder="http://homeassistant.local:8123"
                      value={haUrl}
                      onChange={(e) => setHaUrl(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Введите URL вашего Home Assistant, затем нажмите «Подключиться» для авторизации.
                    </p>
                  </div>
                  <Button
                    onClick={connectHomeAssistant}
                    disabled={connecting || !haUrl}
                  >
                    {connecting ? 'Перенаправление...' : 'Подключиться к Home Assistant'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Bambu Lab Printers */}
          {settings?.homeassistant?.connected && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Принтеры Bambu Lab</CardTitle>
                    <CardDescription>
                      Настройте ваши принтеры Bambu Lab для синхронизации с Spoolman.
                    </CardDescription>
                  </div>
                  <Button onClick={() => setAddPrinterOpen(true)}>
                    Добавить принтер
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {printers.length === 0 && hiddenPrinters.length === 0 && (
                    <div className="text-center py-6 text-muted-foreground">
                      <p>Принтеры ещё не настроены.</p>
                      <p className="text-sm mt-1">Нажмите «Добавить принтер», чтобы подключить принтер Bambu Lab.</p>
                    </div>
                  )}
                  {printers.map((printer) => (
                    <div
                      key={printer.entry_id}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{printer.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {printer.state === 'loaded' ? (
                            <span className="text-green-600 dark:text-green-400">Подключено</span>
                          ) : (
                            <span className="text-yellow-600 dark:text-yellow-400">{printer.state}</span>
                          )}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removePrinter(printer.entry_id)}
                        disabled={removingPrinter === printer.entry_id}
                      >
                        {removingPrinter === printer.entry_id ? 'Удаление...' : 'Удалить'}
                      </Button>
                    </div>
                  ))}
                  {hiddenPrinters.length > 0 && (
                    <div className={printers.length > 0 ? 'pt-2 border-t' : ''}>
                      <p className="text-xs text-muted-foreground mb-2">
                        Удалены из SpoolmanSync (остались в Home Assistant):
                      </p>
                      {hiddenPrinters.map((printer) => (
                        <div
                          key={printer.entry_id}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed"
                        >
                          <div>
                            <p className="font-medium text-muted-foreground">{printer.title}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => readdPrinter(printer.entry_id)}
                            disabled={readdingPrinter === printer.entry_id}
                          >
                            {readdingPrinter === printer.entry_id ? 'Добавление...' : 'Вернуть'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {settings?.homeassistant?.connected && <Separator />}

          {/* Spoolman Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${settings?.spoolman ? 'bg-green-500' : 'bg-gray-300'}`} />
                <CardTitle>Spoolman</CardTitle>
              </div>
              <CardDescription>
                Подключитесь к вашему экземпляру Spoolman для управления катушками filament.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="spoolman-url">URL Spoolman</Label>
                <Input
                  id="spoolman-url"
                  placeholder="http://localhost:7912"
                  value={spoolmanUrl}
                  onChange={(e) => setSpoolmanUrl(e.target.value)}
                />
              </div>
              <Button
                onClick={saveSpoolmanSettings}
                disabled={saving === 'spoolman' || !spoolmanUrl}
              >
                {saving === 'spoolman' ? 'Подключение...' : settings?.spoolman ? 'Обновить подключение' : 'Подключиться'}
              </Button>
            </CardContent>
          </Card>

          {/* Dashboard Display Settings */}
          {settings?.spoolman && (
            <>
              <Separator />
              <Card>
                <CardHeader>
                  <CardTitle>Отображение панели</CardTitle>
                  <CardDescription>
                    Настройте, какая информация отображается на карточках катушек на панели управления.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="show-spool-location"
                      checked={showSpoolLocation}
                      onCheckedChange={async (checked) => {
                        const enabled = checked === true;
                        setShowSpoolLocation(enabled);
                        try {
                          const res = await fetch('/api/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type: 'show_spool_location', enabled }),
                          });
                          if (!res.ok) throw new Error();
                          toast.success(enabled ? 'Отображение расположения катушки включено' : 'Отображение расположения катушки выключено');
                        } catch {
                          setShowSpoolLocation(!enabled);
                          toast.error('Не удалось сохранить настройку');
                        }
                      }}
                    />
                    <div>
                      <Label htmlFor="show-spool-location" className="text-sm font-medium cursor-pointer">
                        Показывать расположение катушки
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Отображать поле расположения Spoolman на каждой карточке катушки (например, полка, сухой бокс, номер ячейки)
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Spool Filter Configuration */}
          {settings?.spoolman && (
            <>
              <Separator />
              <Card>
                <CardHeader>
                  <CardTitle>Конфигурация фильтрации катушек</CardTitle>
                  <CardDescription>
                    Выберите, какие поля будут отображаться в раскрывающихся списках фильтров при назначении катушек на лотки.
                    Поле поиска всегда ищет по всем полям независимо от этой настройки.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {filterFields.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Загрузка параметров фильтрации...
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {/* Built-in fields */}
                      <div>
                        <h4 className="text-sm font-medium mb-2 text-muted-foreground">Встроенные поля</h4>
                        <div className="space-y-3">
                          {filterFields.filter(f => f.builtIn).map((field) => (
                            <div key={field.key} className="flex items-center space-x-3">
                              <Checkbox
                                id={`filter-${field.key}`}
                                checked={enabledFilters.includes(field.key)}
                                onCheckedChange={() => toggleFilter(field.key)}
                                disabled={savingFilters}
                              />
                              <div className="flex-1">
                                <Label
                                  htmlFor={`filter-${field.key}`}
                                  className="text-sm font-medium cursor-pointer"
                                >
                                  {field.name}
                                </Label>
                                {field.values.length > 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    {field.values.length} значение{field.values.length !== 1 ? 'я' : ''}: {field.values.slice(0, 3).join(', ')}{field.values.length > 3 ? '...' : ''}
                                  </p>
                                ) : (
                                  <p className="text-xs text-muted-foreground italic">
                                    На катушках не задано значений
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Extra fields (if any) */}
                      {filterFields.some(f => !f.builtIn) && (
                        <div>
                          <h4 className="text-sm font-medium mb-2 text-muted-foreground">Пользовательские поля</h4>
                          <div className="space-y-3">
                            {filterFields.filter(f => !f.builtIn).map((field) => (
                              <div key={field.key} className="flex items-center space-x-3">
                                <Checkbox
                                  id={`filter-${field.key}`}
                                  checked={enabledFilters.includes(field.key)}
                                  onCheckedChange={() => toggleFilter(field.key)}
                                  disabled={savingFilters}
                                />
                                <div className="flex-1">
                                  <Label
                                    htmlFor={`filter-${field.key}`}
                                    className="text-sm font-medium cursor-pointer"
                                  >
                                    {field.name}
                                  </Label>
                                  {field.values.length > 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                      {field.values.length} значение{field.values.length !== 1 ? 'я' : ''}: {field.values.slice(0, 3).join(', ')}{field.values.length > 3 ? '...' : ''}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground italic">
                                      На катушках не задано значений
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {enabledFilters.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Фильтры не включены. Будет отображаться только поле поиска.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Low Filament Alerts */}
          {settings?.spoolman && (
            <>
              <Separator />
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>Уведомления о низком запасе filament</CardTitle>
                    {activeAlerts.length > 0 && (
                      <Badge variant="destructive">{activeAlerts.length}</Badge>
                    )}
                  </div>
                  <CardDescription>
                    Получайте уведомления, когда у вас остаётся последняя катушка определённого типа filament и её запас на исходе.
                    Уведомления проверяются после каждой печати и отправляются как постоянные уведомления Home Assistant.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="alerts-enabled"
                      checked={alertConfig.enabled}
                      onCheckedChange={(checked) =>
                        setAlertConfig(prev => ({ ...prev, enabled: Boolean(checked) }))
                      }
                    />
                    <Label htmlFor="alerts-enabled" className="cursor-pointer">
                      Включить уведомления о низком запасе filament
                    </Label>
                  </div>

                  {alertConfig.enabled && (
                    <div className="space-y-4 pl-6">
                      {/* Threshold type */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Тип порога</Label>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="threshold-percentage"
                              name="thresholdType"
                              value="percentage"
                              checked={alertConfig.thresholdType === 'percentage'}
                              onChange={() => setAlertConfig(prev => ({ ...prev, thresholdType: 'percentage' }))}
                              className="h-4 w-4"
                            />
                            <Label htmlFor="threshold-percentage" className="cursor-pointer text-sm">
                              Процент остатка
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="threshold-grams"
                              name="thresholdType"
                              value="grams"
                              checked={alertConfig.thresholdType === 'grams'}
                              onChange={() => setAlertConfig(prev => ({ ...prev, thresholdType: 'grams' }))}
                              className="h-4 w-4"
                            />
                            <Label htmlFor="threshold-grams" className="cursor-pointer text-sm">
                              Абсолютный вес (граммы)
                            </Label>
                          </div>
                        </div>
                      </div>

                      {/* Threshold value */}
                      <div className="space-y-2">
                        <Label htmlFor="threshold-value" className="text-sm font-medium">
                          Уведомлять, когда ниже {alertConfig.thresholdType === 'percentage' ? '(%)' : '(граммов)'}
                        </Label>
                        <Input
                          id="threshold-value"
                          type="number"
                          min="0"
                          max={alertConfig.thresholdType === 'percentage' ? 100 : undefined}
                          value={alertConfig.thresholdValue}
                          onChange={(e) =>
                            setAlertConfig(prev => ({ ...prev, thresholdValue: Number(e.target.value) }))
                          }
                          className="w-32"
                        />
                      </div>

                      {/* Grouping strategy */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Группировать катушки по</Label>
                        <div className="space-y-2">
                          <div className="flex items-start space-x-2">
                            <input
                              type="radio"
                              id="group-material"
                              name="groupingStrategy"
                              value="material"
                              checked={alertConfig.groupingStrategy === 'material'}
                              onChange={() => {
                                setAlertConfig(prev => ({ ...prev, groupingStrategy: 'material', monitoredGroups: undefined }));
                                fetchAvailableGroups('material');
                              }}
                              className="h-4 w-4 mt-0.5"
                            />
                            <div>
                              <Label htmlFor="group-material" className="cursor-pointer text-sm">
                                Материал
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Уведомлять, когда все катушки PLA или PETG на исходе и т.д.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-2">
                            <input
                              type="radio"
                              id="group-material-name"
                              name="groupingStrategy"
                              value="material_name"
                              checked={alertConfig.groupingStrategy === 'material_name'}
                              onChange={() => {
                                setAlertConfig(prev => ({ ...prev, groupingStrategy: 'material_name', monitoredGroups: undefined }));
                                fetchAvailableGroups('material_name');
                              }}
                              className="h-4 w-4 mt-0.5"
                            />
                            <div>
                              <Label htmlFor="group-material-name" className="cursor-pointer text-sm">
                                Материал + Название
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Уведомлять по каждому продукту filament (например, все катушки HF Black PETG, все матовые белые PLA).
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-2">
                            <input
                              type="radio"
                              id="group-material-vendor-name"
                              name="groupingStrategy"
                              value="material_name_vendor"
                              checked={alertConfig.groupingStrategy === 'material_name_vendor'}
                              onChange={() => {
                                setAlertConfig(prev => ({ ...prev, groupingStrategy: 'material_name_vendor', monitoredGroups: undefined }));
                                fetchAvailableGroups('material_name_vendor');
                              }}
                              className="h-4 w-4 mt-0.5"
                            />
                            <div>
                              <Label htmlFor="group-material-vendor-name" className="cursor-pointer text-sm">
                                Материал + Название + Производитель
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Как «Материал + Название», но с разделением по производителям (например, Bambu Lab HF Black PETG против Polymaker PolyLite Black PETG).
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Monitored groups */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Отслеживать</Label>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="monitor-all"
                              name="monitorMode"
                              checked={alertConfig.monitoredGroups === undefined}
                              onChange={() => setAlertConfig(prev => ({ ...prev, monitoredGroups: undefined }))}
                              className="h-4 w-4"
                            />
                            <Label htmlFor="monitor-all" className="cursor-pointer text-sm">
                              Все группы
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="monitor-selected"
                              name="monitorMode"
                              checked={alertConfig.monitoredGroups !== undefined}
                              onChange={() => setAlertConfig(prev => ({ ...prev, monitoredGroups: [] }))}
                              className="h-4 w-4"
                            />
                            <Label htmlFor="monitor-selected" className="cursor-pointer text-sm">
                              Только выбранные группы
                            </Label>
                          </div>
                        </div>

                        {alertConfig.monitoredGroups !== undefined && (
                          <div className="ml-6 space-y-2 pt-1">
                            {availableGroups.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">Группы катушек не найдены.</p>
                            ) : (
                              availableGroups.map((group) => (
                                <div key={group.groupKey} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`group-${group.groupKey}`}
                                    checked={alertConfig.monitoredGroups?.includes(group.groupKey) ?? false}
                                    onCheckedChange={(checked) => {
                                      setAlertConfig(prev => {
                                        const current = prev.monitoredGroups || [];
                                        const updated = checked
                                          ? [...current, group.groupKey]
                                          : current.filter(k => k !== group.groupKey);
                                        return { ...prev, monitoredGroups: updated };
                                      });
                                    }}
                                  />
                                  <div className="flex items-center gap-2">
                                    {(alertConfig.groupingStrategy === 'material_name' || alertConfig.groupingStrategy === 'material_name_vendor') && group.color_hex && (
                                      <span
                                        className="inline-block w-3 h-3 rounded-full border border-border shrink-0"
                                        style={{ backgroundColor: `#${group.color_hex.replace('#', '')}` }}
                                      />
                                    )}
                                    <Label
                                      htmlFor={`group-${group.groupKey}`}
                                      className="cursor-pointer text-sm"
                                    >
                                      {group.groupLabel}
                                    </Label>
                                    <span className="text-xs text-muted-foreground">
                                      ({group.spoolCount} катушка{group.spoolCount !== 1 ? 'и' : ''})
                                    </span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      <Button
                        onClick={saveAlertSettings}
                        disabled={savingAlerts}
                      >
                        {savingAlerts ? 'Сохранение...' : 'Сохранить настройки уведомлений'}
                      </Button>
                    </div>
                  )}

                  {!alertConfig.enabled && (
                    <Button
                      onClick={saveAlertSettings}
                      disabled={savingAlerts}
                      variant="outline"
                      size="sm"
                    >
                      {savingAlerts ? 'Сохранение...' : 'Сохранить'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* QR Code Base URL */}
          <Card>
            <CardHeader>
              <CardTitle>URL QR-кода / NFC</CardTitle>
              <CardDescription>
                Переопределите базовый URL, используемый в сгенерированных QR-кодах и NFC-метках.
                Оставьте пустым, чтобы автоматически использовать текущий URL браузера.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="qrBaseUrl">Базовый URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="qrBaseUrl"
                    value={qrBaseUrl}
                    onChange={(e) => setQrBaseUrl(e.target.value)}
                    placeholder="например, http://192.168.1.100:3000"
                  />
                  <Button
                    onClick={async () => {
                      setSavingQrUrl(true);
                      try {
                        const res = await fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ type: 'qr_base_url', url: qrBaseUrl }),
                        });
                        if (!res.ok) throw new Error();
                        toast.success(qrBaseUrl.trim() ? 'Базовый URL QR-кода сохранён' : 'Базовый URL QR-кода очищен');
                      } catch {
                        toast.error('Не удалось сохранить базовый URL QR-кода');
                      } finally {
                        setSavingQrUrl(false);
                      }
                    }}
                    disabled={savingQrUrl}
                  >
                    {savingQrUrl ? 'Сохранение...' : 'Сохранить'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Полезно при доступе к SpoolmanSync через обратный прокси или пользовательский домен.
                  QR-коды будут ссылаться на этот URL вместо URL из адресной строки браузера.
                </p>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Add Printer Dialog */}
        <AddPrinterDialog
          open={addPrinterOpen}
          onOpenChange={setAddPrinterOpen}
          onSuccess={fetchPrinters}
        />
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <Nav />
        <main className="w-full max-w-2xl mx-auto py-6 px-3 sm:px-4 md:px-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </main>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
