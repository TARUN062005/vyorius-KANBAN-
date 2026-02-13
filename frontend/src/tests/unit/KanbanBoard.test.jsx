import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KanbanBoard from '../../components/KanbanBoard';
import { vi } from 'vitest';

// Mock socket.io-client
vi.mock('socket.io-client', () => {
  return {
    default: () => ({
      on: vi.fn(),
      emit: vi.fn(),
      off: vi.fn(),
      id: 'test-socket-id',
      connected: true,
    }),
  };
});

test("renders Kanban board title", () => {
  render(<KanbanBoard />);
  expect(screen.getByText("Kanban Board")).toBeInTheDocument();
});

// TODO: Add more unit tests for individual components
