import { style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  gap: 8,
});

export const actions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const newPageButtonLabel = style({
  fontSize: 'var(--affine-font-sm)',
});
