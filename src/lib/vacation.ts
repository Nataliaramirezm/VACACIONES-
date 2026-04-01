/**
 * Parses a YYYY-MM-DD date string into a local Date object.
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Calculates vacation days according to Ecuadorian Labor Code.
 * 15 days per year.
 * After 5 years of service, +1 day for each additional year.
 * Maximum additional days: 15.
 */
export function calculateAnnualVacationDays(entryDateStr: string): number {
  const entryDate = parseDate(entryDateStr);
  const now = new Date();
  
  let yearsOfService = now.getFullYear() - entryDate.getFullYear();
  const m = now.getMonth() - entryDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < entryDate.getDate())) {
    yearsOfService--;
  }

  if (yearsOfService < 1) {
    // Proportional days for the first year (1.25 days per month)
    const months = now.getMonth() - entryDate.getMonth() + (12 * (now.getFullYear() - entryDate.getFullYear()));
    return Math.floor(months * 1.25);
  }
  
  const baseDays = 15;
  if (yearsOfService <= 5) {
    return baseDays;
  }
  
  const additionalDays = Math.min(yearsOfService - 5, 15);
  return baseDays + additionalDays;
}

export function calculateProportionalDays(entryDateStr: string): number {
  if (!entryDateStr) return 0;
  const entryDate = parseDate(entryDateStr);
  const now = new Date();
  
  let yearsOfService = now.getFullYear() - entryDate.getFullYear();
  const m = now.getMonth() - entryDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < entryDate.getDate())) {
    yearsOfService--;
  }

  const lastAnniversary = new Date(entryDate);
  lastAnniversary.setFullYear(entryDate.getFullYear() + yearsOfService);
  
  let monthsSinceAnniversary = now.getMonth() - lastAnniversary.getMonth() + (12 * (now.getFullYear() - lastAnniversary.getFullYear()));
  if (now.getDate() < lastAnniversary.getDate()) {
    monthsSinceAnniversary--;
  }
  
  const currentYearEntitlement = yearsOfService < 5 ? 15 : (15 + Math.min(yearsOfService - 4, 15));
  return Math.floor(monthsSinceAnniversary * (currentYearEntitlement / 12));
}

export function calculateTotalEarnedDays(entryDateStr: string): number {
  if (!entryDateStr) return 0;
  const entryDate = parseDate(entryDateStr);
  const now = new Date();
  
  let yearsOfService = now.getFullYear() - entryDate.getFullYear();
  const m = now.getMonth() - entryDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < entryDate.getDate())) {
    yearsOfService--;
  }

  let total = 0;
  for (let i = 1; i <= yearsOfService; i++) {
    if (i <= 5) {
      total += 15;
    } else {
      const additional = Math.min(i - 5, 15);
      total += 15 + additional;
    }
  }

  return total;
}

/**
 * Calculates the current vacation period based on entry date.
 * Example: Entry 01/01/2025, Today 31/03/2026 -> Period: Enero 2026 - Enero 2027
 */
export function calculateVacationPeriod(entryDateStr: string): string {
  if (!entryDateStr) return 'N/A';
  const entryDate = parseDate(entryDateStr);
  const now = new Date();
  
  let yearsOfService = now.getFullYear() - entryDate.getFullYear();
  const m = now.getMonth() - entryDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < entryDate.getDate())) {
    yearsOfService--;
  }

  const startYear = entryDate.getFullYear() + yearsOfService;
  const endYear = startYear + 1;
  
  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  
  const monthName = monthNames[entryDate.getMonth()];
  
  return `${monthName} ${startYear} - ${monthName} ${endYear}`;
}

/**
 * Determines which vacation period is currently being consumed based on used days.
 * Follows FIFO (First-In, First-Out) logic.
 */
export interface PeriodInfo {
  period: string;
  daysInPeriod: number;
  usedInPeriod: number;
  remainingInPeriod: number;
}

export function calculatePeriodToUse(entryDateStr: string, usedDays: number): PeriodInfo {
  if (!entryDateStr) return { period: 'N/A', daysInPeriod: 0, usedInPeriod: 0, remainingInPeriod: 0 };
  const entryDate = parseDate(entryDateStr);
  const now = new Date();
  
  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const monthName = monthNames[entryDate.getMonth()];

  let yearsOfService = now.getFullYear() - entryDate.getFullYear();
  const m = now.getMonth() - entryDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < entryDate.getDate())) {
    yearsOfService--;
  }

  // We check each year from the first one
  let remainingUsed = usedDays;
  
  // We iterate up to the current year (completed periods)
  for (let i = 1; i <= yearsOfService; i++) {
    let daysInThisPeriod = 0;
    if (i <= 5) {
      daysInThisPeriod = 15;
    } else {
      const additional = Math.min(i - 5, 15);
      daysInThisPeriod = 15 + additional;
    }

    const startYear = entryDate.getFullYear() + i - 1;
    const endYear = startYear + 1;

    if (remainingUsed < daysInThisPeriod) {
      // This is the period currently being used
      return {
        period: `${monthName} ${startYear} - ${monthName} ${endYear}`,
        daysInPeriod: daysInThisPeriod,
        usedInPeriod: remainingUsed,
        remainingInPeriod: daysInThisPeriod - remainingUsed
      };
    }
    
    remainingUsed -= daysInThisPeriod;
  }

  // If we've used all days from completed periods, we are waiting for the next one to complete
  // or we are in the first year of service
  const currentStartYear = entryDate.getFullYear() + yearsOfService;
  const currentEndYear = currentStartYear + 1;
  const daysInCurrentPeriod = yearsOfService + 1 <= 5 ? 15 : 15 + Math.min((yearsOfService + 1) - 5, 15);

  return { 
    period: `${monthName} ${currentStartYear} - ${monthName} ${currentEndYear}`, 
    daysInPeriod: daysInCurrentPeriod, 
    usedInPeriod: remainingUsed, 
    remainingInPeriod: daysInCurrentPeriod - remainingUsed 
  };
}

/**
 * Formats a YYYY-MM-DD date string to DD/MM/YYYY without timezone shifts.
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}
