/**
 * Calculates vacation days according to Ecuadorian Labor Code.
 * 15 days per year.
 * After 5 years of service, +1 day for each additional year.
 * Maximum additional days: 15.
 */
export function calculateAnnualVacationDays(entryDateStr: string): number {
  const entryDate = new Date(entryDateStr);
  const now = new Date();
  
  let yearsOfService = now.getFullYear() - entryDate.getFullYear();
  const m = now.getMonth() - entryDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < entryDate.getDate())) {
    yearsOfService--;
  }

  if (yearsOfService < 1) return 0; // Not yet a year
  
  const baseDays = 15;
  if (yearsOfService <= 5) {
    return baseDays;
  }
  
  const additionalDays = Math.min(yearsOfService - 5, 15);
  return baseDays + additionalDays;
}

export function calculateTotalEarnedDays(entryDateStr: string): number {
  const entryDate = new Date(entryDateStr);
  const now = new Date();
  
  let yearsOfService = now.getFullYear() - entryDate.getFullYear();
  const m = now.getMonth() - entryDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < entryDate.getDate())) {
    yearsOfService--;
  }

  if (yearsOfService < 1) return 0;

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
