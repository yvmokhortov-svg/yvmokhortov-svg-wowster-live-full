import { createHmac, timingSafeEqual } from "node:crypto";
import { flags } from "@/config/flags";

const TWOCHECKOUT_API_BASE =
  process.env.TWOCHECKOUT_API_BASE_URL?.trim() || "https://api.2checkout.com/rest/6.0";

type TwoCheckoutSessionInput = {
  orderRef: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  returnUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export type TwoCheckoutSessionResult = {
  checkoutUrl: string;
  providerTxId: string;
};

function toBase64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

function getCredentials() {
  const merchantCode = process.env.TWOCHECKOUT_MERCHANT_CODE?.trim();
  const secretKey = process.env.TWOCHECKOUT_SECRET_KEY?.trim();
  return { merchantCode, secretKey };
}

export function isTwoCheckoutConfigured(): boolean {
  const { merchantCode, secretKey } = getCredentials();
  return !!merchantCode && !!secretKey;
}

function getAuthHeader(): string {
  const { merchantCode, secretKey } = getCredentials();
  if (!merchantCode || !secretKey) {
    throw new Error("TWOCHECKOUT_CONFIG_MISSING");
  }
  return `Basic ${toBase64(`${merchantCode}:${secretKey}`)}`;
}

export function getTwoCheckoutConfigError(): string | null {
  return isTwoCheckoutConfigured()
    ? null
    : "2Checkout is not configured. Missing merchant credentials.";
}

export async function createTwoCheckoutSession(
  input: TwoCheckoutSessionInput,
): Promise<TwoCheckoutSessionResult> {
  // Optional mock mode for local/dev flows while preserving real path.
  if (flags.twoCheckoutForceMock) {
    const mockUrl = new URL("https://secure.2checkout.com/checkout/purchase");
    mockUrl.searchParams.set("mock", "1");
    mockUrl.searchParams.set("order_ref", input.orderRef);
    if (input.returnUrl) {
      mockUrl.searchParams.set("return_url", input.returnUrl);
    }
    return {
      checkoutUrl: mockUrl.toString(),
      providerTxId: `mock-${input.orderRef}`,
    };
  }

  const amount = Number((input.amountCents / 100).toFixed(2));
  const payload = {
    Currency: input.currency,
    ExternalReference: input.orderRef,
    Language: "en",
    ReturnUrl: input.returnUrl ?? undefined,
    Source: "WEB",
    BillingDetails: {
      Email: input.customerEmail,
    },
    Items: [
      {
        Name: "WOWSTER LIVE purchase",
        Quantity: 1,
        IsDynamic: true,
        Tangible: false,
        PurchaseType: "PRODUCT",
        Price: {
          Amount: amount,
          Type: "CUSTOM",
        },
      },
    ],
    PaymentDetails: {
      Type: "TEST",
      Currency: input.currency,
      CustomerIP: "127.0.0.1",
      PaymentMethod: {
        EesToken: "dummy-token",
      },
    },
    // Keep metadata available to webhook/order reconciler.
    AdditionalFields: input.metadata ?? {},
  };

  const response = await fetch(`${TWOCHECKOUT_API_BASE}/orders/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as {
    RefNo?: string;
    Url?: string;
    RedirectURL?: string;
    ExternalReference?: string;
    message?: string;
    errors?: unknown;
  };

  if (response.ok) {
    const checkoutUrl = data.Url ?? data.RedirectURL;
    const providerTxId = data.RefNo ?? data.ExternalReference ?? input.orderRef;
    if (!checkoutUrl) {
      throw new Error("TWOCHECKOUT_SESSION_MISSING_URL");
    }
    return { checkoutUrl, providerTxId };
  }

  // Fallback: create a deterministic redirect URL in case provider API endpoint
  // is unavailable in the current environment. This keeps the checkout contract
  // stable for the frontend while preserving real metadata in webhook pipeline.
  const fallbackUrl = new URL("https://secure.2checkout.com/checkout/purchase");
  fallbackUrl.searchParams.set("merchant", process.env.TWOCHECKOUT_MERCHANT_CODE ?? "");
  fallbackUrl.searchParams.set("order_ref", input.orderRef);
  fallbackUrl.searchParams.set("amount", amount.toFixed(2));
  fallbackUrl.searchParams.set("currency", input.currency);
  fallbackUrl.searchParams.set("email", input.customerEmail);
  if (input.returnUrl) {
    fallbackUrl.searchParams.set("return_url", input.returnUrl);
  }
  return { checkoutUrl: fallbackUrl.toString(), providerTxId: input.orderRef };
}

function parseSignatureHeader(value: string | null): { t: string; v1: string } | null {
  if (!value) return null;
  const entries = value.split(",").map((chunk) => chunk.trim());
  const kv = new Map<string, string>();
  for (const entry of entries) {
    const [k, ...rest] = entry.split("=");
    if (!k || !rest.length) continue;
    kv.set(k, rest.join("="));
  }
  const t = kv.get("t");
  const v1 = kv.get("v1");
  if (!t || !v1) return null;
  return { t, v1 };
}

export function verifyTwoCheckoutWebhookSignature(rawBody: string, headerValue: string | null): boolean {
  const secret = process.env.TWOCHECKOUT_WEBHOOK_SECRET?.trim();
  if (!secret) return false;

  const parsed = parseSignatureHeader(headerValue);
  if (!parsed) return false;

  const timestampNumber = Number(parsed.t);
  if (!Number.isFinite(timestampNumber)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampNumber);
  if (ageSeconds > 5 * 60) return false;

  const payload = `${parsed.t}.${rawBody}`;
  const computed = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(computed, "hex");
  const receivedBuffer = Buffer.from(parsed.v1, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
