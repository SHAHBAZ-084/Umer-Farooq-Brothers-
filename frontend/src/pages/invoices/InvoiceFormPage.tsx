import { useNavigate } from 'react-router-dom';
import { INVOICE_TYPE_LABELS } from '../../config/navigation';
import { PageShell, Panel, SecondaryButton } from '../../components/ui/PageShell';
import { KachiMaalInvoicePage } from './KachiMaalInvoicePage';
import { PurchaseMaalInvoicePage } from './PurchaseMaalInvoicePage';
import { PurchaseGeneralInvoicePage } from './PurchaseGeneralInvoicePage';
import { SaleCommissionInvoicePage } from './SaleCommissionInvoicePage';
import { SalePaunchInvoicePage } from './SalePaunchInvoicePage';
import { SaleGeneralInvoicePage } from './SaleGeneralInvoicePage';
import { GeneralTradeInvoicePage } from './GeneralTradeInvoicePage';

const ROUTE_TO_TYPE: Record<string, string> = {
  'sale-commission': 'SALE_COMMISSION',
  'sale-paunch': 'SALE_PAUNCH',
  'sale-general': 'SALE_GENERAL',
  'purchase-maal': 'PURCHASE_MAAL',
  'purchase-general': 'PURCHASE_GENERAL',
  'general-trade': 'GENERAL_TRADE',
  'kachi-maal': 'KACHI_MAAL',
};

export function InvoiceFormPage({ slug }: { slug: string }) {
  const navigate = useNavigate();

  if (slug === 'kachi-maal') {
    return <KachiMaalInvoicePage />;
  }
  if (slug === 'purchase-maal') {
    return <PurchaseMaalInvoicePage />;
  }
  if (slug === 'purchase-general') {
    return <PurchaseGeneralInvoicePage />;
  }
  if (slug === 'sale-paunch') {
    return <SalePaunchInvoicePage />;
  }
  if (slug === 'sale-general') {
    return <SaleGeneralInvoicePage />;
  }
  if (slug === 'general-trade') {
    return <GeneralTradeInvoicePage />;
  }
  if (slug === 'sale-commission') {
    return <SaleCommissionInvoicePage />;
  }

  const typeKey = ROUTE_TO_TYPE[slug];
  const title = INVOICE_TYPE_LABELS[typeKey] ?? 'Invoice';

  return (
    <PageShell centerTitle invoiceTitleBand title={title}>
      <Panel>
        <p className="text-sm leading-6 text-textSecondary">
          This is the dedicated form for <strong>{title}</strong>.
        </p>
        <div className="mt-6 flex gap-3 border-t border-border pt-5">
          <SecondaryButton type="button" className="px-6 py-2.5" onClick={() => navigate('/')}>
            Close
          </SecondaryButton>
        </div>
      </Panel>
    </PageShell>
  );
}
