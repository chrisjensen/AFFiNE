import { Input } from '@affine/component';
import type { ConfirmModalProps } from '@affine/component/ui/modal';
import { ConfirmModal } from '@affine/component/ui/modal';
import { useI18n } from '@affine/i18n';
import { useCallback, useState } from 'react';

import * as styles from './style.css';

interface SpaceDeleteModalProps extends ConfirmModalProps {
  spaceName: string;
  onConfirm?: () => void;
}

export const SpaceDeleteModal = ({
  spaceName,
  onConfirm,
  ...props
}: SpaceDeleteModalProps) => {
  const [deleteStr, setDeleteStr] = useState<string>('');
  const allowDelete = deleteStr === spaceName;
  const t = useI18n();

  const handleOnEnter = useCallback(() => {
    if (allowDelete) {
      onConfirm?.();
    }
  }, [allowDelete, onConfirm]);

  const handleConfirm = useCallback(() => {
    if (allowDelete) {
      onConfirm?.();
    }
  }, [allowDelete, onConfirm]);

  return (
    <ConfirmModal
      title={t['com.affine.space.deleteConfirmTitle']?.() || 'Delete Space?'}
      cancelText={t['Cancel']()}
      confirmText={t['Delete']?.() || 'Delete'}
      confirmButtonOptions={{
        variant: 'error',
        disabled: !allowDelete,
        'data-testid': 'delete-space-confirm-button',
      }}
      onConfirm={handleConfirm}
      {...props}
    >
      <div className={styles.deleteModalContent}>
        <p className={styles.deleteModalDescription}>
          {t['com.affine.space.deleteConfirmDescription']?.() ||
            `Deleting this space will remove all permission settings. Documents will remain in the workspace but will no longer be grouped. This action cannot be undone.`}
        </p>
        <p className={styles.deleteModalInstruction}>
          {t['com.affine.space.deleteConfirmInstruction']?.() ||
            `Type "${spaceName}" to confirm:`}
        </p>
        <Input
          autoFocus
          value={deleteStr}
          onChange={setDeleteStr}
          data-testid="delete-space-input"
          onEnter={handleOnEnter}
          placeholder={spaceName}
          size="large"
        />
      </div>
    </ConfirmModal>
  );
};
