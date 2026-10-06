export interface TabsAssertionClaims {
  readonly iss: string;
  readonly sub: string;
  readonly aud: string;
  readonly app_id: string;
  readonly nonce: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
  readonly payment_account?: {
    readonly network: "mainnet";
    readonly senderCommitment: string;
  };
  readonly profile?: { readonly handle: string; readonly displayName: string };
}
export interface TabsJwks {
  keys: Record<string, unknown>[];
}
export function verifyTabsAssertion(
  token: string,
  options: {
    issuer: string;
    audience: string;
    appId: string;
    nonce: string;
    jwks: TabsJwks;
    now?: number;
  },
): Readonly<TabsAssertionClaims>;
export function fetchTabsKeys(issuer: string): Promise<TabsJwks>;
