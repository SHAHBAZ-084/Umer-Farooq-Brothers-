import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { APP_BRAND_NAME } from './config/brand';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ReportFinancialYearProvider } from './contexts/ReportFinancialYearContext';
import { AccountManagePage } from './pages/accounts/AccountManagePage';
import { CategoryManagePage } from './pages/accounts/CategoryManagePage';
import { PurchasePartiesPage, SalePartiesPage } from './pages/accounts/PartiesPage';
import { ProductAddPage, ProductRemovePage } from './pages/accounts/ProductManagePage';
import { BardanaPage } from './pages/inventory/BardanaPage';
import { InvoiceFormPage } from './pages/invoices/InvoiceFormPage';
import { ViewInvoicePage } from './pages/invoices/ViewInvoicePage';
import { LoginPage } from './pages/LoginPage';
import { BackupPage } from './pages/BackupPage';
import { PosHomePage } from './pages/PosHomePage';
import { DailyReportPage } from './pages/reports/DailyReportPage';
import {
  AccountReportsPage,
  AccountBalancePage,
  SalePurchaseReportsPage,
  StockReportPage,
  TrialBalancePage,
  VouchersReportPage,
} from './pages/reports/ReportPages';
import { FinancialYearPage } from './pages/system/FinancialYearPage';
import { SystemPreferencesPage } from './pages/system/SystemPreferencesPage';
import { UserInfoPage } from './pages/user/UserInfoPage';
import { AccountAdjustmentPage } from './pages/adjustments/AccountAdjustmentPage';
import { StockAdjustmentPage } from './pages/adjustments/StockAdjustmentPage';
import { PendingApprovalsPage } from './pages/approvals/PendingApprovalsPage';
import { UserManagementPage } from './pages/user/UserManagementPage';
import { SchedulesPage } from './pages/vouchers/SchedulesPage';
import { VoucherFormPage, VoucherListPage } from './pages/vouchers/VoucherPages';

function ReportsLayout() {
  return (
    <ReportFinancialYearProvider>
      <Outlet />
    </ReportFinancialYearProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary title={`${APP_BRAND_NAME} encountered an error`}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<PosHomePage />} />

                  <Route path="/vouchers" element={<Navigate to="/vouchers/payment" replace />} />
                  <Route path="/invoices" element={<Navigate to="/invoices/sale-commission" replace />} />
                  <Route path="/accounts" element={<Navigate to="/accounts/manage/add" replace />} />
                  <Route path="/products" element={<Navigate to="/accounts/products/add" replace />} />
                  <Route path="/system" element={<Navigate to="/system/preferences" replace />} />
                  <Route path="/settings/financial-year" element={<FinancialYearPage />} />

                  <Route path="/accounts/categories/add" element={<CategoryManagePage mode="add" />} />
                  <Route path="/accounts/categories/edit" element={<CategoryManagePage mode="edit" />} />
                  <Route path="/accounts/categories/remove" element={<CategoryManagePage mode="remove" />} />
                  <Route path="/accounts/manage/add" element={<AccountManagePage mode="add" />} />
                  <Route path="/accounts/manage/edit" element={<AccountManagePage mode="edit" />} />
                  <Route path="/accounts/manage/remove" element={<AccountManagePage mode="remove" />} />
                  <Route path="/accounts/products/add" element={<ProductAddPage />} />
                  <Route path="/accounts/products/remove" element={<ProductRemovePage />} />
                  <Route path="/accounts/sale-parties" element={<SalePartiesPage />} />
                  <Route path="/accounts/purchase-parties" element={<PurchasePartiesPage />} />
                  <Route path="/accounts/adjustment" element={<AccountAdjustmentPage />} />
                  <Route path="/accounts/products/stock-adjustment" element={<StockAdjustmentPage />} />

                  <Route path="/invoices/sale-commission" element={<InvoiceFormPage slug="sale-commission" />} />
                  <Route path="/invoices/sale-paunch" element={<InvoiceFormPage slug="sale-paunch" />} />
                  <Route path="/invoices/sale-general" element={<InvoiceFormPage slug="sale-general" />} />
                  <Route path="/invoices/purchase-maal" element={<InvoiceFormPage slug="purchase-maal" />} />
                  <Route path="/invoices/purchase-general" element={<InvoiceFormPage slug="purchase-general" />} />
                  <Route path="/invoices/general-trade" element={<InvoiceFormPage slug="general-trade" />} />
                  <Route path="/invoices/kachi-maal" element={<InvoiceFormPage slug="kachi-maal" />} />
                  <Route path="/invoices/view-invoice" element={<ViewInvoicePage />} />

                  <Route path="/inventory/bardana" element={<BardanaPage />} />

                  <Route path="/vouchers/payment" element={<VoucherFormPage kind="payment" />} />
                  <Route path="/vouchers/journal" element={<VoucherFormPage kind="journal" />} />
                  <Route path="/vouchers/receipt" element={<VoucherFormPage kind="receipt" />} />
                  <Route path="/vouchers/schedules" element={<SchedulesPage />} />
                  <Route path="/vouchers/view" element={<VoucherListPage />} />

                  <Route path="/reports" element={<ReportsLayout />}>
                    <Route index element={<Navigate to="/reports/daily" replace />} />
                    <Route path="accounts" element={<AccountReportsPage />} />
                    <Route path="account-balance" element={<AccountBalancePage />} />
                    <Route path="vouchers" element={<VouchersReportPage />} />
                    <Route path="daily" element={<DailyReportPage />} />
                    <Route path="trial-balance" element={<TrialBalancePage />} />
                    <Route path="sale-purchase" element={<SalePurchaseReportsPage />} />
                    <Route path="stock" element={<StockReportPage />} />
                  </Route>

                  <Route path="/system/preferences" element={<SystemPreferencesPage />} />
                  <Route path="/system/users" element={<UserManagementPage />} />
                  <Route path="/approvals" element={<PendingApprovalsPage />} />
                  <Route path="/backup" element={<BackupPage />} />
                  <Route path="/user" element={<UserInfoPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
