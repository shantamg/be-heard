import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { BreathingExercise } from '../BreathingExercise';

// Note: react-native-reanimated is mocked globally in jest.setup.js

describe('BreathingExercise', () => {
  const defaultProps = {
    visible: true,
    intensityBefore: 7,
    onComplete: jest.fn(),
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders modal when visible', () => {
    render(<BreathingExercise {...defaultProps} />);
    expect(screen.getByTestId('breathing-modal')).toBeTruthy();
  });

  it('shows title', () => {
    render(<BreathingExercise {...defaultProps} />);
    expect(screen.getByText('Breathing Exercise')).toBeTruthy();
  });

  it('shows ready state initially', () => {
    render(<BreathingExercise {...defaultProps} />);
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('Get comfortable and press Start')).toBeTruthy();
  });

  it('shows start button in ready state', () => {
    render(<BreathingExercise {...defaultProps} />);
    expect(screen.getByTestId('start-button')).toBeTruthy();
  });

  it('shows cycle count', () => {
    render(<BreathingExercise {...defaultProps} />);
    expect(screen.getByText('0/3 cycles')).toBeTruthy();
  });

  it('shows skip button', () => {
    render(<BreathingExercise {...defaultProps} />);
    expect(screen.getByTestId('skip-button')).toBeTruthy();
    expect(screen.getByText('Skip for now')).toBeTruthy();
  });

  it('calls onClose when skip is pressed', () => {
    const onClose = jest.fn();
    render(<BreathingExercise {...defaultProps} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('skip-button'));
    expect(onClose).toHaveBeenCalled();
  });

  it('transitions to inhale phase when start is pressed', () => {
    render(<BreathingExercise {...defaultProps} />);
    fireEvent.press(screen.getByTestId('start-button'));
    expect(screen.getByText('inhale')).toBeTruthy();
    expect(screen.getByText('Breathe in slowly...')).toBeTruthy();
  });

  it('uses custom cycle count', () => {
    render(<BreathingExercise {...defaultProps} cycles={5} />);
    expect(screen.getByText('0/5 cycles')).toBeTruthy();
  });

  describe('when not visible', () => {
    it('does not render content when not visible', () => {
      render(<BreathingExercise {...defaultProps} visible={false} />);
      expect(screen.queryByText('Breathing Exercise')).toBeNull();
    });
  });

  describe('intensity check after exercise', () => {
    it('shows intensity check UI after completing cycles', async () => {
      render(<BreathingExercise {...defaultProps} cycles={1} phaseDuration={100} />);

      // Start exercise
      fireEvent.press(screen.getByTestId('start-button'));

      // Wait for all phases to complete (inhale + hold + exhale = 300ms)
      await act(async () => {
        jest.advanceTimersByTime(400);
      });

      await waitFor(
        () => {
          expect(screen.getByText('How are you feeling now?')).toBeTruthy();
        },
        { timeout: 1000 }
      );
    });

    it('shows before intensity value', async () => {
      render(<BreathingExercise {...defaultProps} cycles={1} phaseDuration={100} />);

      fireEvent.press(screen.getByTestId('start-button'));

      await act(async () => {
        jest.advanceTimersByTime(400);
      });

      await waitFor(
        () => {
          expect(screen.getByText('Before: 7')).toBeTruthy();
        },
        { timeout: 1000 }
      );
    });

    it('allows adjusting intensity after exercise', async () => {
      render(<BreathingExercise {...defaultProps} cycles={1} phaseDuration={100} />);

      fireEvent.press(screen.getByTestId('start-button'));

      await act(async () => {
        jest.advanceTimersByTime(400);
      });

      await waitFor(
        () => {
          expect(screen.getByTestId('increase-intensity')).toBeTruthy();
        },
        { timeout: 1000 }
      );

      // Initial value should be 5
      expect(screen.getByText('5')).toBeTruthy();

      // Increase intensity
      fireEvent.press(screen.getByTestId('increase-intensity'));
      expect(screen.getByText('6')).toBeTruthy();

      // Decrease intensity
      fireEvent.press(screen.getByTestId('decrease-intensity'));
      expect(screen.getByText('5')).toBeTruthy();
    });

    it('calls onComplete with intensity after when done is pressed', async () => {
      const onComplete = jest.fn();
      render(
        <BreathingExercise {...defaultProps} onComplete={onComplete} cycles={1} phaseDuration={100} />
      );

      fireEvent.press(screen.getByTestId('start-button'));

      await act(async () => {
        jest.advanceTimersByTime(400);
      });

      await waitFor(
        () => {
          expect(screen.getByTestId('done-button')).toBeTruthy();
        },
        { timeout: 1000 }
      );

      // Adjust intensity to 4
      fireEvent.press(screen.getByTestId('decrease-intensity'));

      fireEvent.press(screen.getByTestId('done-button'));
      expect(onComplete).toHaveBeenCalledWith(4);
    });

    it('does not allow intensity below 1', async () => {
      render(<BreathingExercise {...defaultProps} cycles={1} phaseDuration={100} />);

      fireEvent.press(screen.getByTestId('start-button'));

      await act(async () => {
        jest.advanceTimersByTime(400);
      });

      await waitFor(
        () => {
          expect(screen.getByTestId('decrease-intensity')).toBeTruthy();
        },
        { timeout: 1000 }
      );

      // Try to decrease below 1
      for (let i = 0; i < 10; i++) {
        fireEvent.press(screen.getByTestId('decrease-intensity'));
      }
      expect(screen.getByText('1')).toBeTruthy();
    });

    it('does not allow intensity above 10', async () => {
      render(<BreathingExercise {...defaultProps} cycles={1} phaseDuration={100} />);

      fireEvent.press(screen.getByTestId('start-button'));

      await act(async () => {
        jest.advanceTimersByTime(400);
      });

      await waitFor(
        () => {
          expect(screen.getByTestId('increase-intensity')).toBeTruthy();
        },
        { timeout: 1000 }
      );

      // Try to increase above 10
      for (let i = 0; i < 10; i++) {
        fireEvent.press(screen.getByTestId('increase-intensity'));
      }
      expect(screen.getByText('10')).toBeTruthy();
    });
  });
});
