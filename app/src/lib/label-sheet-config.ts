import type { Spool } from '@/lib/api/spoolman';
import { buildExternalUrl } from '@/lib/ingress-path';

// --- Types ---

export interface PaperSize {
  name: string;
  widthMm: number;
  heightMm: number;
}

export type BorderMode = 'none' | 'border' | 'grid';
export type QRMode = 'none' | 'simple' | 'icon';

export interface SheetSettings {
  paperSize: string;
  customWidthMm: number;
  customHeightMm: number;
  columns: number;
  rows: number;
  skipItems: number;
  itemCopies: number;
  borderMode: BorderMode;
}

export interface ContentSettings {
  qrMode: QRMode;
  showLabel: boolean;
  labelTextSizeMm: number;
  showVendor: boolean;
  showName: boolean;
  showMaterial: boolean;
  showColor: boolean;
  showSpoolId: boolean;
}

export interface LayoutSettings {
  marginLeftMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  safeZoneLeftMm: number;
  safeZoneTopMm: number;
  safeZoneRightMm: number;
  safeZoneBottomMm: number;
  spacingHorizontalMm: number;
  spacingVerticalMm: number;
}

export interface LabelSheetConfig {
  sheet: SheetSettings;
  content: ContentSettings;
  layout: LayoutSettings;
}

export interface LabelItem {
  spool: Spool;
  url: string;
}

// --- Constants ---

export const PAPER_SIZES: Record<string, PaperSize> = {
  letter: { name: 'Letter (8.5" x 11")', widthMm: 215.9, heightMm: 279.4 },
  a4: { name: 'A4 (210 x 297mm)', widthMm: 210, heightMm: 297 },
  '2x1': { name: '2" x 1" Label', widthMm: 50.8, heightMm: 25.4 },
  '2.25x1.25': { name: '2.25" x 1.25" Label', widthMm: 57.15, heightMm: 31.75 },
  '4x6': { name: '4" x 6" (Shipping)', widthMm: 101.6, heightMm: 152.4 },
  '62mm': { name: '62mm Continuous (Brother)', widthMm: 62, heightMm: 100 },
  custom: { name: 'Custom', widthMm: 100, heightMm: 100 },
};

export const DEFAULT_CONFIG: LabelSheetConfig = {
  sheet: {
    paperSize: 'letter',
    customWidthMm: 100,
    customHeightMm: 100,
    columns: 3,
    rows: 10,
    skipItems: 0,
    itemCopies: 1,
    borderMode: 'none',
  },
  content: {
    qrMode: 'icon',
    showLabel: true,
    labelTextSizeMm: 3,
    showVendor: true,
    showName: true,
    showMaterial: true,
    showColor: true,
    showSpoolId: true,
  },
  layout: {
    marginLeftMm: 10,
    marginTopMm: 10,
    marginRightMm: 10,
    marginBottomMm: 10,
    safeZoneLeftMm: 1,
    safeZoneTopMm: 1,
    safeZoneRightMm: 1,
    safeZoneBottomMm: 1,
    spacingHorizontalMm: 0,
    spacingVerticalMm: 0,
  },
};

// --- Functions ---

export function getPaperDimensions(sheet: SheetSettings): { widthMm: number; heightMm: number } {
  if (sheet.paperSize === 'custom') {
    return { widthMm: sheet.customWidthMm, heightMm: sheet.customHeightMm };
  }
  const paper = PAPER_SIZES[sheet.paperSize];
  return paper || { widthMm: 215.9, heightMm: 279.4 };
}

export interface CellSize {
  widthMm: number;
  heightMm: number;
}

export function calculateCellSize(config: LabelSheetConfig): CellSize {
  const paper = getPaperDimensions(config.sheet);
  const { layout, sheet } = config;

  const availableWidth = paper.widthMm - layout.marginLeftMm - layout.marginRightMm;
  const availableHeight = paper.heightMm - layout.marginTopMm - layout.marginBottomMm;

  const totalHGaps = Math.max(0, sheet.columns - 1) * layout.spacingHorizontalMm;
  const totalVGaps = Math.max(0, sheet.rows - 1) * layout.spacingVerticalMm;

  const widthMm = (availableWidth - totalHGaps) / sheet.columns;
  const heightMm = (availableHeight - totalVGaps) / sheet.rows;

  return { widthMm, heightMm };
}

export function buildLabelItems(
  selectedSpools: Spool[],
  config: LabelSheetConfig,
  directAccessPort?: number,
  qrBaseUrl?: string,
): LabelItem[] {
  const items: LabelItem[] = [];

  for (const spool of selectedSpools) {
    const url = buildExternalUrl(`/scan/spool/${spool.id}`, directAccessPort, qrBaseUrl);
    for (let i = 0; i < config.sheet.itemCopies; i++) {
      items.push({ spool, url });
    }
  }

  return items;
}

export interface Page {
  items: (LabelItem | null)[];
}

export function paginateItems(items: LabelItem[], config: LabelSheetConfig): Page[] {
  const perPage = config.sheet.columns * config.sheet.rows;
  const pages: Page[] = [];

  // Build full slot list: skip empty slots first, then items, then pad
  const allSlots: (LabelItem | null)[] = [];

  // Add skip slots
  for (let i = 0; i < config.sheet.skipItems; i++) {
    allSlots.push(null);
  }

  // Add actual items
  for (const item of items) {
    allSlots.push(item);
  }

  // If no items at all (only skips or nothing), return empty
  if (items.length === 0) return [];

  // Paginate
  for (let i = 0; i < allSlots.length; i += perPage) {
    const pageSlots = allSlots.slice(i, i + perPage);
    // Pad to fill the page
    while (pageSlots.length < perPage) {
      pageSlots.push(null);
    }
    pages.push({ items: pageSlots });
  }

  return pages;
}
