import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  padding: '20px',
  gap: '16px',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

export const title = style({
  fontSize: '18px',
  fontWeight: 600,
  color: cssVar('textPrimaryColor'),
});

export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
});

export const docInfo = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const label = style({
  fontSize: '14px',
  fontWeight: 500,
  color: cssVar('textSecondaryColor'),
});

export const docTitle = style({
  fontSize: '14px',
  color: cssVar('textPrimaryColor'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const selectWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const selectButton = style({
  width: '100%',
  justifyContent: 'flex-start',
});

export const footer = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  marginTop: '8px',
});
