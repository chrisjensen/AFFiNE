import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  padding: 24,
  maxHeight: 'calc(100vh - 120px)',
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
  flex: 1,
  minHeight: 0,
});

export const sectionContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  flex: 1,
  overflowY: 'auto',
  minHeight: 0,
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
  padding: '8px 12px',
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  color: cssVar('textPrimaryColor'),
  backgroundColor: cssVar('backgroundPrimaryColor'),
  border: `1px solid ${cssVar('borderColor')}`,
  borderRadius: 8,
  outline: 'none',
  fontFamily: 'inherit',
  verticalAlign: 'top',
  '::placeholder': {
    color: cssVar('placeholderColor'),
  },
  ':focus': {
    borderColor: cssVar('primaryColor'),
    boxShadow: `0 0 0 2px ${cssVar('primaryColor')}20`,
  },
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
  flexShrink: 0,
  marginTop: 'auto',
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
  maxWidth: 16,
  accentColor: cssVar('primaryColor'),
  cursor: 'pointer',
  flex: '0 0 16px',
  margin: 0,
  appearance: 'auto',
});

export const sectionHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 16,
});

export const loadingContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
});

export const emptyState = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  textAlign: 'center',
  gap: 8,
});

export const emptyStateTitle = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  color: cssVar('textPrimaryColor'),
});

export const emptyStateDescription = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  maxWidth: 300,
});

export const loadMoreButton = style({
  width: '100%',
  marginTop: 8,
});

export const iconNameRow = style({
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
});

export const iconPickerWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const iconPickerButton = style({
  width: 48,
  height: 48,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: `1px solid ${cssVar('borderColor')}`,
  backgroundColor: cssVar('backgroundSecondaryColor'),
  cursor: 'pointer',
  fontSize: 24,
  transition: 'all 0.2s ease',
  ':hover': {
    borderColor: cssVar('primaryColor'),
    backgroundColor: cssVar('hoverColor'),
  },
});

export const iconPlaceholder = style({
  color: cssVar('placeholderColor'),
  fontSize: 20,
});

export const nameInputWrapper = style({
  flex: 1,
});

export const dropdownTrigger = style({
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${cssVar('borderColor')}`,
  backgroundColor: cssVar('backgroundPrimaryColor'),
  justifyContent: 'space-between',
  alignItems: 'center',
  transition: 'all 0.2s ease',
  selectors: {
    '&:hover': {
      borderColor: cssVar('primaryColor'),
      backgroundColor: cssVar('hoverColor'),
    },
    '&:focus-visible': {
      borderColor: cssVar('primaryColor'),
      boxShadow: `0 0 0 2px ${cssVar('primaryColor')}20`,
      outline: 'none',
    },
  },
});

export const dropdownContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  width: '100%',
  textAlign: 'left',
  flex: 1,
  minWidth: 0,
});

export const roleMenuItem = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '4px 0',
});
