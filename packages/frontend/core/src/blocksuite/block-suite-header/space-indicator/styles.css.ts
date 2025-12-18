import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const spaceIndicator = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 500,
  lineHeight: '20px',
  cursor: 'pointer',
  color: cssVarV2('text/secondary'),
  backgroundColor: 'transparent',
  border: 'none',
  transition: 'all 0.2s ease',
  ':hover': {
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    color: cssVarV2('text/primary'),
  },
  ':focus-visible': {
    outline: `2px solid ${cssVarV2('button/primary')}`,
    outlineOffset: 2,
  },
});

export const spaceIcon = style({
  fontSize: 14,
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const spaceName = style({
  maxWidth: 120,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const menuContent = style({
  minWidth: 200,
  maxWidth: 280,
  maxHeight: 300,
  overflowY: 'auto',
});

export const menuHeader = style({
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 500,
  color: cssVarV2('text/secondary'),
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const workspaceRootItem = style({
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  marginTop: 4,
  paddingTop: 4,
});
