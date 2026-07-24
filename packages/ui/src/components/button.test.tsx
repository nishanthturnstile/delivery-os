// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';
import { StatusBadge } from './status-badge';

describe('Delivery OS UI components', () => {
  it('keeps the button keyboard operable and named', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Run check</Button>);

    const button = screen.getByRole('button', { name: 'Run check' });
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('adds a non-color status label', () => {
    render(<StatusBadge status="success">Operational</StatusBadge>);
    expect(screen.getByText('Operational')).toBeTruthy();
  });
});
