import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
  gap: '12px',
  height: '100%',
  flex: 1,
  overflow: 'hidden',
});

export const header = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  cursor: 'pointer',
  gap: '8px',
  paddingBottom: '12px',
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
});

export const icon = style({
  fontSize: '20px',
  color: cssVarV2('icon/primary'),
});

export const memberList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  flex: 1,
  overflow: 'hidden',
});

export const inputContainer = style({
  display: 'flex',
  gap: '4px',
  borderRadius: '8px',
  padding: '8px',
  flexWrap: 'wrap',
  width: '100%',
  border: `1px solid ${cssVarV2('input/border/default')}`,
  alignItems: 'center',

  selectors: {
    '&.focus': {
      borderColor: cssVarV2('input/border/active'),
    },
  },
});

export const inlineMembersContainer = style({
  display: 'flex',
  flexWrap: 'wrap',
  flex: 1,
  gap: '4px',
  maxHeight: '80px',
  overflowY: 'auto',
  alignItems: 'center',
});

export const searchInput = style({
  flexGrow: 1,
  minWidth: 100,
  border: 'none',
  outline: 'none',
  fontSize: cssVar('fontSm'),
  fontFamily: 'inherit',
  color: 'inherit',
  backgroundColor: 'transparent',
  '::placeholder': {
    color: cssVarV2('text/placeholder'),
  },
});

export const selectedMemberChip = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 4px 2px 2px',
  borderRadius: '4px',
  backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  fontSize: cssVar('fontXs'),
});

export const selectedMemberName = style({
  maxWidth: 100,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const removeButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  color: cssVarV2('icon/secondary'),
  padding: 0,
  borderRadius: '2px',
  ':hover': {
    color: cssVarV2('icon/primary'),
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  },
});

export const roleSelectorContainer = style({
  flexShrink: 0,
});

export const menuTrigger = style({
  padding: '4px 8px',
  gap: '4px',
  borderRadius: '4px',
  display: 'flex',
  fontSize: cssVar('fontSm'),
  fontWeight: 400,
});

export const resultContainer = style({
  flex: 1,
  minHeight: '150px',
  maxHeight: '300px',
  overflow: 'hidden',
});

export const resultList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  maxHeight: '100%',
  overflowY: 'auto',
});

export const resultItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px',
  borderRadius: '8px',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  },
});

export const resultItemInfo = style({
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});

export const resultItemName = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  color: cssVarV2('text/primary'),
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const resultItemEmail = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const noResults = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/secondary'),
});

export const loadingContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
});

export const footer = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  paddingTop: '12px',
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});
