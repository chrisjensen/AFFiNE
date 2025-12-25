import {
  type DocClock,
  type DocClocks,
  type DocRecord,
  DocStorageBase,
  type DocStorageOptions,
  type DocUpdate,
} from '../../storage';
import { HttpConnection } from './http';

interface CloudDocStorageOptions extends DocStorageOptions {
  serverBaseUrl: string;
}

export class StaticCloudDocStorage extends DocStorageBase<CloudDocStorageOptions> {
  static readonly identifier = 'StaticCloudDocStorage';

  constructor(options: CloudDocStorageOptions) {
    super({ ...options, readonlyMode: true });
  }

  override connection = new HttpConnection(this.options.serverBaseUrl);
  override async pushDocUpdate(
    update: DocUpdate,
    _origin?: string
  ): Promise<DocClock> {
    // http is readonly
    return { docId: update.docId, timestamp: new Date() };
  }
  override async getDocTimestamp(docId: string): Promise<DocClock | null> {
    try {
      const response = await this.connection.fetch(
        `/api/workspaces/${this.spaceId}/docs/${docId}`,
        {
          method: 'HEAD', // Only need headers, not body
          headers: {
            Accept: 'application/octet-stream',
          },
        }
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to get doc timestamp: ${response.statusText}`);
      }

      const timestampHeader = response.headers.get('x-doc-timestamp');
      if (!timestampHeader) {
        // Fallback: return current time if header not present
        return {
          docId,
          timestamp: new Date(),
        };
      }

      return {
        docId,
        timestamp: new Date(parseInt(timestampHeader, 10)),
      };
    } catch (error) {
      console.error('Failed to get doc timestamp:', error);
      return null;
    }
  }
  override async getDocTimestamps(after?: Date): Promise<DocClocks> {
    try {
      const url = `/api/workspaces/${this.spaceId}/doc-timestamps${
        after ? `?after=${after.getTime()}` : ''
      }`;

      const response = await this.connection.fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return {};
        }
        throw new Error(
          `Failed to fetch doc timestamps: ${response.statusText}`
        );
      }

      const data = await response.json();

      // Convert timestamps from numbers to Date objects
      return Object.entries(data).reduce((ret, [docId, timestamp]) => {
        ret[docId] = new Date(timestamp as number);
        return ret;
      }, {} as DocClocks);
    } catch (error) {
      console.error('Failed to get doc timestamps:', error);
      return {};
    }
  }
  override deleteDoc(_docId: string): Promise<void> {
    // http is readonly
    return Promise.resolve();
  }
  protected override async getDocSnapshot(
    docId: string
  ): Promise<DocRecord | null> {
    try {
      const arrayBuffer = await this.connection.fetchArrayBuffer(
        `/api/workspaces/${this.spaceId}/docs/${docId}`,
        {
          priority: 'high',
          headers: {
            Accept: 'application/octet-stream', // this is necessary for ios native fetch to return arraybuffer
          },
        }
      );
      if (!arrayBuffer) {
        return null;
      }
      return {
        docId: docId,
        bin: new Uint8Array(arrayBuffer),
        timestamp: new Date(),
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  }
  protected override setDocSnapshot(
    _snapshot: DocRecord,
    _prevSnapshot: DocRecord | null
  ): Promise<boolean> {
    // http is readonly
    return Promise.resolve(false);
  }
  protected override getDocUpdates(_docId: string): Promise<DocRecord[]> {
    return Promise.resolve([]);
  }
  protected override markUpdatesMerged(
    _docId: string,
    _updates: DocRecord[]
  ): Promise<number> {
    return Promise.resolve(0);
  }
}
