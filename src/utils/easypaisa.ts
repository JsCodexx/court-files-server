import crypto from 'crypto';

/**
 * EasyPaisa Online Merchant (MA / hosted checkout) helpers.
 * Exact field names follow Telenor EasyPaisa merchant integration docs —
 * confirm against the PDF they give you after merchant onboarding.
 */

export function isEasyPaisaConfigured(): boolean {
  return Boolean(
    process.env.EASYPAISA_STORE_ID &&
      process.env.EASYPAISA_HASH_KEY &&
      process.env.EASYPAISA_ACCOUNT_NUM
  );
}

export function getEasyPaisaCheckoutUrl(): string {
  return (
    process.env.EASYPAISA_CHECKOUT_URL ||
    'https://easypay.easypaisa.com.pk/easypay/Index.jsf'
  );
}

/** Common EasyPaisa integrity: HMAC-SHA256 of ordered fields with hash key. */
export function buildEasyPaisaHash(
  fields: Record<string, string>,
  hashKey: string
): string {
  // Sort keys alphabetically then join values — adjust if merchant PDF differs.
  const payload = Object.keys(fields)
    .sort()
    .map((k) => fields[k])
    .join('');
  return crypto.createHmac('sha256', hashKey).update(payload).digest('hex');
}

export interface EasyPaisaCheckoutPayload {
  storeId: string;
  amount: string;
  postBackURL: string;
  orderRefNum: string;
  expiryDate?: string;
  merchantHashedReq: string;
  autoRedirect: string;
  paymentMethod: string;
  emailAddress?: string;
  mobileNum?: string;
}

export function buildCheckoutFormFields(input: {
  orderRefNum: string;
  amountPkr: number;
  postBackURL: string;
  email?: string;
  mobile?: string;
}): EasyPaisaCheckoutPayload | null {
  if (!isEasyPaisaConfigured()) return null;

  const storeId = process.env.EASYPAISA_STORE_ID!;
  const hashKey = process.env.EASYPAISA_HASH_KEY!;
  const amount = input.amountPkr.toFixed(0);

  const toHash: Record<string, string> = {
    amount,
    orderRefNum: input.orderRefNum,
    postBackURL: input.postBackURL,
    storeId,
  };

  return {
    storeId,
    amount,
    postBackURL: input.postBackURL,
    orderRefNum: input.orderRefNum,
    merchantHashedReq: buildEasyPaisaHash(toHash, hashKey),
    autoRedirect: '1',
    paymentMethod: 'MA_PAYMENT_METHOD',
    emailAddress: input.email,
    mobileNum: input.mobile,
  };
}
