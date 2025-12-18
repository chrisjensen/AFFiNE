import {
  Avatar,
  Button,
  Loading,
  Menu,
  MenuItem,
  MenuTrigger,
  notify,
  RowInput,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import {
  type Member,
  MemberSearchService,
} from '@affine/core/modules/permissions';
import { SpaceMembersService } from '@affine/core/modules/space';
import { DocRole } from '@affine/core/modules/space/stores/space';
import { UserFriendlyError } from '@affine/error';
import { WorkspaceMemberStatus } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { ArrowLeftBigIcon, CloseIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { debounce } from 'lodash-es';
import {
  type CompositionEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as styles from './member-picker.css';

const getRoleName = (role: DocRole, t: ReturnType<typeof useI18n>) => {
  switch (role) {
    case DocRole.Manager:
      return (
        t['com.affine.share-menu.option.permission.can-manage']?.() ||
        'Can manage'
      );
    case DocRole.Editor:
      return (
        t['com.affine.share-menu.option.permission.can-edit']?.() || 'Can edit'
      );
    case DocRole.Commenter:
      return (
        t['com.affine.share-menu.option.permission.can-comment']?.() ||
        'Can comment'
      );
    case DocRole.Reader:
      return (
        t['com.affine.share-menu.option.permission.can-read']?.() || 'Can read'
      );
    default:
      return '';
  }
};

export interface SpaceMemberPickerProps {
  onClose: () => void;
  onMembersAdded: () => void;
}

export const SpaceMemberPicker = ({
  onClose,
  onMembersAdded,
}: SpaceMemberPickerProps) => {
  const t = useI18n();
  const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
  const [inviteRole, setInviteRole] = useState<DocRole>(DocRole.Reader);
  const spaceMembersService = useService(SpaceMembersService);
  const memberSearchService = useService(MemberSearchService);

  useEffect(() => {
    memberSearchService.reset();
    memberSearchService.loadMore();
  }, [memberSearchService]);

  const debouncedSearch = useMemo(
    () => debounce((value: string) => memberSearchService.search(value), 300),
    [memberSearchService]
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [composing, setComposing] = useState(false);
  const [searchText, setSearchText] = useState('');

  const handleValueChange = useCallback(
    (value: string) => {
      setSearchText(value);
      if (!composing) {
        debouncedSearch(value);
      }
    },
    [composing, debouncedSearch]
  );

  const onAddMembers = useAsyncCallback(async () => {
    try {
      for (const member of selectedMembers) {
        await spaceMembersService.grantUserRole(member.id, inviteRole);
      }
      onMembersAdded();
      notify.success({
        title:
          selectedMembers.length === 1
            ? t['com.affine.space.memberAdded']?.() || 'Member added to space'
            : t['com.affine.space.membersAdded']?.() ||
              'Members added to space',
      });
    } catch (error) {
      const err = UserFriendlyError.fromAny(error);
      notify.error({
        title: t[`error.${err.name}`]?.(err.data) || err.message,
      });
    }
  }, [spaceMembersService, inviteRole, selectedMembers, onMembersAdded, t]);

  const handleCompositionStart: CompositionEventHandler<HTMLInputElement> =
    useCallback(() => {
      setComposing(true);
    }, []);

  const handleCompositionEnd: CompositionEventHandler<HTMLInputElement> =
    useCallback(
      e => {
        setComposing(false);
        debouncedSearch(e.currentTarget.value);
      },
      [debouncedSearch]
    );

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const onFocus = useCallback(() => {
    setFocused(true);
  }, []);

  const onBlur = useCallback(() => {
    setFocused(false);
  }, []);

  const handleRemoved = useCallback(
    (memberId: string) => {
      setSelectedMembers(prev => prev.filter(member => member.id !== memberId));
      focusInput();
    },
    [focusInput]
  );

  const handleClickMember = useCallback(
    (member: Member) => {
      setSelectedMembers(prev => {
        if (prev.some(m => m.id === member.id)) {
          return prev;
        }
        return [...prev, member];
      });
      setSearchText('');
      memberSearchService.search('');
      focusInput();
    },
    [focusInput, memberSearchService]
  );

  const handleRoleChange = useCallback((role: DocRole) => {
    setInviteRole(role);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header} onClick={onClose}>
        <ArrowLeftBigIcon className={styles.icon} />
        {t['com.affine.space.addMembers']?.() || 'Add members'}
      </div>
      <div className={styles.memberList}>
        <div
          className={clsx(styles.inputContainer, {
            focus: focused,
          })}
        >
          <div className={styles.inlineMembersContainer}>
            {selectedMembers.map(member => (
              <SelectedMemberChip
                key={member.id}
                member={member}
                onRemoved={() => handleRemoved(member.id)}
              />
            ))}
            <RowInput
              ref={inputRef}
              value={searchText}
              onChange={handleValueChange}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onFocus={onFocus}
              onBlur={onBlur}
              autoFocus
              className={styles.searchInput}
              placeholder={
                selectedMembers.length
                  ? ''
                  : t['com.affine.space.searchMembers']?.() ||
                    'Search workspace members...'
              }
            />
          </div>
          {selectedMembers.length > 0 && (
            <RoleSelector
              inviteRole={inviteRole}
              onRoleChange={handleRoleChange}
            />
          )}
        </div>
        <div className={styles.resultContainer}>
          <SearchResult
            onClickMember={handleClickMember}
            selectedMemberIds={selectedMembers.map(m => m.id)}
          />
        </div>
      </div>
      <div className={styles.footer}>
        <Button onClick={onClose}>{t['Cancel']?.() || 'Cancel'}</Button>
        <Button
          variant="primary"
          disabled={!selectedMembers.length}
          onClick={onAddMembers}
        >
          {t['com.affine.space.addToSpace']?.() || 'Add to space'}
        </Button>
      </div>
    </div>
  );
};

const SelectedMemberChip = ({
  member,
  onRemoved,
}: {
  member: Member;
  onRemoved: () => void;
}) => {
  return (
    <div className={styles.selectedMemberChip}>
      <Avatar
        url={member.avatarUrl ?? ''}
        name={member.name ?? undefined}
        size={20}
      />
      <span className={styles.selectedMemberName}>{member.name}</span>
      <button
        className={styles.removeButton}
        onClick={onRemoved}
        type="button"
        aria-label="Remove member"
      >
        <CloseIcon />
      </button>
    </div>
  );
};

const SearchResult = ({
  onClickMember,
  selectedMemberIds,
}: {
  onClickMember: (member: Member) => void;
  selectedMemberIds: string[];
}) => {
  const memberSearchService = useService(MemberSearchService);
  const searchText = useLiveData(memberSearchService.searchText$);
  const result = useLiveData(memberSearchService.result$);
  const isLoading = useLiveData(memberSearchService.isLoading$);
  const t = useI18n();

  const activeMembers = useMemo(() => {
    return result.filter(
      member =>
        member.status === WorkspaceMemberStatus.Accepted &&
        !selectedMemberIds.includes(member.id)
    );
  }, [result, selectedMemberIds]);

  const loadMore = useCallback(() => {
    memberSearchService.loadMore();
  }, [memberSearchService]);

  if (!searchText) {
    return (
      <div className={styles.noResults}>
        {t['com.affine.space.typeToSearch']?.() ||
          'Type to search workspace members'}
      </div>
    );
  }

  if (isLoading && activeMembers.length === 0) {
    return (
      <div className={styles.loadingContainer}>
        <Loading />
      </div>
    );
  }

  if (activeMembers.length === 0) {
    return (
      <div className={styles.noResults}>
        {t['com.affine.share-menu.invite-editor.no-found']?.() ||
          'No members found'}
      </div>
    );
  }

  return (
    <div className={styles.resultList} onScroll={loadMore}>
      {activeMembers.map(member => (
        <SearchResultItem
          key={member.id}
          member={member}
          onSelect={onClickMember}
        />
      ))}
    </div>
  );
};

const SearchResultItem = ({
  member,
  onSelect,
}: {
  member: Member;
  onSelect: (member: Member) => void;
}) => {
  const handleClick = useCallback(() => {
    onSelect(member);
  }, [member, onSelect]);

  return (
    <div
      className={styles.resultItem}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
      aria-label={`Select ${member.name}`}
    >
      <Avatar
        url={member.avatarUrl ?? ''}
        name={member.name ?? undefined}
        size={32}
      />
      <div className={styles.resultItemInfo}>
        <div className={styles.resultItemName}>{member.name}</div>
        <div className={styles.resultItemEmail}>{member.email}</div>
      </div>
    </div>
  );
};

const RoleSelector = ({
  inviteRole,
  onRoleChange,
}: {
  inviteRole: DocRole;
  onRoleChange: (role: DocRole) => void;
}) => {
  const t = useI18n();
  const currentRoleName = useMemo(
    () => getRoleName(inviteRole, t),
    [inviteRole, t]
  );

  const changeToManager = useCallback(
    () => onRoleChange(DocRole.Manager),
    [onRoleChange]
  );
  const changeToEditor = useCallback(
    () => onRoleChange(DocRole.Editor),
    [onRoleChange]
  );
  const changeToCommenter = useCallback(
    () => onRoleChange(DocRole.Commenter),
    [onRoleChange]
  );
  const changeToReader = useCallback(
    () => onRoleChange(DocRole.Reader),
    [onRoleChange]
  );

  return (
    <div className={styles.roleSelectorContainer}>
      <Menu
        contentOptions={{
          align: 'end',
        }}
        items={
          <>
            <MenuItem
              onSelect={changeToManager}
              selected={inviteRole === DocRole.Manager}
            >
              {t['com.affine.share-menu.option.permission.can-manage']?.() ||
                'Can manage'}
            </MenuItem>
            <MenuItem
              onSelect={changeToEditor}
              selected={inviteRole === DocRole.Editor}
            >
              {t['com.affine.share-menu.option.permission.can-edit']?.() ||
                'Can edit'}
            </MenuItem>
            <MenuItem
              onSelect={changeToCommenter}
              selected={inviteRole === DocRole.Commenter}
            >
              {t['com.affine.share-menu.option.permission.can-comment']?.() ||
                'Can comment'}
            </MenuItem>
            <MenuItem
              onSelect={changeToReader}
              selected={inviteRole === DocRole.Reader}
            >
              {t['com.affine.share-menu.option.permission.can-read']?.() ||
                'Can read'}
            </MenuItem>
          </>
        }
      >
        <MenuTrigger
          className={styles.menuTrigger}
          variant="plain"
          contentStyle={{
            width: '100%',
          }}
        >
          {currentRoleName}
        </MenuTrigger>
      </Menu>
    </div>
  );
};
