import { api, type SystemPreferences } from './api';
import type { ReportBusinessInfo } from './reportExport';

/** Fallback when prefs have not loaded yet — matches seeded System Preference defaults. */
export const DEFAULT_BUSINESS_INFO: ReportBusinessInfo = {
  businessName: 'Umer Farooq & Brothers',
  proprietorName: '',
  phone: '',
  mobile: null,
  email: null,
  address: null,
  ntnNumber: null,
};

export function businessInfoFromPrefs(
  prefs: Pick<
    SystemPreferences,
    'businessName' | 'proprietorName' | 'phone' | 'mobile' | 'email' | 'address' | 'ntnNumber'
  >,
): ReportBusinessInfo {
  return {
    businessName: prefs.businessName?.trim() || DEFAULT_BUSINESS_INFO.businessName,
    proprietorName: prefs.proprietorName?.trim() || DEFAULT_BUSINESS_INFO.proprietorName,
    phone: prefs.phone?.trim() || DEFAULT_BUSINESS_INFO.phone,
    mobile: prefs.mobile,
    email: prefs.email,
    address: prefs.address,
    ntnNumber: prefs.ntnNumber,
  };
}

export async function loadBusinessInfo(): Promise<ReportBusinessInfo> {
  try {
    const prefs = await api.getSystemPreferences();
    return businessInfoFromPrefs(prefs);
  } catch {
    return { ...DEFAULT_BUSINESS_INFO };
  }
}
