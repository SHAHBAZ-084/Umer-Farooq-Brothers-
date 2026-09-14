import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export type ReportBusinessInfo = {
  businessName: string;
  proprietorName: string;
  phone: string;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  ntnNumber?: string | null;
};

export const DEVELOPER_CREDIT = 'AS Digital Solutions | www.asdigitalsolution.online';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatBusinessContactLine(info: ReportBusinessInfo): string {
  const parts: string[] = [`Ph: ${info.phone.trim()}`];
  const mobile = info.mobile?.trim();
  const email = info.email?.trim();
  const ntn = info.ntnNumber?.trim();
  if (mobile) parts.push(`Mob: ${mobile}`);
  if (email) parts.push(`Email: ${email}`);
  if (ntn) parts.push(`NTN: ${ntn}`);
  return parts.join('  ·  ');
}

/** Draws centered company letterhead + left-aligned report title. Returns table start Y. */
export function drawReportLetterhead(
  doc: jsPDF,
  businessInfo: ReportBusinessInfo,
  title: string,
  subtitle?: string,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const centerX = pageWidth / 2;
  let y = 14;

  const businessName = businessInfo.businessName.trim() || 'Business';
  const proprietor = businessInfo.proprietorName.trim();
  const contact = formatBusinessContactLine(businessInfo);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(28, 28, 34);
  if (typeof doc.setCharSpace === 'function') {
    doc.setCharSpace(0.35);
  }
  doc.text(businessName, centerX, y, { align: 'center' });
  if (typeof doc.setCharSpace === 'function') {
    doc.setCharSpace(0);
  }
  y += 7;

  if (proprietor) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(78, 78, 88);
    doc.text(proprietor, centerX, y, { align: 'center' });
    y += 4.2;
  }

  const address = businessInfo.address?.trim();
  if (address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(96, 96, 106);
    const addressLines = doc.splitTextToSize(address, contentWidth);
    doc.text(addressLines, centerX, y, { align: 'center' });
    y += addressLines.length * 3.4 + 0.6;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(112, 112, 122);
  const contactLines = doc.splitTextToSize(contact, contentWidth);
  doc.text(contactLines, centerX, y, { align: 'center' });
  y += contactLines.length * 3.3 + 2.2;

  // Dual-rule divider: soft full-width hairline + slightly heavier accent rule
  doc.setDrawColor(200, 200, 208);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 0.85;
  doc.setDrawColor(87, 83, 78);
  doc.setLineWidth(0.65);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(30, 30, 36);
  doc.text(title, margin, y);
  y += 4.8;

  if (subtitle?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(74, 74, 84);
    const lines = doc.splitTextToSize(subtitle.trim(), contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 3.8 + 1.5;
  }

  doc.setTextColor(30, 30, 36);
  return y + 1;
}

function drawReportFooter(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 148);
  doc.text(DEVELOPER_CREDIT, pageWidth / 2, pageHeight - 8, { align: 'center' });
  doc.setTextColor(30, 30, 36);
}

/**
 * Note: `xlsx` 0.18.5 (community SheetJS) does not persist cell styles on write.
 * Alignment objects below are set for forward-compat / Pro builds, but Excel from
 * this package will still show left-aligned merged text. On-screen + PDF letterheads
 * are the reliable centered surfaces.
 */
function applyExcelHeaderCellMeta(
  worksheet: XLSX.WorkSheet,
  address: string,
  opts: { bold?: boolean; center?: boolean; fontSize?: number },
) {
  const cell = worksheet[address];
  if (!cell || typeof cell !== 'object') return;
  cell.s = {
    alignment: opts.center ? { horizontal: 'center', vertical: 'center', wrapText: true } : undefined,
    font: {
      bold: Boolean(opts.bold),
      sz: opts.fontSize,
    },
  };
}

export function downloadExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
  businessInfo: ReportBusinessInfo,
) {
  const colCount = Math.max(headers.length, 1);
  const contact = formatBusinessContactLine(businessInfo);
  const address = businessInfo.address?.trim() || '';
  const headerRows: (string | number)[][] = [
    [businessInfo.businessName],
    [businessInfo.proprietorName],
  ];
  if (address) {
    headerRows.push([address]);
  }
  headerRows.push([contact], []);

  const aoa: (string | number)[][] = [
    ...headerRows,
    headers,
    ...rows,
    [],
    [DEVELOPER_CREDIT],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const headerMergeCount = address ? 4 : 3;
  worksheet['!merges'] = [
    ...Array.from({ length: headerMergeCount }, (_, r) => ({
      s: { r, c: 0 },
      e: { r, c: colCount - 1 },
    })),
    {
      s: { r: aoa.length - 1, c: 0 },
      e: { r: aoa.length - 1, c: colCount - 1 },
    },
  ];

  applyExcelHeaderCellMeta(worksheet, 'A1', { bold: true, center: true, fontSize: 14 });
  applyExcelHeaderCellMeta(worksheet, 'A2', { center: true, fontSize: 11 });
  if (address) {
    applyExcelHeaderCellMeta(worksheet, 'A3', { center: true, fontSize: 9 });
    applyExcelHeaderCellMeta(worksheet, 'A4', { center: true, fontSize: 9 });
  } else {
    applyExcelHeaderCellMeta(worksheet, 'A3', { center: true, fontSize: 9 });
  }
  applyExcelHeaderCellMeta(worksheet, `A${aoa.length}`, { center: true, fontSize: 8 });

  worksheet['!cols'] = Array.from({ length: colCount }, (_, i) => ({
    wch: i === 0 ? 28 : 14,
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  triggerDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  );
}

export function downloadPdf(
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number)[][],
  businessInfo: ReportBusinessInfo,
  options?: {
    subtitle?: string;
  },
) {
  const doc = buildReportPdf(title, headers, rows, businessInfo, options);
  doc.save(filename);
}

/** Build the same PDF as downloadPdf, then open the browser print dialog (full report). */
export function printReportPdf(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  businessInfo: ReportBusinessInfo,
  options?: {
    subtitle?: string;
  },
) {
  const doc = buildReportPdf(title, headers, rows, businessInfo, options);
  doc.autoPrint();
  const blobUrl = String(doc.output('bloburl'));
  const printWindow = window.open(blobUrl, '_blank');
  if (!printWindow) {
    // Popup blocked — fall back to hidden iframe print.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = blobUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        window.setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
          iframe.remove();
        }, 60_000);
      }
    };
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

function buildReportPdf(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  businessInfo: ReportBusinessInfo,
  options?: {
    subtitle?: string;
  },
) {
  const doc = new jsPDF({ orientation: rows[0]?.length > 6 ? 'landscape' : 'portrait' });
  const startY = drawReportLetterhead(doc, businessInfo, title, options?.subtitle);

  autoTable(doc, {
    head: [headers],
    body: rows.map((row) => row.map(String)),
    startY,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [87, 83, 78] },
    margin: { top: 14, bottom: 16, left: 14, right: 14 },
    didDrawPage: () => {
      drawReportFooter(doc);
    },
  });

  return doc;
}
