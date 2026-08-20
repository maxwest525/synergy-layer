import {
  BarChart3,
  CheckCheck,
  FileText,
  Gauge,
  LayoutGrid,
  Link2,
  LineChart,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";

import type { CategoryIcon } from "@/lib/categories";
import type { TileIcon } from "@/lib/command-center";

/**
 * The icon boundary.
 *
 * `categories.ts` and `command-center.ts` stay pure by naming icons as strings;
 * this is the one place those names become components, so the node-only test
 * environment never has to import lucide.
 */
const CATEGORY_ICONS: Record<CategoryIcon, LucideIcon> = {
  grid: LayoutGrid,
  search: Search,
  "line-chart": LineChart,
  "file-text": FileText,
  "bar-chart": BarChart3,
  gauge: Gauge,
  plug: Link2,
  settings: Settings,
};

export function categoryIcon(name: CategoryIcon): LucideIcon {
  return CATEGORY_ICONS[name];
}

const TILE_ICONS: Record<TileIcon, LucideIcon> = {
  search: Search,
  "line-chart": LineChart,
  check: CheckCheck,
  "bar-chart": BarChart3,
  "file-text": FileText,
};

export function tileIcon(name: TileIcon): LucideIcon {
  return TILE_ICONS[name];
}
