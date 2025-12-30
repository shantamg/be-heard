/**
 * SessionChatHeader Component Tests
 *
 * Tests the minimal chat-centric header for session screens.
 * Shows partner info and online status - clean chat experience.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SessionChatHeader } from '../SessionChatHeader';
import { ConnectionStatus } from '@meet-without-fear/shared';

describe('SessionChatHeader', () => {
  describe('rendering', () => {
    it('renders with default name (Meet Without Fear) when no partner name provided', () => {
      const { getByTestId } = render(<SessionChatHeader />);

      expect(getByTestId('session-chat-header-partner-name')).toHaveTextContent(
        'Meet Without Fear'
      );
    });

    it('renders partner name when provided', () => {
      const { getByTestId } = render(
        <SessionChatHeader partnerName="Alex" />
      );

      expect(getByTestId('session-chat-header-partner-name')).toHaveTextContent(
        'Alex'
      );
    });

    it('shows online status when no partner (AI mode)', () => {
      const { getByTestId } = render(<SessionChatHeader />);

      expect(getByTestId('session-chat-header-online-status')).toHaveTextContent(
        'online'
      );
    });
  });

  describe('partner status', () => {
    it('shows offline status by default when partner is provided', () => {
      const { getByTestId } = render(
        <SessionChatHeader partnerName="Alex" />
      );

      expect(getByTestId('session-chat-header-online-status')).toHaveTextContent(
        'offline'
      );
    });

    it('shows online status when partner is online', () => {
      const { getByTestId } = render(
        <SessionChatHeader partnerName="Alex" partnerOnline={true} />
      );

      expect(getByTestId('session-chat-header-online-status')).toHaveTextContent(
        'online'
      );
    });

    it('shows offline when connected but partner not online', () => {
      const { getByTestId } = render(
        <SessionChatHeader
          partnerName="Alex"
          partnerOnline={false}
          connectionStatus={ConnectionStatus.CONNECTED}
        />
      );

      expect(getByTestId('session-chat-header-online-status')).toHaveTextContent(
        'offline'
      );
    });

    it('shows offline when partner online but connection not connected', () => {
      const { getByTestId } = render(
        <SessionChatHeader
          partnerName="Alex"
          partnerOnline={true}
          connectionStatus={ConnectionStatus.CONNECTING}
        />
      );

      // Partner is online but connection not fully established, so effectively offline
      expect(getByTestId('session-chat-header-online-status')).toHaveTextContent(
        'offline'
      );
    });
  });

  describe('brief status', () => {
    it('shows brief status when provided', () => {
      const { getByTestId } = render(
        <SessionChatHeader partnerName="Alex" briefStatus="invited" />
      );

      expect(getByTestId('session-chat-header-brief-status')).toHaveTextContent(
        'invited'
      );
    });

    it('does not show brief status when not provided', () => {
      const { queryByTestId } = render(
        <SessionChatHeader partnerName="Alex" />
      );

      expect(queryByTestId('session-chat-header-brief-status')).toBeNull();
    });
  });

  describe('interactions', () => {
    it('calls onPress when header is pressed', () => {
      const onPress = jest.fn();
      const { getByTestId } = render(
        <SessionChatHeader onPress={onPress} />
      );

      fireEvent.press(getByTestId('session-chat-header-touchable'));

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not render touchable wrapper when onPress is not provided', () => {
      const { queryByTestId } = render(<SessionChatHeader />);

      expect(queryByTestId('session-chat-header-touchable')).toBeNull();
    });
  });

  describe('custom testID', () => {
    it('uses custom testID when provided', () => {
      const { getByTestId } = render(
        <SessionChatHeader testID="custom-header" />
      );

      expect(getByTestId('custom-header')).toBeTruthy();
      expect(getByTestId('custom-header-partner-name')).toBeTruthy();
      expect(getByTestId('custom-header-online-status')).toBeTruthy();
    });
  });

  describe('layout', () => {
    it('renders status row below the partner name', () => {
      const { getByTestId } = render(
        <SessionChatHeader partnerName="Alex" partnerOnline={true} />
      );

      // Verify both elements exist
      expect(getByTestId('session-chat-header-partner-name')).toBeTruthy();
      expect(getByTestId('session-chat-header-online-status')).toBeTruthy();
      expect(getByTestId('status-dot')).toBeTruthy();
    });
  });
});
