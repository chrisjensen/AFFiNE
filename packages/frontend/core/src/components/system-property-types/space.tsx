import { Menu, MenuItem, type MenuRef, PropertyValue } from '@affine/component';
import {
  type IconData,
  IconRenderer,
  IconType,
} from '@affine/component/ui/icon-picker';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import type { Space } from '@affine/core/modules/space';
import { SpaceService } from '@affine/core/modules/space';
import { useI18n } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useCallback, useEffect, useMemo, useRef } from 'react';

// Helper to parse icon string to IconData for rendering
function parseIconData(icon: string | null | undefined): IconData | null {
  if (!icon) return null;
  // Try to parse as JSON (AffineIcon format)
  if (icon.startsWith('{')) {
    try {
      const parsed = JSON.parse(icon);
      if (parsed.type === 'affine-icon') {
        return {
          type: IconType.AffineIcon,
          name: parsed.name,
          color: parsed.color,
        };
      }
    } catch {
      // Not valid JSON, treat as emoji
    }
  }
  // Treat as emoji unicode
  return { type: IconType.Emoji, unicode: icon };
}

// Component to render the space icon
const SpaceIconDisplay = ({ icon }: { icon: string | null | undefined }) => {
  const iconData = useMemo(() => parseIconData(icon), [icon]);

  if (!iconData) {
    return <FolderIcon />;
  }

  return <IconRenderer data={iconData} />;
};

export const SpaceFilterValue = ({
  filter,
  isDraft,
  onDraftCompleted,
  onChange,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
  onChange: (filter: FilterParams) => void;
}) => {
  const t = useI18n();
  const spaceService = useService(SpaceService);
  const spaces = useLiveData(spaceService.spacesList$);
  const menuRef = useRef<MenuRef>(null);

  useEffect(() => {
    if (isDraft) {
      menuRef.current?.changeOpen(true);
    }
  }, [isDraft]);

  const selectedSpaceIds = useMemo(
    () =>
      filter.value
        ?.split(',')
        .filter(id => spaces.some(space => space.id === id)) ?? [],
    [filter, spaces]
  );

  const selectedSpaces = useMemo(
    () => spaces.filter(space => selectedSpaceIds.includes(space.id)),
    [spaces, selectedSpaceIds]
  );

  const handleSelectSpace = useCallback(
    (spaceId: string) => {
      onChange({
        ...filter,
        value: [...selectedSpaceIds, spaceId].join(','),
      });
    },
    [filter, onChange, selectedSpaceIds]
  );

  const handleDeselectSpace = useCallback(
    (spaceId: string) => {
      onChange({
        ...filter,
        value: selectedSpaceIds.filter(id => id !== spaceId).join(','),
      });
    },
    [filter, onChange, selectedSpaceIds]
  );

  useEffect(() => {
    if (
      isDraft &&
      (filter.method === 'is-not-empty' || filter.method === 'is-empty')
    ) {
      onDraftCompleted?.();
    }
  }, [isDraft, filter.method, onDraftCompleted]);

  if (filter.method === 'is-not-empty' || filter.method === 'is-empty') {
    return null;
  }

  return (
    <Menu
      ref={menuRef}
      items={
        <>
          {spaces.map(space => {
            const isSelected = selectedSpaceIds.includes(space.id);
            return (
              <SpaceFilterMenuItem
                key={space.id}
                space={space}
                isSelected={isSelected}
                onSelect={() => handleSelectSpace(space.id)}
                onDeselect={() => handleDeselectSpace(space.id)}
              />
            );
          })}
          {spaces.length === 0 && (
            <MenuItem disabled>
              {t['com.affine.space.no-spaces']?.() ?? 'No spaces available'}
            </MenuItem>
          )}
        </>
      }
      contentOptions={{
        onPointerDownOutside: onDraftCompleted,
        onEscapeKeyDown: onDraftCompleted,
      }}
    >
      <PropertyValue isEmpty={selectedSpaces.length === 0}>
        {selectedSpaces.length === 0 ? (
          <span style={{ color: cssVarV2('text/placeholder') }}>
            {t['com.affine.filter.empty']?.() ?? 'Select spaces...'}
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {selectedSpaces.map(space => (
              <SpaceChip key={space.id} space={space} />
            ))}
          </span>
        )}
      </PropertyValue>
    </Menu>
  );
};

const SpaceName = ({ space }: { space: Space }) => {
  const name = useLiveData(space.name$);
  return <>{name}</>;
};

const SpaceFilterMenuItem = ({
  space,
  isSelected,
  onSelect,
  onDeselect,
}: {
  space: Space;
  isSelected: boolean;
  onSelect: () => void;
  onDeselect: () => void;
}) => {
  const icon = useLiveData(space.icon$);
  return (
    <MenuItem
      prefixIcon={<SpaceIconDisplay icon={icon} />}
      selected={isSelected}
      onClick={() => {
        if (isSelected) {
          onDeselect();
        } else {
          onSelect();
        }
      }}
    >
      <SpaceName space={space} />
    </MenuItem>
  );
};

const SpaceChip = ({ space }: { space: Space }) => {
  const name = useLiveData(space.name$);
  const icon = useLiveData(space.icon$);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '4px',
        backgroundColor: cssVarV2('layer/background/secondary'),
        fontSize: '12px',
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SpaceIconDisplay icon={icon} />
      </span>
      {name}
    </span>
  );
};
