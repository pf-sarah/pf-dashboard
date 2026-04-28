// Parser for "Weekly_Earnings_by_Location__Department" pivot report
// Structure: row 0 = week headers, row 1 = subheaders, row 2 = col labels
// Data rows: cols 0-2 = location/dept/employee (None = same as above)
// Then pairs of (currency, gross_pay) for each week

export interface WeeklyLaborRow {
  employee:   string;
  location:   string;
  department: string;
  weekOf:     string; // ISO date e.g. "2026-03-30"
  grossPay:   number;
}

function parseWeekStart(raw: string): string | null {
  if (!raw || raw === 'All') return null;
  const part = raw.split(' - ')[0].trim(); // "Mar 30 2026"
  const d = new Date(part + ' 12:00:00 UTC');
  if (isNaN(d.getTime())) return null;
  // Return the Monday of that week
  const day = d.getUTCDay();
  const diff = day === 0 ? 1 : (day === 1 ? 0 : 8 - day);
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff - (day === 0 ? 6 : day - 1));
  // Actually just return the date as-is since week start is already given
  return d.toISOString().split('T')[0];
}

export async function parseWeeklyLaborXLSX(file: File): Promise<WeeklyLaborRow[]> {
  const XLSX = await import('xlsx');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = XLSX.read(new Uint8Array(e.target!.result as ArrayBuffer), { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

        // Row 0: week headers — find week columns
        const headerRow = rows[0] as (string | null)[];
        const weekCols: { weekOf: string; colIdx: number }[] = [];
        for (let i = 3; i < headerRow.length; i += 2) {
          const h = headerRow[i];
          if (h && typeof h === 'string' && h !== 'Grand Total') {
            const weekOf = parseWeekStart(h);
            if (weekOf) weekCols.push({ weekOf, colIdx: i + 1 }); // +1 = gross pay value col
          }
        }

        const result: WeeklyLaborRow[] = [];
        let currentLoc  = '';
        let currentDept = '';

        // Data starts at row 3 (0-indexed)
        for (let ri = 3; ri < rows.length; ri++) {
          const row = rows[ri] as (string | number | null)[];
          const loc  = row[0] ? String(row[0]).trim() : null;
          const dept = row[1] ? String(row[1]).trim() : null;
          const name = row[2] ? String(row[2]).trim() : null;

          if (loc && loc !== 'Grand Total') currentLoc = loc;
          if (dept) currentDept = dept;

          // Skip grouping rows (no employee name, or 'All', or 'Grand Total')
          if (!name || name === 'All' || name === 'Grand Total') continue;
          if (!currentLoc || currentLoc === 'Grand Total') continue;
          if (!currentDept || currentDept === 'All') continue;

          for (const { weekOf, colIdx } of weekCols) {
            const gross = row[colIdx];
            if (gross !== null && gross !== undefined && Number(gross) > 0) {
              result.push({
                employee:   name,
                location:   currentLoc,
                department: currentDept,
                weekOf,
                grossPay:   Number(gross),
              });
            }
          }
        }

        resolve(result);
      } catch (err) {
        reject(new Error(err instanceof Error ? err.message : String(err)));
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
