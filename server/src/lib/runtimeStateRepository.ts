import { getPgPool } from './db';

export type RuntimeSnapshotNamespace = 'wallet-auth' | 'payments';

type RuntimeSnapshotPayload = Record<string, unknown>;

export interface RuntimeStateRepository {
  load<T extends RuntimeSnapshotPayload>(namespace: RuntimeSnapshotNamespace): Promise<T | null>;
  save<T extends RuntimeSnapshotPayload>(
    namespace: RuntimeSnapshotNamespace,
    payload: T
  ): Promise<void>;
}

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: { payload: RuntimeSnapshotPayload }[] }>;
};

export class PostgresRuntimeStateRepository implements RuntimeStateRepository {
  constructor(private readonly database: Queryable = getPgPool()) {}

  async load<T extends RuntimeSnapshotPayload>(
    namespace: RuntimeSnapshotNamespace
  ): Promise<T | null> {
    const result = await this.database.query(
      'select payload from runtime_snapshots where namespace = $1 limit 1',
      [namespace]
    );
    const [row] = result.rows;

    return (row?.payload as T | undefined) ?? null;
  }

  async save<T extends RuntimeSnapshotPayload>(
    namespace: RuntimeSnapshotNamespace,
    payload: T
  ) {
    await this.database.query(
      `insert into runtime_snapshots (namespace, payload, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (namespace)
       do update set payload = excluded.payload, updated_at = excluded.updated_at`,
      [namespace, JSON.stringify(payload)]
    );
  }
}
