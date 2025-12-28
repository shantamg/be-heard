/**
 * WaitingStatusMessage Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { WaitingStatusMessage } from '../WaitingStatusMessage';

describe('WaitingStatusMessage', () => {
  const defaultProps = {
    type: 'compact-pending' as const,
    partnerName: 'Alex',
  };

  describe('waiting states', () => {
    it('displays compact pending message', () => {
      render(<WaitingStatusMessage {...defaultProps} type="compact-pending" />);

      expect(screen.getByText(/Waiting for Alex to sign the Curiosity Compact/)).toBeTruthy();
      expect(screen.getByText('Status Update')).toBeTruthy();
      expect(screen.getByTestId('waiting-status-message-spinner')).toBeTruthy();
    });

    it('displays witness pending message', () => {
      render(<WaitingStatusMessage {...defaultProps} type="witness-pending" />);

      expect(screen.getByText(/Alex is still in their witness session/)).toBeTruthy();
      expect(screen.getByTestId('waiting-status-message-spinner')).toBeTruthy();
    });

    it('displays empathy pending message', () => {
      render(<WaitingStatusMessage {...defaultProps} type="empathy-pending" />);

      expect(screen.getByText(/Waiting for Alex to share their perspective/)).toBeTruthy();
    });

    it('displays needs pending message', () => {
      render(<WaitingStatusMessage {...defaultProps} type="needs-pending" />);

      expect(screen.getByText(/Waiting for Alex to confirm their needs/)).toBeTruthy();
    });

    it('displays ranking pending message', () => {
      render(<WaitingStatusMessage {...defaultProps} type="ranking-pending" />);

      expect(screen.getByText(/Waiting for Alex to submit their strategy rankings/)).toBeTruthy();
    });
  });

  describe('completion states', () => {
    it('displays partner signed message with checkmark', () => {
      render(<WaitingStatusMessage {...defaultProps} type="partner-signed" />);

      expect(screen.getByText(/Alex has signed the Curiosity Compact/)).toBeTruthy();
      expect(screen.getByText('Good News')).toBeTruthy();
      expect(screen.getByTestId('waiting-status-message-checkmark')).toBeTruthy();
    });

    it('displays partner completed witness message', () => {
      render(<WaitingStatusMessage {...defaultProps} type="partner-completed-witness" />);

      expect(screen.getByText(/Alex has completed their witness session/)).toBeTruthy();
      expect(screen.getByTestId('waiting-status-message-checkmark')).toBeTruthy();
    });

    it('displays partner shared empathy message', () => {
      render(<WaitingStatusMessage {...defaultProps} type="partner-shared-empathy" />);

      expect(screen.getByText(/Alex has shared their understanding/)).toBeTruthy();
    });

    it('displays partner confirmed needs message', () => {
      render(<WaitingStatusMessage {...defaultProps} type="partner-confirmed-needs" />);

      expect(screen.getByText(/Alex has confirmed their needs/)).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('renders with test ID', () => {
      render(<WaitingStatusMessage {...defaultProps} testID="custom-test-id" />);

      expect(screen.getByTestId('custom-test-id')).toBeTruthy();
    });

    it('uses default test ID when not provided', () => {
      render(<WaitingStatusMessage {...defaultProps} />);

      expect(screen.getByTestId('waiting-status-message')).toBeTruthy();
    });
  });
});
