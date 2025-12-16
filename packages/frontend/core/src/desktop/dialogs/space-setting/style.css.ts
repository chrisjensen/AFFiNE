import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  padding: 24,
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

export const title = style({
  fontSize: cssVar('fontH5'),
  fontWeight: 600,
  color: cssVar('textPrimaryColor'),
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
});

export const sectionTitle = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  color: cssVar('textSecondaryColor'),
});

export const inputWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const label = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  color: cssVar('textPrimaryColor'),
});

export const input = style({
  width: '100%',
});

export const textarea = style({
  width: '100%',
  minHeight: 80,
  resize: 'vertical',
});

// Ensure text starts at top of textarea
globalStyle(`${textarea} textarea, ${textarea} input`, {
  verticalAlign: 'top',
});

export const roleSelector = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const roleOption = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${cssVar('borderColor')}`,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  selectors: {
    '&:hover': {
      borderColor: cssVar('primaryColor'),
      backgroundColor: cssVar('hoverColor'),
    },
    '&[data-selected="true"]': {
      borderColor: cssVar('primaryColor'),
      backgroundColor: cssVar('primaryColor') + '10',
    },
  },
});

export const roleInfo = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
});

export const roleName = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  color: cssVar('textPrimaryColor'),
});

export const roleDescription = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
});

export const footer = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 12,
  paddingTop: 12,
  borderTop: `1px solid ${cssVar('borderColor')}`,
});

export const dangerZone = style({
  marginTop: 24,
  padding: 16,
  borderRadius: 8,
  border: `1px solid ${cssVar('errorColor')}`,
  backgroundColor: cssVar('errorColor') + '08',
});

export const dangerTitle = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVar('errorColor'),
  marginBottom: 8,
});

export const dangerDescription = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  marginBottom: 12,
});

export const memberList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  maxHeight: 300,
  overflowY: 'auto',
});

export const memberItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 12px',
  borderRadius: 8,
  backgroundColor: cssVar('backgroundSecondaryColor'),
});

export const memberAvatar = style({
  width: 32,
  height: 32,
  borderRadius: '50%',
  backgroundColor: cssVar('placeholderColor'),
});

export const memberInfo = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
});

export const memberName = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  color: cssVar('textPrimaryColor'),
});

export const memberEmail = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
});

export const memberRole = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
});

export const tabs = style({
  display: 'flex',
  gap: 0,
  borderBottom: `1px solid ${cssVar('borderColor')}`,
  marginBottom: 16,
});

export const tab = style({
  padding: '8px 16px',
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  color: cssVar('textSecondaryColor'),
  cursor: 'pointer',
  borderBottom: '2px solid transparent',
  marginBottom: -1,
  transition: 'all 0.2s ease',
  selectors: {
    '&:hover': {
      color: cssVar('textPrimaryColor'),
    },
    '&[data-active="true"]': {
      color: cssVar('primaryColor'),
      borderBottomColor: cssVar('primaryColor'),
    },
    '&[data-danger="true"]': {
      color: cssVar('errorColor'),
    },
    '&[data-danger="true"]:hover': {
      color: cssVar('errorColor'),
    },
    '&[data-danger="true"][data-active="true"]': {
      color: cssVar('errorColor'),
      borderBottomColor: cssVar('errorColor'),
    },
  },
});

export const deleteModalContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
});

export const deleteModalDescription = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textSecondaryColor'),
  lineHeight: 1.5,
  margin: 0,
});

export const deleteModalInstruction = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
  fontWeight: 500,
  margin: 0,
});

export const radioInput = style({
  width: 16,
  height: 16,
  minWidth: 16,
  minHeight: 16,
  accentColor: cssVar('primaryColor'),
  cursor: 'pointer',
  flexShrink: 0,
  margin: 0,
  appearance: 'auto',
});
