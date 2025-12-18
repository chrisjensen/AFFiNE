import {
  Avatar,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  notify,
  Tooltip,
  useConfirmModal,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { SpaceMembersService } from '@affine/core/modules/space';
import type { SpaceMember } from '@affine/core/modules/space/stores/space';
import { DocRole } from '@affine/core/modules/space/stores/space';
import { UserFriendlyError } from '@affine/error';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useMemo } from 'react';

import * as styles from './member-item.css';

export interface SpaceMemberItemProps {
  member: SpaceMember;
  canManageUsers: boolean;
  canTransferOwner: boolean;
}

export const SpaceMemberItem = ({
  member,
  canManageUsers,
  canTransferOwner,
}: SpaceMemberItemProps) => {
  const user = member.user;
  const disableManage = member.role === DocRole.Owner || !canManageUsers;

  const role = useMemo(() => {
    switch (member.role) {
      case DocRole.Owner:
        return 'Owner';
      case DocRole.Manager:
        return 'Can manage';
      case DocRole.Editor:
        return 'Can edit';
      case DocRole.Commenter:
        return 'Can comment';
      case DocRole.Reader:
        return 'Can read';
      default:
        return 'No access';
    }
  }, [member.role]);

  return (
    <div className={styles.memberItemStyle}>
      <div className={styles.memberContainerStyle}>
        <Avatar
          key={user.id}
          url={user.avatarUrl || ''}
          name={user.name}
          size={36}
        />
        <div className={styles.memberInfoStyle}>
          <Tooltip
            content={user.name}
            rootOptions={{ delayDuration: 1000 }}
            options={{
              className: styles.tooltipContentStyle,
            }}
          >
            <div className={styles.memberNameStyle}>{user.name}</div>
          </Tooltip>
          <Tooltip
            content={user.email}
            rootOptions={{ delayDuration: 1000 }}
            options={{
              className: styles.tooltipContentStyle,
            }}
          >
            <div className={styles.memberEmailStyle}>{user.email}</div>
          </Tooltip>
        </div>
      </div>
      {disableManage ? (
        <div className={clsx(styles.memberRoleStyle, 'disable')}>{role}</div>
      ) : (
        <Menu
          items={
            <MemberOptions
              userId={user.id}
              memberRole={member.role}
              canManageUsers={canManageUsers}
              canTransferOwner={canTransferOwner}
            />
          }
          contentOptions={{
            align: 'end',
          }}
        >
          <MenuTrigger
            variant="plain"
            className={styles.menuTriggerStyle}
            contentStyle={{
              width: '100%',
            }}
          >
            {role}
          </MenuTrigger>
        </Menu>
      )}
    </div>
  );
};

const MemberOptions = ({
  memberRole,
  userId,
  canManageUsers,
  canTransferOwner,
}: {
  userId: string;
  memberRole: DocRole;
  canManageUsers: boolean;
  canTransferOwner: boolean;
}) => {
  const t = useI18n();
  const spaceMembersService = useService(SpaceMembersService);
  const { openConfirmModal } = useConfirmModal();

  const updateUserRole = useCallback(
    async (userId: string, role: DocRole) => {
      try {
        const res = await spaceMembersService.updateMemberRole(userId, role);
        if (res) {
          notify.success({
            title:
              t['com.affine.space.memberRoleUpdated']?.() ||
              'Member role updated',
          });
        } else {
          notify.error({
            title:
              t['com.affine.space.memberUpdateFailed']?.() ||
              'Failed to update member role',
          });
        }
      } catch (error) {
        const err = UserFriendlyError.fromAny(error);
        notify.error({
          title: t[`error.${err.name}`]?.(err.data) || err.message,
        });
      }
    },
    [spaceMembersService, t]
  );

  const changeToManager = useAsyncCallback(async () => {
    await updateUserRole(userId, DocRole.Manager);
  }, [updateUserRole, userId]);

  const changeToEditor = useAsyncCallback(async () => {
    await updateUserRole(userId, DocRole.Editor);
  }, [updateUserRole, userId]);

  const changeToCommenter = useAsyncCallback(async () => {
    await updateUserRole(userId, DocRole.Commenter);
  }, [updateUserRole, userId]);

  const changeToReader = useAsyncCallback(async () => {
    await updateUserRole(userId, DocRole.Reader);
  }, [updateUserRole, userId]);

  const changeToOwner = useAsyncCallback(async () => {
    await updateUserRole(userId, DocRole.Owner);
  }, [updateUserRole, userId]);

  const openTransferOwnerModal = useCallback(() => {
    openConfirmModal({
      title:
        t['com.affine.space.transferOwnerConfirm']?.() ||
        'Transfer space ownership?',
      description:
        t['com.affine.space.transferOwnerDescription']?.() ||
        'You will lose owner privileges and become a manager of this space.',
      onConfirm: changeToOwner,
      confirmText: t['Confirm']?.() || 'Confirm',
      confirmButtonOptions: {
        variant: 'primary',
      },
      cancelText: t['Cancel']?.() || 'Cancel',
    });
  }, [changeToOwner, openConfirmModal, t]);

  const removeMember = useAsyncCallback(async () => {
    try {
      await spaceMembersService.removeMember(userId);
      notify.success({
        title:
          t['com.affine.space.memberRemoved']?.() ||
          'Member removed from space',
      });
    } catch (error) {
      const err = UserFriendlyError.fromAny(error);
      notify.error({
        title: t[`error.${err.name}`]?.(err.data) || err.message,
      });
    }
  }, [spaceMembersService, userId, t]);

  const openRemoveMemberModal = useCallback(() => {
    openConfirmModal({
      title:
        t['com.affine.space.removeMemberConfirm']?.() ||
        'Remove member from space?',
      description:
        t['com.affine.space.removeMemberDescription']?.() ||
        "This member will lose their explicit role in this space. They may still have access through the space's default role.",
      onConfirm: removeMember,
      confirmText: t['Remove']?.() || 'Remove',
      confirmButtonOptions: {
        variant: 'error',
      },
      cancelText: t['Cancel']?.() || 'Cancel',
    });
  }, [openConfirmModal, removeMember, t]);

  const operationButtonInfo = useMemo(() => {
    return [
      {
        label:
          t['com.affine.share-menu.option.permission.can-manage']?.() ||
          'Can manage',
        onClick: changeToManager,
        role: DocRole.Manager,
      },
      {
        label:
          t['com.affine.share-menu.option.permission.can-edit']?.() ||
          'Can edit',
        onClick: changeToEditor,
        role: DocRole.Editor,
      },
      {
        label:
          t['com.affine.share-menu.option.permission.can-comment']?.() ||
          'Can comment',
        onClick: changeToCommenter,
        role: DocRole.Commenter,
      },
      {
        label:
          t['com.affine.share-menu.option.permission.can-read']?.() ||
          'Can read',
        onClick: changeToReader,
        role: DocRole.Reader,
      },
    ];
  }, [changeToEditor, changeToManager, changeToCommenter, changeToReader, t]);

  return (
    <>
      {operationButtonInfo.map(item => (
        <MenuItem
          key={item.label}
          onSelect={item.onClick}
          selected={memberRole === item.role}
          disabled={!canManageUsers}
        >
          {item.label}
        </MenuItem>
      ))}
      <MenuItem onSelect={openTransferOwnerModal} disabled={!canTransferOwner}>
        {t['com.affine.space.setAsOwner']?.() || 'Set as owner'}
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        onSelect={openRemoveMemberModal}
        type="danger"
        className={styles.remove}
        disabled={!canManageUsers}
      >
        {t['com.affine.space.removeMember']?.() || 'Remove'}
      </MenuItem>
    </>
  );
};
