// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusMessage } from './status-message';
import { Textarea } from './textarea';

describe('artifact UI primitives', () => {
  it('announces conflicts and errors without moving focus', () => {
    render(<StatusMessage tone="danger">Revision conflict</StatusMessage>);
    expect(screen.getByRole('alert')).toHaveTextContent('Revision conflict');
  });

  it('keeps structured draft content accessible and copyable', () => {
    render(<Textarea aria-label="Artifact body" defaultValue='{"title":"Draft"}' />);
    expect(screen.getByRole('textbox', { name: 'Artifact body' })).toHaveValue('{"title":"Draft"}');
  });
});
