import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  BookOpen,
  CalendarDays,
  Eye,
  FileText,
  FolderPlus,
  Package,
  PackageMinus,
  PackagePlus,
  Pencil,
  Receipt,
  Scale,
  ScrollText,
  Settings,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Truck,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
  Wheat,
} from 'lucide-react';

type QuickLinkVariant =
  | 'payment'
  | 'receipt'
  | 'journal'
  | 'sale-commission'
  | 'sale-paunch'
  | 'purchase-maal'
  | 'kachi-maal'
  | 'sale-general'
  | 'purchase-general'
  | 'general-trade'
  | 'view'
  | 'report'
  | 'report-ledger'
  | 'report-balance'
  | 'report-vouchers'
  | 'report-trial'
  | 'report-sale'
  | 'report-stock';

const QUICK_LINK_META: Record<string, { variant: QuickLinkVariant; icon: LucideIcon }> = {
  '/vouchers/payment': { variant: 'payment', icon: ArrowUpCircle },
  '/vouchers/receipt': { variant: 'receipt', icon: ArrowDownCircle },
  '/vouchers/journal': { variant: 'journal', icon: BookOpen },
  '/vouchers/view': { variant: 'view', icon: Eye },
  '/invoices/sale-commission': { variant: 'sale-commission', icon: FileText },
  '/invoices/sale-paunch': { variant: 'sale-paunch', icon: Scale },
  '/invoices/purchase-maal': { variant: 'purchase-maal', icon: ShoppingCart },
  '/invoices/kachi-maal': { variant: 'kachi-maal', icon: Wheat },
  '/invoices/sale-general': { variant: 'sale-general', icon: FileText },
  '/invoices/purchase-general': { variant: 'purchase-general', icon: ShoppingCart },
  '/invoices/general-trade': { variant: 'general-trade', icon: TrendingUp },
  '/invoices/view-invoice': { variant: 'view', icon: Eye },
  '/accounts/categories/add': { variant: 'view', icon: FolderPlus },
  '/accounts/categories/edit': { variant: 'view', icon: Pencil },
  '/accounts/categories/remove': { variant: 'view', icon: Trash2 },
  '/accounts/manage/add': { variant: 'view', icon: UserPlus },
  '/accounts/manage/edit': { variant: 'view', icon: Pencil },
  '/accounts/manage/remove': { variant: 'view', icon: UserMinus },
  '/accounts/sale-parties': { variant: 'view', icon: Users },
  '/accounts/purchase-parties': { variant: 'view', icon: Truck },
  '/accounts/products/add': { variant: 'view', icon: PackagePlus },
  '/accounts/products/remove': { variant: 'view', icon: PackageMinus },
  '/reports/accounts': { variant: 'report-ledger', icon: ScrollText },
  '/reports/account-balance': { variant: 'report-balance', icon: Wallet },
  '/reports/vouchers': { variant: 'report-vouchers', icon: Receipt },
  '/reports/daily': { variant: 'report', icon: CalendarDays },
  '/reports/trial-balance': { variant: 'report-trial', icon: BarChart3 },
  '/reports/sale-purchase': { variant: 'report-sale', icon: TrendingUp },
  '/reports/stock': { variant: 'report-stock', icon: Package },
  '/inventory/bardana': { variant: 'report-stock', icon: Package },
  '/system/preferences': { variant: 'view', icon: Settings },
};

export function QuickLinkCard({
  to,
  title,
  description,
}: {
  to: string;
  title: string;
  description: string;
}) {
  const meta = QUICK_LINK_META[to] ?? { variant: 'view' as const, icon: Package };
  const Icon = meta.icon;

  return (
    <Link to={to} className={`quick-link-card quick-link-card--${meta.variant}`}>
      <div className="quick-link-card-inner">
        <span className="quick-link-icon-badge" aria-hidden="true">
          <Icon className="quick-link-icon h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h3 className="quick-link-title">{title}</h3>
          <p className="quick-link-description">{description}</p>
        </div>
      </div>
    </Link>
  );
}

export function defaultCardDescription(to: string): string {
  if (to.startsWith('/vouchers/')) {
    return to === '/vouchers/view' ? 'Browse posted vouchers' : 'Open voucher form';
  }
  if (to.startsWith('/invoices/')) {
    return to === '/invoices/view-invoice'
      ? 'Look up a posted invoice by type and number'
      : 'Open invoice form';
  }
  if (to.startsWith('/reports/') || to.startsWith('/inventory/')) {
    return 'Open report';
  }
  if (to.startsWith('/system/')) {
    return 'Configure application settings';
  }
  return 'Open page';
}
