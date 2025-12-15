import { Injectable } from '@nestjs/common';
import type { SpaceDoc } from '@prisma/client';

import { PaginationInput } from '../base';
import { BaseModel } from './base';

@Injectable()
export class SpaceDocModel extends BaseModel {
  /**
   * Add a doc to a space.
   */
  async addDoc(spaceId: string, docId: string) {
    const existing = await this.get(spaceId, docId);
    if (existing) {
      return existing;
    }

    const spaceDoc = await this.db.spaceDoc.create({
      data: {
        spaceId,
        docId,
      },
    });

    this.logger.log(`Doc [${docId}] added to space [${spaceId}]`);
    return spaceDoc;
  }

  /**
   * Remove a doc from a space.
   */
  async removeDoc(spaceId: string, docId: string) {
    await this.db.spaceDoc.deleteMany({
      where: {
        spaceId,
        docId,
      },
    });

    this.logger.log(`Doc [${docId}] removed from space [${spaceId}]`);
  }

  /**
   * Move a doc to a different space (or to workspace root if targetSpaceId is null).
   */
  async moveDoc(docId: string, targetSpaceId: string | null) {
    // Remove from all current spaces
    await this.db.spaceDoc.deleteMany({
      where: { docId },
    });

    // Add to new space if specified
    if (targetSpaceId) {
      await this.addDoc(targetSpaceId, docId);
    }

    this.logger.log(
      `Doc [${docId}] moved to ${targetSpaceId ? `space [${targetSpaceId}]` : 'workspace root'}`
    );
  }

  async get(spaceId: string, docId: string) {
    return await this.db.spaceDoc.findUnique({
      where: {
        spaceId_docId: {
          spaceId,
          docId,
        },
      },
    });
  }

  /**
   * Get the space that a doc belongs to.
   * Returns null if the doc is in the workspace root.
   */
  async getSpaceForDoc(docId: string) {
    return await this.db.spaceDoc.findFirst({
      where: { docId },
    });
  }

  /**
   * Get the space ID that a doc belongs to.
   * Returns null if the doc is in the workspace root.
   */
  async getSpaceId(docId: string): Promise<string | null> {
    const spaceDoc = await this.getSpaceForDoc(docId);
    return spaceDoc?.spaceId ?? null;
  }

  /**
   * Alias for addDoc - used by tests
   */
  async add(spaceId: string, docId: string) {
    return this.addDoc(spaceId, docId);
  }

  /**
   * Alias for getDocIds - used by tests
   */
  async list(spaceId: string) {
    return this.getDocIds(spaceId);
  }

  /**
   * Get all doc IDs in a space.
   */
  async getDocIds(spaceId: string) {
    const spaceDocs = await this.db.spaceDoc.findMany({
      where: { spaceId },
      select: { docId: true },
    });
    return spaceDocs.map(sd => sd.docId);
  }

  /**
   * Get all docs in a space with full SpaceDoc records.
   */
  async listDocs(spaceId: string) {
    return await this.db.spaceDoc.findMany({
      where: { spaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Check if a doc belongs to a space.
   */
  async isDocInSpace(spaceId: string, docId: string) {
    const spaceDoc = await this.get(spaceId, docId);
    return spaceDoc !== null;
  }

  count(spaceId: string) {
    return this.db.spaceDoc.count({
      where: { spaceId },
    });
  }

  async paginate(
    spaceId: string,
    pagination: PaginationInput
  ): Promise<[SpaceDoc[], number]> {
    return await Promise.all([
      this.db.spaceDoc.findMany({
        where: {
          spaceId,
          createdAt: pagination.after ? { gte: pagination.after } : undefined,
        },
        orderBy: { createdAt: 'asc' },
        take: pagination.first,
        skip: pagination.offset + (pagination.after ? 1 : 0),
      }),
      this.count(spaceId),
    ]);
  }
}
