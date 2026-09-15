import { Link, useLocation } from 'react-router-dom';
import { getPageTitle } from '../../config/navigation';
import { APP_DASHBOARD_PATH, APP_HOME_PATH } from '../../config/routes';
import { ClosePageButton } from './ClosePageButton';

/** Invoice / voucher forms render their own centered PageShell title. */
function hidesContentHeaderTitle(pathname: string) {
  return (
    pathname.startsWith('/invoices/sale-commission')
    || pathname.startsWith('/invoices/sale-paunch')
    || pathname.startsWith('/invoices/sale-general')
    || pathname.startsWith('/invoices/purchase-maal')
    || pathname.startsWith('/invoices/purchase-general')
    || pathname.startsWith('/invoices/general-trade')
    || pathname.startsWith('/invoices/kachi-maal')
    || pathname.startsWith('/vouchers/payment')
    || pathname.startsWith('/vouchers/journal')
    || pathname.startsWith('/vouchers/receipt')
  );
}

export function ContentHeader() {
  const location = useLocation();
  const title = getPageTitle(location.pathname);
  const isBlankHome = location.pathname === APP_HOME_PATH;
  const isDashboard = location.pathname === APP_DASHBOARD_PATH;

  // Blank default home: no header chrome — empty content area only.
  if (isBlankHome) {
    return null;
  }

  if (hidesContentHeaderTitle(location.pathname)) {
    return null;
  }

  return (
    <header className="app-content-header">
      <div className="app-content-header-main">
        {!isDashboard ? (
          <p className="app-breadcrumb">
            <Link to={APP_HOME_PATH} className="app-breadcrumb-link">
              Home
            </Link>
            <span className="app-breadcrumb-sep">/</span>
            <span>{title}</span>
          </p>
        ) : null}
        <h1 className="app-content-title">{title}</h1>
      </div>
      {!isDashboard ? <ClosePageButton /> : null}
    </header>
  );
}
