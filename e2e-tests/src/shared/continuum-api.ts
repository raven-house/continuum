/**
 * Typed client for the Continuum HTTP API used by the migration flow.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type TokenAttestation = { token_id: string; signature_bytes: number[] };

export type MigrationData = {
  old_wallet_address: string;
  new_wallet_address: string;
  collection_address: string;
  old_collection_address: string;
  tokens: TokenAttestation[];
};

export class ContinuumApi {
  constructor(
    private readonly baseUrl: string,
    private readonly adminApiKey = process.env.CONTINUUM_ADMIN_API_KEY,
  ) {}

  private async get(path: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
    return res.json();
  }

  private post(path: string, body: unknown, opts: { admin?: boolean } = {}): Promise<Response> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.admin && this.adminApiKey) {
      headers.authorization = `Bearer ${this.adminApiKey}`;
    }

    return fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  getAttester(): Promise<{ x: string; y: string }> {
    return this.get("/attester");
  }

  newMigrationSecret(): Promise<{ secret: string; commitment: string }> {
    return this.get("/migration/new-secret");
  }

  async uploadArtifact(input: {
    artifactId: string;
    name: string;
    abi: unknown;
    eventTypes: string[];
    startBlock: Record<string, number>;
    networks?: Record<string, { start_block?: number; addresses?: string[] }>;
    migration?: unknown;
  }): Promise<"registered" | "already-registered"> {
    const res = await this.post(
      "/contracts/upload",
      {
        artifact_id: input.artifactId,
        name: input.name,
        abi: input.abi,
        enabled: true,
        event_types: input.eventTypes,
        start_block: input.startBlock,
        networks: input.networks,
        migration: input.migration,
      },
      { admin: true },
    );
    if (res.ok) return "registered";
    if (res.status === 409) return "already-registered";
    throw new Error(`/contracts/upload → ${res.status} ${await res.text()}`);
  }

  async registerCollection(input: {
    oldAddress: string;
    newAddress: string;
    network: string;
    name: string;
    artifactId?: string;
  }): Promise<void> {
    const res = await this.post(
      "/collections/register",
      {
        old_collection_address: input.oldAddress,
        old_network: input.network,
        new_collection_address: input.newAddress,
        new_network: input.network,
        collection_name: input.name,
        artifact_id: input.artifactId,
      },
      { admin: true },
    );
    if (!res.ok) throw new Error(`/collections/register → ${res.status} ${await res.text()}`);
  }

  async requestData(input: {
    collectionAddress: string;
    migrationSecret: string;
    newWalletAddress: string;
  }): Promise<MigrationData | null> {
    const res = await this.post("/request_data", {
      collection_address: input.collectionAddress,
      migration_secret: input.migrationSecret,
      new_wallet_address: input.newWalletAddress,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`/request_data → ${res.status} ${await res.text()}`);
    return res.json();
  }

  async pollRequestData(
    input: { collectionAddress: string; migrationSecret: string; newWalletAddress: string },
    opts: {
      expected: number;
      attempts?: number;
      intervalMs?: number;
      onWait?: (attempt: number, got: number) => void;
    },
  ): Promise<TokenAttestation[]> {
    const attempts = opts.attempts ?? 60;
    const intervalMs = opts.intervalMs ?? 15_000;

    let tokens: TokenAttestation[] = [];
    for (let attempt = 1; attempt <= attempts; attempt++) {
      tokens = (await this.requestData(input))?.tokens ?? [];
      if (tokens.length >= opts.expected) return tokens;

      opts.onWait?.(attempt, tokens.length);
      if (attempt === attempts) {
        throw new Error(
          `Timed out waiting for indexer: only ${tokens.length}/${opts.expected} tokens after ` +
            `${attempts} attempts. Is the indexer running for this network?`,
        );
      }
      await sleep(intervalMs);
    }
    return tokens;
  }
}
