// backend/src/utils/commission.ts
/**
 * Centralized financial split utilities.
 * Uses the same rates as the original calculateSplit: 93% Tanda, 5% Plataforma, 2% Fondo.
 */
export const PLATFORM_COMMISSION_RATE = 0.05;
export const FUND_PROTECTION_RATE = 0.02;
export const TANDA_RECEIVE_RATE = 0.93;

/**
 * Returns the split values for a given amount.
 */
export function calculateSplit(amount: number) {
  const tandaRecibe = parseFloat((amount * TANDA_RECEIVE_RATE).toFixed(2));
  const plataformaComision = parseFloat((amount * PLATFORM_COMMISSION_RATE).toFixed(2));
  const fondoProteccion = parseFloat((amount * FUND_PROTECTION_RATE).toFixed(2));
  return { tandaRecibe, plataformaComision, fondoProteccion };
}

/**
 * Convenience wrappers if only commission or emergency fund are needed.
 */
export function calculateCommission(amount: number): number {
  return parseFloat((amount * PLATFORM_COMMISSION_RATE).toFixed(2));
}

export function calculateEmergencyFund(amount: number): number {
  // Emergency fund equals the platform commission per requirements.
  return calculateCommission(amount);
}
