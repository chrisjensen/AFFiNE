import { createYProxy, type DocMeta } from '@blocksuite/affine/store';
import { Subject } from 'rxjs';
import type * as Y from 'yjs';

type SpaceMetaState = {
  pages?: unknown[];
  name?: string;
};

/**
 * SpaceMetaImpl manages the space's root document metadata.
 * Following the WorkspaceMetaImpl pattern where docId = spaceId.
 */
export class SpaceMetaImpl {
  /* eslint-disable rxjs/finnish */
  docMetaAdded = new Subject<string>();
  docMetaRemoved = new Subject<string>();
  docMetaUpdated = new Subject<void>();
  nameUpdated = new Subject<void>();
  /* eslint-enable rxjs/finnish */

  private readonly _handleMetaEvents = (
    events: Y.YEvent<Y.Array<unknown> | Y.Text | Y.Map<unknown>>[]
  ) => {
    events.forEach(e => {
      const hasKey = (k: string) =>
        e.target === this._yMap && e.changes.keys.has(k);

      if (
        e.target === this.yDocs ||
        e.target.parent === this.yDocs ||
        hasKey('pages')
      ) {
        this._handleDocMetaEvent();
      }

      if (hasKey('name')) {
        this._handleNameEvent();
      }
    });
  };

  private readonly _id: string = 'meta';
  private readonly _doc: Y.Doc;
  private readonly _proxy: SpaceMetaState;
  private readonly _yMap: Y.Map<SpaceMetaState[keyof SpaceMetaState]>;
  private _prevDocs = new Set<string>();

  get name() {
    return this._proxy.name;
  }

  setName(name: string) {
    this._doc.transact(() => {
      this._proxy.name = name;
    }, this._doc.clientID);
  }

  get docMetas() {
    if (!this._proxy.pages) {
      return [] as DocMeta[];
    }
    return this._proxy.pages as DocMeta[];
  }

  get docs() {
    return this._proxy.pages;
  }

  get yDocs() {
    return this._yMap.get('pages') as unknown as Y.Array<unknown>;
  }

  get docIds(): string[] {
    return this.docMetas.map(doc => doc.id);
  }

  constructor(doc: Y.Doc) {
    this._doc = doc;
    const map = doc.getMap(this._id) as Y.Map<
      SpaceMetaState[keyof SpaceMetaState]
    >;
    this._yMap = map;
    this._proxy = createYProxy(map);
    this._yMap.observeDeep(this._handleMetaEvents);
  }

  private _handleNameEvent() {
    this.nameUpdated.next();
  }

  private _handleDocMetaEvent() {
    const { docMetas, _prevDocs } = this;

    const newDocs = new Set<string>();

    docMetas.forEach(docMeta => {
      if (!_prevDocs.has(docMeta.id)) {
        this.docMetaAdded.next(docMeta.id);
      }
      newDocs.add(docMeta.id);
    });

    _prevDocs.forEach(prevDocId => {
      const isRemoved = newDocs.has(prevDocId) === false;
      if (isRemoved) {
        this.docMetaRemoved.next(prevDocId);
      }
    });

    this._prevDocs = newDocs;

    this.docMetaUpdated.next();
  }

  addDocMeta(doc: DocMeta, index?: number) {
    this._doc.transact(() => {
      if (!this.docs) {
        return;
      }
      const docs = this.docs as unknown[];
      if (index === undefined) {
        docs.push(doc);
      } else {
        docs.splice(index, 0, doc);
      }
    }, this._doc.clientID);
  }

  getDocMeta(id: string) {
    return this.docMetas.find(doc => doc.id === id);
  }

  initialize() {
    if (!this._proxy.pages) {
      this._proxy.pages = [];
    }
  }

  removeDocMeta(id: string) {
    if (!this.docs) {
      return;
    }

    const docMeta = this.docMetas;
    const index = docMeta.findIndex((doc: DocMeta) => id === doc.id);
    if (index === -1) {
      return;
    }
    this._doc.transact(() => {
      if (!this.docs) {
        return;
      }
      this.docs.splice(index, 1);
    }, this._doc.clientID);
  }

  setDocMeta(id: string, props: Partial<DocMeta>) {
    const docs = (this.docs as DocMeta[]) ?? [];
    const index = docs.findIndex((doc: DocMeta) => id === doc.id);

    this._doc.transact(() => {
      if (!this.docs) {
        return;
      }
      if (index === -1) return;

      const doc = this.docs[index] as Record<string, unknown>;
      Object.entries(props).forEach(([key, value]) => {
        doc[key] = value;
      });
    }, this._doc.clientID);
  }

  hasDoc(id: string): boolean {
    return this.docMetas.some(doc => doc.id === id);
  }
}
