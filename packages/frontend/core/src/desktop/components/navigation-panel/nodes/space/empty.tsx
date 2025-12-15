import {
  type DropTargetDropEvent,
  type DropTargetOptions,
  useDropTarget,
} from '@affine/component';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';

import { EmptyNodeChildren } from '../../layouts/empty-node-children';

export const Empty = ({
  onDrop,
  canDrop,
}: {
  onDrop?: (data: DropTargetDropEvent<AffineDNDData>) => void;
  canDrop?: DropTargetOptions<AffineDNDData>['canDrop'];
}) => {
  const { dropTargetRef } = useDropTarget(
    () => ({
      onDrop,
      canDrop,
    }),
    [onDrop, canDrop]
  );

  const t = useI18n();
  return (
    <EmptyNodeChildren ref={dropTargetRef}>
      {t['com.affine.space.empty']()}
    </EmptyNodeChildren>
  );
};
