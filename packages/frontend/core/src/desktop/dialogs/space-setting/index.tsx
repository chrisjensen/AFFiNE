import {
  Button,
  Input,
  Loading,
  Menu,
  MenuItem,
  MenuTrigger,
  Modal,
} from '@affine/component';
import {
  type IconData,
  IconPicker,
  IconRenderer,
  IconType,
} from '@affine/component/ui/icon-picker';
import type { DialogComponentProps } from '@affine/core/modules/dialogs';
import type { WORKSPACE_DIALOG_SCHEMA } from '@affine/core/modules/dialogs/constant';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import {
  type Space,
  SpaceMembersService,
  SpaceService,
} from '@affine/core/modules/space';
import {
  DocRole,
  type SpaceIconData,
} from '@affine/core/modules/space/stores/space';
import { useI18n } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SpaceDeleteModal } from './delete-space-modal';
import { SpaceMemberItem } from './member-item';
import { SpaceMemberPicker } from './member-picker';
import * as styles from './style.css';

type TabType = 'general' | 'access' | 'danger';

const ROLE_OPTIONS = [
  {
    value: DocRole.Manager,
    label: 'Manager',
    description: 'Can manage space settings and members',
  },
  {
    value: DocRole.Editor,
    label: 'Editor',
    description: 'Can view, comment, and edit documents',
  },
  {
    value: DocRole.Commenter,
    label: 'Commenter',
    description: 'Can view and comment on documents',
  },
  {
    value: DocRole.Reader,
    label: 'Reader',
    description: 'Can view documents in this space',
  },
  {
    value: DocRole.None,
    label: 'No Access',
    description: 'Must be explicitly invited to access',
  },
];

const GeneralTab = ({
  space,
  onClose,
}: {
  space: Space;
  onClose: () => void;
}) => {
  const t = useI18n();

  const currentName = useLiveData(space.name$);
  const currentDescription = useLiveData(space.description$);
  const currentIcon = useLiveData(space.icon$);
  const currentDefaultRole = useLiveData(space.defaultRole$);

  const [name, setName] = useState(currentName || '');
  const [description, setDescription] = useState(currentDescription || '');
  const [icon, setIcon] = useState<SpaceIconData>(currentIcon ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  // Track if state has been initialized from LiveData
  const hasInitialized = useRef(false);
  useEffect(() => {
    // Only sync once when LiveData values become available
    if (!hasInitialized.current && currentName !== undefined) {
      hasInitialized.current = true;
      setName(currentName || '');
      setDescription(currentDescription || '');
      setIcon(currentIcon ?? null);
    }
  }, [currentName, currentDescription, currentIcon]);

  // Compare icon objects by JSON stringification
  const iconChanged = JSON.stringify(icon) !== JSON.stringify(currentIcon);
  const hasChanges =
    name !== currentName ||
    description !== (currentDescription || '') ||
    iconChanged;

  const handleIconSelect = useCallback((data?: IconData) => {
    if (!data) {
      setIcon(null);
    } else if (data.type === IconType.Emoji) {
      // Store emoji as JSON object
      setIcon({ type: 'emoji', unicode: data.unicode });
    } else if (data.type === IconType.AffineIcon) {
      // Store AffineIcon as JSON object
      setIcon({
        type: 'affine-icon',
        name: data.name,
        color: data.color,
      });
    }
    // Note: IconType.Blob requires upload infrastructure, not supported for spaces yet
    setIconPickerOpen(false);
  }, []);

  // Convert SpaceIconData to IconData for rendering
  const iconData = useMemo((): IconData | null => {
    if (!icon) return null;
    if (icon.type === 'emoji') {
      return { type: IconType.Emoji, unicode: icon.unicode };
    } else if (icon.type === 'affine-icon') {
      return {
        type: IconType.AffineIcon,
        name: icon.name,
        color: icon.color,
      };
    }
    return null;
  }, [icon]);

  const handleSave = useCallback(async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    try {
      if (name !== currentName) {
        await space.rename(name);
      }
      if (description !== (currentDescription || '')) {
        await space.updateDescription(description);
      }
      if (iconChanged) {
        await space.updateIcon(icon);
      }
      onClose();
    } catch (error) {
      console.error('Failed to save space settings:', error);
    } finally {
      setIsSaving(false);
    }
  }, [
    hasChanges,
    name,
    currentName,
    description,
    currentDescription,
    icon,
    iconChanged,
    space,
    onClose,
  ]);

  return (
    <div className={styles.section}>
      <div className={styles.sectionContent}>
        <div className={styles.inputWrapper}>
          <label className={styles.label}>
            {t['com.affine.space.name']?.() || 'Space Name'}
          </label>
          <div className={styles.iconNameRow}>
            <Menu
              rootOptions={{
                open: iconPickerOpen,
                onOpenChange: setIconPickerOpen,
              }}
              contentOptions={{
                side: 'bottom',
                align: 'start',
                sideOffset: 8,
              }}
              items={
                <div onWheel={e => e.stopPropagation()}>
                  <IconPicker onSelect={handleIconSelect} />
                </div>
              }
            >
              <button
                className={styles.iconPickerButton}
                aria-label={
                  t['com.affine.space.icon.select']?.() || 'Select space icon'
                }
                title={
                  t['com.affine.space.icon.select']?.() || 'Select space icon'
                }
              >
                {iconData ? (
                  <IconRenderer data={iconData} />
                ) : (
                  <FolderIcon className={styles.iconPlaceholder} />
                )}
              </button>
            </Menu>
            <div className={styles.nameInputWrapper}>
              <Input
                className={styles.input}
                value={name}
                onChange={setName}
                placeholder={
                  t['com.affine.space.name.placeholder']?.() ||
                  'Enter space name'
                }
                data-testid="space-name-input"
              />
            </div>
          </div>
        </div>

        <div className={styles.inputWrapper}>
          <label className={styles.label}>
            {t['com.affine.space.description']?.() || 'Description'}
          </label>
          <textarea
            className={styles.textarea}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={
              t['com.affine.space.description.placeholder']?.() ||
              'Enter space description (optional)'
            }
            data-testid="space-description-input"
            rows={3}
          />
        </div>
      </div>

      <div className={styles.footer}>
        <Button variant="secondary" onClick={onClose}>
          {t['Cancel']()}
        </Button>
        <Button
          variant="primary"
          onClick={() => void handleSave()}
          disabled={!hasChanges || isSaving}
        >
          {isSaving
            ? t['com.affine.saving']?.() || 'Saving...'
            : t['Save']?.() || 'Save'}
        </Button>
      </div>
    </div>
  );
};

const AccessTab = ({ space }: { space: Space }) => {
  const t = useI18n();
  const spaceMembersService = useService(SpaceMembersService);
  const workspacePermissionService = useService(WorkspacePermissionService);
  const [showAddMember, setShowAddMember] = useState(false);

  const members = useLiveData(spaceMembersService.members$);
  const memberCount = useLiveData(spaceMembersService.memberCount$);
  const isLoading = useLiveData(spaceMembersService.isLoading$);
  const hasMore = useLiveData(spaceMembersService.hasMore$);
  const currentDefaultRole = useLiveData(space.defaultRole$);

  const isWorkspaceOwner = useLiveData(
    workspacePermissionService.permission.isOwner$
  );
  const isWorkspaceAdmin = useLiveData(
    workspacePermissionService.permission.isAdmin$
  );

  // Determine user permissions - workspace owners/admins can manage space members
  const canManageUsers = Boolean(isWorkspaceOwner || isWorkspaceAdmin);
  const canTransferOwner = Boolean(isWorkspaceOwner);

  const selectedRoleOption =
    ROLE_OPTIONS.find(opt => opt.value === currentDefaultRole) ||
    ROLE_OPTIONS[3]; // Default to Reader if not found

  const handleDefaultRoleChange = useCallback(
    async (role: DocRole) => {
      if (role !== currentDefaultRole) {
        try {
          await space.updateDefaultRole(role);
        } catch (error) {
          console.error('Failed to update default role:', error);
        }
      }
    },
    [space, currentDefaultRole]
  );

  useEffect(() => {
    spaceMembersService.setSpace(space.id);
    spaceMembersService.loadMore();
  }, [spaceMembersService, space.id]);

  const handleAddMemberClick = useCallback(() => {
    setShowAddMember(true);
  }, []);

  const handleMembersAdded = useCallback(() => {
    setShowAddMember(false);
    spaceMembersService.reset();
    spaceMembersService.loadMore();
  }, [spaceMembersService]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      spaceMembersService.loadMore();
    }
  }, [hasMore, isLoading, spaceMembersService]);

  const menuItems = useMemo(() => {
    return ROLE_OPTIONS.map(option => (
      <MenuItem
        key={option.value}
        onSelect={() => void handleDefaultRoleChange(option.value)}
      >
        <div className={styles.roleMenuItem}>
          <div className={styles.roleName}>{option.label}</div>
          <div className={styles.roleDescription}>{option.description}</div>
        </div>
      </MenuItem>
    ));
  }, [handleDefaultRoleChange]);

  if (showAddMember) {
    return (
      <div className={styles.section}>
        <SpaceMemberPicker
          onClose={() => setShowAddMember(false)}
          onMembersAdded={handleMembersAdded}
        />
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionContent}>
        <div className={styles.inputWrapper}>
          <label className={styles.label}>
            {'Default Access for All Workspace members'}
          </label>
          <Menu items={menuItems}>
            <MenuTrigger
              variant="plain"
              className={styles.dropdownTrigger}
              contentStyle={{
                width: '100%',
              }}
            >
              {selectedRoleOption.label}
            </MenuTrigger>
          </Menu>
        </div>

        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            {'Members with Special Access'}
            {memberCount > 0 && ` (${memberCount})`}
          </div>
          {canManageUsers && (
            <Button variant="primary" onClick={handleAddMemberClick}>
              {t['com.affine.space.addMember']?.() || 'Add Member'}
            </Button>
          )}
        </div>

        <div className={styles.memberList}>
          {isLoading && members.length === 0 ? (
            <div className={styles.loadingContainer}>
              <Loading />
            </div>
          ) : members.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateTitle}>
                {t['com.affine.space.noMembers']?.() ||
                  'No members with explicit roles'}
              </div>
              <div className={styles.emptyStateDescription}>
                {t['com.affine.space.noMembersDescription']?.() ||
                  'All workspace members have access through the default role. Add members to give them specific permissions.'}
              </div>
            </div>
          ) : (
            <>
              {members.map(member => (
                <SpaceMemberItem
                  key={member.user.id}
                  member={member}
                  canManageUsers={canManageUsers}
                  canTransferOwner={canTransferOwner}
                />
              ))}
              {hasMore && (
                <Button
                  variant="plain"
                  onClick={handleLoadMore}
                  disabled={isLoading}
                  className={styles.loadMoreButton}
                >
                  {isLoading
                    ? t['Loading']?.() || 'Loading...'
                    : t['com.affine.space.loadMore']?.() || 'Load more'}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const DangerZoneTab = ({
  space,
  onClose,
}: {
  space: Space;
  onClose: () => void;
}) => {
  const t = useI18n();
  const spaceService = useService(SpaceService);
  const spaceName = useLiveData(space.name$) || '';
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleDelete = useCallback(async () => {
    await spaceService.deleteSpace(space.id);
    setShowDeleteModal(false);
    onClose();
  }, [space, spaceService, onClose]);

  return (
    <div className={styles.section}>
      <div className={styles.dangerZone}>
        <div className={styles.dangerTitle}>
          {t['com.affine.space.deleteSpace']?.() || 'Delete Space'}
        </div>
        <div className={styles.dangerDescription}>
          {t['com.affine.space.deleteDescription']?.() ||
            'Deleting this space will remove all permission settings. Documents will remain in the workspace but will no longer be grouped.'}
        </div>
        <Button
          variant="error"
          onClick={() => setShowDeleteModal(true)}
          data-testid="delete-space-button"
        >
          {t['com.affine.space.delete']?.() || 'Delete Space'}
        </Button>
      </div>

      <SpaceDeleteModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        spaceName={spaceName}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
};

export const SpaceSettingDialog = ({
  close,
  spaceId,
}: DialogComponentProps<WORKSPACE_DIALOG_SCHEMA['space-setting']>) => {
  const t = useI18n();
  const spaceService = useService(SpaceService);
  const space = useLiveData(spaceService.space$(spaceId));
  const [activeTab, setActiveTab] = useState<TabType>('general');

  const onCancel = useCallback(() => {
    close();
  }, [close]);

  if (!space) {
    return null;
  }

  return (
    <Modal
      open
      onOpenChange={onCancel}
      width={520}
      contentOptions={{
        style: {
          padding: 0,
          backgroundColor: 'var(--affine-background-primary-color)',
        },
      }}
    >
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.title}>
            {t['com.affine.space.settings']?.() || 'Space Settings'}
          </span>
        </div>

        <div className={styles.tabs}>
          <div
            className={styles.tab}
            data-active={activeTab === 'general'}
            onClick={() => setActiveTab('general')}
          >
            {t['com.affine.space.general']?.() || 'General'}
          </div>
          <div
            className={styles.tab}
            data-active={activeTab === 'access'}
            onClick={() => setActiveTab('access')}
          >
            {'Access'}
          </div>
          <div
            className={styles.tab}
            data-active={activeTab === 'danger'}
            data-danger="true"
            onClick={() => setActiveTab('danger')}
          >
            {t['com.affine.space.dangerZone']?.() || 'Danger Zone'}
          </div>
        </div>

        {activeTab === 'general' && (
          <GeneralTab space={space} onClose={onCancel} />
        )}
        {activeTab === 'access' && <AccessTab space={space} />}
        {activeTab === 'danger' && (
          <DangerZoneTab space={space} onClose={onCancel} />
        )}
      </div>
    </Modal>
  );
};
