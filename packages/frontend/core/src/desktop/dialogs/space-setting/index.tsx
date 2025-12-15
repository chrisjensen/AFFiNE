import { Button, Input, Modal, RadioGroup } from '@affine/component';
import type { DialogComponentProps } from '@affine/core/modules/dialogs';
import type { WORKSPACE_DIALOG_SCHEMA } from '@affine/core/modules/dialogs/constant';
import { type Space, SpaceService } from '@affine/core/modules/space';
import { DocRole } from '@affine/core/modules/space/stores/space';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import * as styles from './style.css';

type TabType = 'general' | 'members';

const ROLE_OPTIONS = [
  {
    value: DocRole.Reader,
    label: 'Reader',
    description: 'Can view documents in this space',
  },
  {
    value: DocRole.Commenter,
    label: 'Commenter',
    description: 'Can view and comment on documents',
  },
  {
    value: DocRole.Editor,
    label: 'Editor',
    description: 'Can view, comment, and edit documents',
  },
  {
    value: DocRole.External,
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
  const spaceService = useService(SpaceService);

  const currentName = useLiveData(space.name$);
  const currentDescription = useLiveData(space.description$);
  const currentDefaultRole = useLiveData(space.defaultRole$);

  const [name, setName] = useState(currentName || '');
  const [description, setDescription] = useState(currentDescription || '');
  const [defaultRole, setDefaultRole] = useState<DocRole>(
    currentDefaultRole ?? DocRole.Reader
  );
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges =
    name !== currentName ||
    description !== (currentDescription || '') ||
    defaultRole !== currentDefaultRole;

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
      if (defaultRole !== currentDefaultRole) {
        await space.updateDefaultRole(defaultRole);
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
    defaultRole,
    currentDefaultRole,
    space,
    onClose,
  ]);

  const handleDelete = useCallback(async () => {
    if (
      window.confirm(
        t['com.affine.space.deleteConfirm']?.() ||
          'Are you sure you want to delete this space? This action cannot be undone.'
      )
    ) {
      await spaceService.deleteSpace(space.id);
      onClose();
    }
  }, [space, spaceService, onClose, t]);

  return (
    <div className={styles.section}>
      <div className={styles.inputWrapper}>
        <label className={styles.label}>
          {t['com.affine.space.name']?.() || 'Space Name'}
        </label>
        <Input
          className={styles.input}
          value={name}
          onChange={setName}
          placeholder={
            t['com.affine.space.name.placeholder']?.() || 'Enter space name'
          }
          data-testid="space-name-input"
        />
      </div>

      <div className={styles.inputWrapper}>
        <label className={styles.label}>
          {t['com.affine.space.description']?.() || 'Description'}
        </label>
        <Input
          className={styles.textarea}
          value={description}
          onChange={setDescription}
          placeholder={
            t['com.affine.space.description.placeholder']?.() ||
            'Enter space description (optional)'
          }
          data-testid="space-description-input"
        />
      </div>

      <div className={styles.inputWrapper}>
        <label className={styles.label}>
          {t['com.affine.space.defaultRole']?.() ||
            'Default Role for Workspace Members'}
        </label>
        <div className={styles.roleSelector}>
          {ROLE_OPTIONS.map(option => (
            <div
              key={option.value}
              className={styles.roleOption}
              data-selected={defaultRole === option.value}
              onClick={() => setDefaultRole(option.value)}
            >
              <RadioGroup
                value={String(defaultRole)}
                onChange={(value: string) =>
                  setDefaultRole(Number(value) as DocRole)
                }
                items={[{ value: String(option.value), label: '' }]}
              />
              <div className={styles.roleInfo}>
                <span className={styles.roleName}>{option.label}</span>
                <span className={styles.roleDescription}>
                  {option.description}
                </span>
              </div>
            </div>
          ))}
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

      <div className={styles.dangerZone}>
        <div className={styles.dangerTitle}>
          {t['com.affine.space.dangerZone']?.() || 'Danger Zone'}
        </div>
        <div className={styles.dangerDescription}>
          {t['com.affine.space.deleteDescription']?.() ||
            'Deleting this space will remove all permission settings. Documents will remain in the workspace but will no longer be grouped.'}
        </div>
        <Button variant="error" onClick={() => void handleDelete()}>
          {t['com.affine.space.delete']?.() || 'Delete Space'}
        </Button>
      </div>
    </div>
  );
};

const MembersTab = ({ space: _space }: { space: Space }) => {
  const t = useI18n();
  // space parameter reserved for future member management implementation

  // For now, show a placeholder since member management
  // requires additional API integration
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>
        {t['com.affine.space.members']?.() || 'Members'}
      </div>
      <div className={styles.memberList}>
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            color: 'var(--affine-text-secondary-color)',
          }}
        >
          {t['com.affine.space.membersComingSoon']?.() ||
            'Member management coming soon. Use the default role setting to control access for workspace members.'}
        </div>
      </div>
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
            data-active={activeTab === 'members'}
            onClick={() => setActiveTab('members')}
          >
            {t['com.affine.space.members']?.() || 'Members'}
          </div>
        </div>

        {activeTab === 'general' && (
          <GeneralTab space={space} onClose={onCancel} />
        )}
        {activeTab === 'members' && <MembersTab space={space} />}
      </div>
    </Modal>
  );
};
