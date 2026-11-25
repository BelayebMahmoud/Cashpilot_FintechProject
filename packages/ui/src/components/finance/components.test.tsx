import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Amount } from './amount';
import { MoneyInput } from './money-input';
import { StatusBadge } from './status-badge';
import { RunwayGauge } from './widgets';

describe('MoneyInput', () => {
  it('is a text input with decimal keyboard and reformats on blur', async () => {
    const onValueChange = vi.fn();
    render(<MoneyInput aria-label="Montant" name="amount" onValueChange={onValueChange} />);
    const input = screen.getByLabelText('Montant');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    await userEvent.type(input, '1234,5');
    expect(onValueChange).toHaveBeenLastCalledWith('1234,5', 1_234_500);
    await userEvent.tab();
    expect((input as HTMLInputElement).value.replace(/ /g, ' ')).toBe('1 234,500');
  });

  it('keeps invalid text as typed (the server reports the error)', async () => {
    render(<MoneyInput aria-label="Montant" />);
    const input = screen.getByLabelText('Montant');
    await userEvent.type(input, '12abc');
    await userEvent.tab();
    expect(input).toHaveValue('12abc');
  });
});

describe('StatusBadge', () => {
  it('renders icon + text for every invoice state', () => {
    const { rerender, container } = render(<StatusBadge kind="invoice" status="ISSUED" settlement="UNPAID" overdue={false} />);
    expect(screen.getByText('Émise · non payée')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
    rerender(<StatusBadge kind="invoice" status="ISSUED" settlement="PARTIALLY_PAID" overdue daysOverdue={12} />);
    expect(screen.getByText('En retard (+12 j)')).toBeInTheDocument();
    rerender(<StatusBadge kind="invoice" status="ISSUED" settlement="PAID" overdue={false} />);
    expect(screen.getByText('Payée')).toBeInTheDocument();
    rerender(<StatusBadge kind="invoice" status="CANCELLED" settlement="UNPAID" overdue={false} />);
    expect(screen.getByText('Annulée')).toBeInTheDocument();
  });

  it('renders every expense state', () => {
    for (const [status, label] of [
      ['DRAFT', 'Brouillon'],
      ['SUBMITTED', 'Soumise · à valider'],
      ['APPROVED', 'Approuvée'],
      ['REJECTED', 'Refusée'],
      ['PAID', 'Payée'],
    ] as const) {
      const { unmount } = render(<StatusBadge kind="expense" status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
});

describe('Amount', () => {
  it('reads the full amount to screen readers and colours only negative balances', () => {
    const { container, rerender } = render(<Amount value={-1_000_000} tone="balance" />);
    expect(container.firstChild).toHaveClass('text-danger');
    expect(container.querySelector('.sr-only')?.textContent?.replace(/ /g, ' ')).toBe('−1 000,000 dinars');
    rerender(<Amount value={-1_000_000} />);
    expect(container.firstChild).not.toHaveClass('text-danger');
    rerender(<Amount value={500} signed />);
    expect(container.firstChild).toHaveClass('text-inflow');
  });
});

describe('RunwayGauge', () => {
  it('shows days and the first negative date', () => {
    render(<RunwayGauge days={15} firstNegativeDate="2026-12-16" />);
    expect(screen.getByText('15 jours')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '15');
  });

  it('shows "> 90 jours" when nothing goes negative', () => {
    render(<RunwayGauge days={null} firstNegativeDate={null} />);
    expect(screen.getByText('> 90 jours')).toBeInTheDocument();
  });
});
