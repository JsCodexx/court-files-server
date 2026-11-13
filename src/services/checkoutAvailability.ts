import { getSetting } from './appSettingsService';

export const RAPIDGATEWAY_CHECKOUT_SETTING_KEY = 'rapidgateway_checkout_enabled';

/** Env overrides DB: RAPIDGATEWAY_CHECKOUT_ENABLED=true|false */
export async function isRapidGatewayCheckoutEnabled(): Promise<boolean> {
  const env = process.env.RAPIDGATEWAY_CHECKOUT_ENABLED?.trim().toLowerCase();
  if (env === 'true' || env === '1') return true;
  if (env === 'false' || env === '0') return false;

  const raw = await getSetting(RAPIDGATEWAY_CHECKOUT_SETTING_KEY, 'false');
  return raw === 'true';
}

export interface CheckoutAvailabilityDto {
  rapidGateway: boolean;
  manual: boolean;
}

export async function getCheckoutAvailability(): Promise<CheckoutAvailabilityDto> {
  const [rapidGateway, manualRaw] = await Promise.all([
    isRapidGatewayCheckoutEnabled(),
    getSetting('manual_payment_enabled', 'true'),
  ]);
  return {
    rapidGateway,
    manual: manualRaw === 'true',
  };
}
