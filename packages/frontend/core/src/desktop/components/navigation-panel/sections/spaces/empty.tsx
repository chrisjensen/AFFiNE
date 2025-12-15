import { Button } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons/rc';

import { NavigationPanelEmptySection } from '../../layouts/empty-section';

export const RootEmpty = ({
  onClickCreate,
}: {
  onClickCreate?: () => void;
}) => {
  const t = useI18n();

  return (
    <NavigationPanelEmptySection
      icon={<FolderIcon />}
      message={t['com.affine.rootAppSidebar.spaces.empty']()}
      messageTestId="slider-bar-spaces-empty-message"
    >
      {onClickCreate && (
        <Button variant="secondary" onClick={onClickCreate}>
          {t['com.affine.rootAppSidebar.spaces.create']()}
        </Button>
      )}
    </NavigationPanelEmptySection>
  );
};
