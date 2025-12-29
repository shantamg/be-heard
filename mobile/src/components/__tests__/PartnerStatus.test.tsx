/**
 * PartnerStatus Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import {
  PartnerStatus,
  PartnerStatusBadge,
  InlineTypingIndicator,
} from '../PartnerStatus';
import { ConnectionStatus } from '@meet-without-fear/shared';

describe('PartnerStatus', () => {
  describe('rendering', () => {
    it('renders online status', () => {
      render(<PartnerStatus isOnline={true} />);

      expect(screen.getByText('online')).toBeTruthy();
    });

    it('renders offline status', () => {
      render(<PartnerStatus isOnline={false} />);

      expect(screen.getByText('offline')).toBeTruthy();
    });

    it('renders partner name when provided', () => {
      render(<PartnerStatus isOnline={true} partnerName="John" />);

      expect(screen.getByText('John')).toBeTruthy();
    });

    it('renders typing indicator when partner is typing', () => {
      render(<PartnerStatus isOnline={true} isTyping={true} />);

      expect(screen.getByText('typing')).toBeTruthy();
    });
  });

  describe('connection status', () => {
    it('shows connecting status', () => {
      render(
        <PartnerStatus
          isOnline={true}
          connectionStatus={ConnectionStatus.CONNECTING}
        />
      );

      expect(screen.getByText('connecting...')).toBeTruthy();
    });

    it('shows error status when connection failed', () => {
      render(
        <PartnerStatus
          isOnline={true}
          connectionStatus={ConnectionStatus.FAILED}
        />
      );

      expect(screen.getByText('connection error')).toBeTruthy();
    });

    it('shows connecting status when suspended', () => {
      render(
        <PartnerStatus
          isOnline={true}
          connectionStatus={ConnectionStatus.SUSPENDED}
        />
      );

      expect(screen.getByText('connecting...')).toBeTruthy();
    });
  });

  describe('compact mode', () => {
    it('renders in compact mode without text', () => {
      render(<PartnerStatus isOnline={true} compact={true} />);

      // In compact mode, should not show text
      expect(screen.queryByText('online')).toBeNull();
    });
  });

  describe('typing indicator toggle', () => {
    it('hides typing when showTyping is false', () => {
      render(
        <PartnerStatus isOnline={true} isTyping={true} showTyping={false} />
      );

      expect(screen.queryByText('typing')).toBeNull();
      expect(screen.getByText('online')).toBeTruthy();
    });

    it('shows typing when showTyping is true (default)', () => {
      render(<PartnerStatus isOnline={true} isTyping={true} />);

      expect(screen.getByText('typing')).toBeTruthy();
    });
  });
});

describe('PartnerStatusBadge', () => {
  it('renders online state', () => {
    render(<PartnerStatusBadge isOnline={true} />);

    // Badge should render without crashing
    expect(screen.getByTestId('partner-status-badge')).toBeTruthy();
  });

  it('renders offline state', () => {
    render(<PartnerStatusBadge isOnline={false} />);

    expect(screen.getByTestId('partner-status-badge')).toBeTruthy();
  });

  it('renders connecting state', () => {
    render(
      <PartnerStatusBadge
        isOnline={true}
        connectionStatus={ConnectionStatus.CONNECTING}
      />
    );

    expect(screen.getByTestId('partner-status-badge')).toBeTruthy();
  });

  it('renders error state', () => {
    render(
      <PartnerStatusBadge
        isOnline={true}
        connectionStatus={ConnectionStatus.FAILED}
      />
    );

    expect(screen.getByTestId('partner-status-badge')).toBeTruthy();
  });
});

describe('InlineTypingIndicator', () => {
  it('renders nothing when not typing', () => {
    render(<InlineTypingIndicator isTyping={false} partnerName="John" />);

    expect(screen.queryByText('John is typing')).toBeNull();
  });

  it('renders typing message when typing', () => {
    render(<InlineTypingIndicator isTyping={true} partnerName="John" />);

    expect(screen.getByText('John is typing')).toBeTruthy();
  });

  it('renders generic message without partner name', () => {
    render(<InlineTypingIndicator isTyping={true} />);

    expect(screen.getByText('Partner is typing')).toBeTruthy();
  });
});
