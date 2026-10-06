export type DID = `did:plc:${string}`;
export type Capability =
  | "identity.authenticate"
  | "files.select"
  | "blobs.upload"
  | "identity.basic"
  | "social.public.read"
  | "records.read"
  | "records.write"
  | "payments.request"
  | "chat.openConversation";
export interface ManifestV1 {
  v: 1;
  id: string;
  version: string;
  name: string;
  entrypoint: string;
  permissions: Capability[];
  collections: string[];
  readCollections: string[];
  recordPurpose: string;
  allowedPaymentAssets: string[];
  minimumHostVersion: string;
  networkAccess: string[];
}
export interface Identity {
  did: DID;
  handle: string;
  displayName: string;
  avatar: string | null;
  appId: string;
}
export interface ResolvedIdentity {
  did: DID;
  handle: string;
}
export interface PaymentRecipient extends ResolvedIdentity {
  displayName: string;
  avatar: string | null;
  canReceive: string[];
}
export interface PublicRecord<T = Record<string, unknown>> {
  uri: string;
  cid: string;
  author: ResolvedIdentity;
  record: T;
  publishedAt: string;
}
export type PaymentResult =
  | { status: "sent"; digest: string }
  | { status: "cancelled" | "pending" | "failed" | "expired" };
export interface HostBridgeV1 {
  readonly v: 1;
  blobs: {
    upload(
      file: Blob,
      options: { collection: string },
    ): Promise<{
      $type: "blob";
      ref: { $link: string };
      mimeType: string;
      size: number;
    }>;
  };
  readonly auth: {
    getAssertion(input: {
      audience: string;
      nonce: string;
      paymentAccount?: true;
    }): Promise<{ token: string; issuer: string; expiresAt: string }>;
  };
  readonly identity: {
    getSelf(): Promise<Identity>;
    resolveHandle(handle: string): Promise<ResolvedIdentity>;
  };
  readonly records: {
    create(input: {
      collection: string;
      value: unknown;
    }): Promise<{ uri: string; cid: string }>;
    update(input: {
      collection: string;
      rkey: string;
      value: unknown;
    }): Promise<{ uri: string; cid: string }>;
    delete(input: { collection: string; rkey: string }): Promise<void>;
  };
  readonly publicData: {
    query<T = Record<string, unknown>>(input: {
      collection: string;
      query?: { author?: DID; limit?: string; cursor?: string };
    }): Promise<{ records: PublicRecord<T>[]; nextCursor: string | null }>;
  };
  readonly payments: {
    resolve(handle: string): Promise<PaymentRecipient>;
    request(input: {
      recipientDid: DID;
      asset: "USDC";
      amount: string;
      memo?: string;
    }): Promise<PaymentResult>;
  };
  readonly chat: {
    openConversation(input: { recipientDid: DID }): Promise<void>;
  };
}
declare global {
  interface Window {
    readonly host?: HostBridgeV1;
  }
}
export function getHost(scope?: { readonly host?: HostBridgeV1 }): HostBridgeV1;
export function selectFiles(options?: {
  accept?: string;
  multiple?: boolean;
}): Promise<File[]>;
export function signInWithTabs(options: {
  backendOrigin: string;
  host?: HostBridgeV1;
  paymentAccount?: boolean;
}): Promise<{
  sessionToken: string;
  did: DID;
  expiresAt: string;
}>;
export function describeError(error: unknown): string;
export function recordKey(uri: string, collection: string): string;
