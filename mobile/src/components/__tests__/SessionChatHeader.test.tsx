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

    it('shows AI assistant status when no partner', () => {
      const { getByTestId } = render(<SessionChatHeader />);

      expect(getByTestId('session-chat-header-status')).toHaveTextContent(
        'AI assistant'
      );
    });
  });

  describe('partner status', () => {
    it('shows offline status by default when partner is provided', () => {
      const { getByTestId } = render(
        <SessionChatHeader partnerName="Alex" />
      );

      expect(getByTestId('session-chat-header-status')).toHaveTextContent(
        'offline'
      );
    });

    it('shows online status when partner is online', () => {
      const { getByTestId } = render(
        <SessionChatHeader partnerName="Alex" partnerOnline={true} />
      );

      expect(getByTestId('session-chat-header-status')).toHaveTextContent(
        'online'
      );
    });

    it('shows typing indicator when partner is typing', () => {
      const { queryByTestId } = render(
        <SessionChatHeader partnerName="Alex" partnerTyping={true} />
      );

      // When typing, the status text should not be rendered
      expect(queryByTestId('session-chat-header-status')).toBeNull();
    });

    it('shows connecting status when connection is establishing', () => {
      const { getByTestId } = render(
        <SessionChatHeader
          partnerName="Alex"
          connectionStatus={ConnectionStatus.CONNECTING}
        />
      );

      expect(getByTestId('session-chat-header-status')).toHaveTextContent(
        'connecting...'
      );
    });

    it('shows connection lost when connection failed', () => {
      const { getByTestId } = render(
        <SessionChatHeader
          partnerName="Alex"
          connectionStatus={ConnectionStatus.FAILED}
        />
      );

      expect(getByTestId('session-chat-header-status')).toHaveTextContent(
        'connection lost'
      );
    });

    it('shows connecting status when connection is suspended', () => {
      const { getByTestId } = render(
        <SessionChatHeader
          partnerName="Alex"
          connectionStatus={ConnectionStatus.SUSPENDED}
        />
      );

      expect(getByTestId('session-chat-header-status')).toHaveTextContent(
        'connecting...'
      );
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
      expect(getByTestId('custom-header-status')).toBeTruthy();
    });
  });
});
