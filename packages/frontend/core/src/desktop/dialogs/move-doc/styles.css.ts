import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const modal = style({
  maxWidth: '480px',
});

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  padding: '20px 24px',
  gap: '20px',
});

export const header = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const title = style({
  fontSize: cssVar('fontH6'),
  fontWeight: 600,
  lineHeight: '26px',
  color: cssVarV2('text/primary'),
});

export const docTitle = style({
  fontSize: cssVar('fontBase'),
  fontWeight: 400,
  lineHeight: '22px',
  color: cssVarV2('text/secondary'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const formSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
});

export const fieldLabel = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  lineHeight: '22px',
  color: cssVarV2('text/primary'),
  marginBottom: '4px',
});

export const select = style({
  width: '100%',
});

export const workspaceList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  maxHeight: '200px',
  overflowY: 'auto',
});

export const workspaceItem = style({
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px',
  borderRadius: '4px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: cssVar('fontBase'),
  lineHeight: '22px',
  color: cssVarV2('text/primary'),
  textAlign: 'left',
  width: '100%',
  transition: 'background-color 0.2s',
  selectors: {
    '&:hover': {
      backgroundColor: cssVarV2('layer/background/hoverOverlay'),
    },
    '&[data-selected="true"]': {
      backgroundColor: cssVarV2('layer/background/secondary'),
      fontWeight: 500,
    },
  },
});

export const spaceSelectSection = style({
  display: 'flex',
  flexDirection: 'column',
});

export const spaceSelectButton = style({
  width: '100%',
  justifyContent: 'flex-start',
});

export const linkedDocsSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const checkbox = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const checkboxLabel = style({
  fontSize: cssVar('fontBase'),
  lineHeight: '22px',
  color: cssVarV2('text/primary'),
});

export const linkModeSelect = style({
  marginLeft: '24px',
  width: 'calc(100% - 24px)',
});

export const linkedDocsPreview = style({
  marginLeft: '24px',
  padding: '8px 12px',
  backgroundColor: cssVarV2('layer/background/secondary'),
  borderRadius: '4px',
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/secondary'),
});

export const actions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  marginTop: '8px',
});

export const errorMessage = style({
  fontSize: cssVar('fontSm'),
  color: cssVarV2('status/error'),
  padding: '8px 12px',
  backgroundColor: cssVarV2('layer/background/error'),
  borderRadius: '4px',
});
