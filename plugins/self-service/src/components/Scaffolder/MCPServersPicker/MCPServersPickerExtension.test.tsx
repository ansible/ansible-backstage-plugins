import { render, screen, fireEvent } from '@testing-library/react';
import { MCPServersPickerExtension } from './MCPServersPickerExtension';

jest.mock('@material-ui/core/styles', () => ({
  ...jest.requireActual('@material-ui/core/styles'),
  makeStyles: () => () => ({
    title: 'title',
    cardsContainer: 'cardsContainer',
    card: 'card',
    cardSelected: 'cardSelected',
    cardContent: 'cardContent',
    cardText: 'cardText',
    checkIcon: 'checkIcon',
    noteBox: 'noteBox',
    noteIcon: 'noteIcon',
    noteText: 'noteText',
  }),
}));

const createMockProps = (overrides = {}) => ({
  onChange: jest.fn(),
  disabled: false,
  rawErrors: [] as string[],
  schema: {
    title: 'Add MCP Servers',
    items: {
      type: 'string' as const,
      enum: ['server1', 'server2', 'server3'],
    },
  } as any,
  uiSchema: {},
  formData: [] as string[],
  idSchema: { $id: 'mcpServers' } as any,
  onBlur: jest.fn(),
  onFocus: jest.fn(),
  readonly: false,
  name: 'mcpServers',
  registry: {} as any,
  ...overrides,
});

describe('MCPServersPickerExtension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('renders the title correctly', () => {
      const props = createMockProps();
      render(<MCPServersPickerExtension {...props} />);
      expect(screen.getByText('Add MCP Servers')).toBeInTheDocument();
    });

    it('renders custom title from uiSchema', () => {
      const props = createMockProps({
        uiSchema: { 'ui:options': { title: 'Custom MCP Servers' } },
      });
      render(<MCPServersPickerExtension {...props} />);
      expect(screen.getByText('Custom MCP Servers')).toBeInTheDocument();
    });

    it('renders title from schema when uiSchema title is not provided', () => {
      const props = createMockProps({
        schema: { title: 'Schema Title', items: { enum: [] } },
        uiSchema: {},
      });
      render(<MCPServersPickerExtension {...props} />);
      expect(screen.getByText('Schema Title')).toBeInTheDocument();
    });

    it('renders default title when no title provided', () => {
      const props = createMockProps({
        schema: { items: { enum: [] } },
        uiSchema: {},
      });
      render(<MCPServersPickerExtension {...props} />);
      expect(screen.getByText('Add MCP Servers')).toBeInTheDocument();
    });

    it('renders all enum values as cards', () => {
      const props = createMockProps();
      render(<MCPServersPickerExtension {...props} />);
      expect(screen.getByText('server1')).toBeInTheDocument();
      expect(screen.getByText('server2')).toBeInTheDocument();
      expect(screen.getByText('server3')).toBeInTheDocument();
    });

    it('does not render note box when no cards are selected', () => {
      const props = createMockProps({ formData: [] });
      render(<MCPServersPickerExtension {...props} />);
      expect(
        screen.queryByText(
          "Update the 'mcp-vars.yaml' file if you want to override the default variables for the MCP servers selected for installation.",
        ),
      ).not.toBeInTheDocument();
    });

    it('renders selected cards with checkmark from initial formData', () => {
      const formData = ['server1', 'server2'];
      const props = createMockProps({ formData });
      render(<MCPServersPickerExtension {...props} />);
      expect(screen.getByLabelText('Deselect server1')).toBeInTheDocument();
      expect(screen.getByLabelText('Deselect server2')).toBeInTheDocument();
    });

    it('handles undefined formData', () => {
      const props = createMockProps({ formData: undefined });
      render(<MCPServersPickerExtension {...props} />);
      expect(screen.getByText('server1')).toBeInTheDocument();
      expect(screen.getByText('server2')).toBeInTheDocument();
      expect(screen.getByText('server3')).toBeInTheDocument();
    });

    it('handles empty formData array', () => {
      const props = createMockProps({ formData: [] });
      render(<MCPServersPickerExtension {...props} />);
      expect(screen.getByText('server1')).toBeInTheDocument();
      expect(screen.getByText('server2')).toBeInTheDocument();
      expect(screen.getByText('server3')).toBeInTheDocument();
    });
  });

  describe('Card Selection', () => {
    it('selects a card when clicked', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<MCPServersPickerExtension {...props} />);

      const card = screen.getByLabelText('Select server1');
      fireEvent.click(card);

      expect(onChange).toHaveBeenCalledWith(['server1']);
      expect(screen.getByLabelText('Deselect server1')).toBeInTheDocument();
    });

    it('deselects a card when clicked again', () => {
      const onChange = jest.fn();
      const formData = ['server1'];
      const props = createMockProps({ formData, onChange });
      render(<MCPServersPickerExtension {...props} />);

      const card = screen.getByLabelText('Deselect server1');
      fireEvent.click(card);

      expect(onChange).toHaveBeenCalledWith([]);
    });

    it('allows selecting multiple cards', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      const { rerender } = render(<MCPServersPickerExtension {...props} />);

      fireEvent.click(screen.getByLabelText('Select server1'));
      expect(onChange).toHaveBeenCalledWith(['server1']);

      rerender(<MCPServersPickerExtension {...props} formData={['server1']} />);

      fireEvent.click(screen.getByLabelText('Select server2'));
      expect(onChange).toHaveBeenCalledWith(['server1', 'server2']);
    });

    it('allows deselecting one card while keeping others selected', () => {
      const onChange = jest.fn();
      const formData = ['server1', 'server2'];
      const props = createMockProps({ formData, onChange });
      render(<MCPServersPickerExtension {...props} />);

      const card = screen.getByLabelText('Deselect server1');
      fireEvent.click(card);

      expect(onChange).toHaveBeenCalledWith(['server2']);
    });

    it('handles keyboard navigation with Enter key', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<MCPServersPickerExtension {...props} />);

      const card = screen.getByLabelText('Select server1');
      fireEvent.keyDown(card, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(['server1']);
    });

    it('handles keyboard navigation with Space key', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<MCPServersPickerExtension {...props} />);

      const card = screen.getByLabelText('Select server1');
      fireEvent.keyDown(card, { key: ' ' });

      expect(onChange).toHaveBeenCalledWith(['server1']);
    });
  });

  describe('Enum Values Rendering', () => {
    it('renders all enum values as cards', () => {
      const props = createMockProps({
        schema: {
          items: {
            enum: ['server1', 'server2', 'server3', 'server4'],
          },
        },
      });
      render(<MCPServersPickerExtension {...props} />);

      expect(screen.getByText('server1')).toBeInTheDocument();
      expect(screen.getByText('server2')).toBeInTheDocument();
      expect(screen.getByText('server3')).toBeInTheDocument();
      expect(screen.getByText('server4')).toBeInTheDocument();
    });

    it('handles empty enum array', () => {
      const props = createMockProps({
        schema: {
          items: {
            enum: [],
          },
        },
      });
      render(<MCPServersPickerExtension {...props} />);

      expect(screen.queryByText('server1')).not.toBeInTheDocument();
    });

    it('handles missing enum property', () => {
      const props = createMockProps({
        schema: {
          items: {},
        },
      });
      render(<MCPServersPickerExtension {...props} />);

      expect(screen.queryByText('server1')).not.toBeInTheDocument();
    });

    it('handles missing items property', () => {
      const props = createMockProps({
        schema: {},
      });
      render(<MCPServersPickerExtension {...props} />);

      expect(screen.queryByText('server1')).not.toBeInTheDocument();
    });
  });

  describe('Note Box Display', () => {
    it('displays note box when any card is selected', () => {
      const formData = ['server1'];
      const props = createMockProps({ formData });
      render(<MCPServersPickerExtension {...props} />);

      expect(
        screen.getByText(
          "Update the 'mcp-vars.yaml' file if you want to override the default variables for the MCP servers selected for installation.",
        ),
      ).toBeInTheDocument();
    });

    it('displays note box only once when multiple cards are selected', () => {
      const formData = ['server1', 'server2'];
      const props = createMockProps({ formData });
      render(<MCPServersPickerExtension {...props} />);

      const noteBoxes = screen.getAllByText(
        "Update the 'mcp-vars.yaml' file if you want to override the default variables for the MCP servers selected for installation.",
      );
      expect(noteBoxes.length).toBe(1);
    });

    it('hides note box when all cards are deselected', () => {
      const formData = ['server1'];
      const props = createMockProps({ formData });
      const { rerender } = render(<MCPServersPickerExtension {...props} />);

      expect(
        screen.getByText(
          "Update the 'mcp-vars.yaml' file if you want to override the default variables for the MCP servers selected for installation.",
        ),
      ).toBeInTheDocument();

      rerender(<MCPServersPickerExtension {...props} formData={[]} />);

      expect(
        screen.queryByText(
          "Update the 'mcp-vars.yaml' file if you want to override the default variables for the MCP servers selected for installation.",
        ),
      ).not.toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('does not allow selecting cards when disabled', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange, disabled: true });
      render(<MCPServersPickerExtension {...props} />);

      const card = screen.getByLabelText('Select server1');
      fireEvent.click(card);

      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not allow deselecting cards when disabled', () => {
      const onChange = jest.fn();
      const formData = ['server1'];
      const props = createMockProps({ formData, onChange, disabled: true });
      render(<MCPServersPickerExtension {...props} />);

      const card = screen.getByLabelText('Deselect server1');
      fireEvent.click(card);

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('Error Display', () => {
    it('displays raw errors when present', () => {
      const props = createMockProps({
        rawErrors: ['Error 1', 'Error 2'],
      });
      render(<MCPServersPickerExtension {...props} />);

      expect(screen.getByText('Error 1, Error 2')).toBeInTheDocument();
    });

    it('does not display error message when rawErrors is empty', () => {
      const props = createMockProps({ rawErrors: [] });
      render(<MCPServersPickerExtension {...props} />);

      expect(screen.queryByText(/Error/i)).not.toBeInTheDocument();
    });

    it('displays single error message', () => {
      const props = createMockProps({ rawErrors: ['Single error'] });
      render(<MCPServersPickerExtension {...props} />);

      expect(screen.getByText('Single error')).toBeInTheDocument();
    });

    it('displays multiple errors joined by comma', () => {
      const props = createMockProps({
        rawErrors: ['Error 1', 'Error 2', 'Error 3'],
      });
      render(<MCPServersPickerExtension {...props} />);

      expect(screen.getByText('Error 1, Error 2, Error 3')).toBeInTheDocument();
    });
  });

  describe('FormData Synchronization', () => {
    it('syncs selected cards when formData changes externally', () => {
      const props = createMockProps({ formData: [] });
      const { rerender } = render(<MCPServersPickerExtension {...props} />);

      expect(screen.getByLabelText('Select server1')).toBeInTheDocument();

      rerender(<MCPServersPickerExtension {...props} formData={['server1']} />);

      expect(screen.getByLabelText('Deselect server1')).toBeInTheDocument();
    });

    it('updates selected cards when formData is updated with new items', () => {
      const initialFormData = ['server1'];
      const props = createMockProps({ formData: initialFormData });
      const { rerender } = render(<MCPServersPickerExtension {...props} />);

      expect(screen.getByLabelText('Deselect server1')).toBeInTheDocument();

      rerender(
        <MCPServersPickerExtension
          {...props}
          formData={['server1', 'server2']}
        />,
      );

      expect(screen.getByLabelText('Deselect server1')).toBeInTheDocument();
      expect(screen.getByLabelText('Deselect server2')).toBeInTheDocument();
    });

    it('clears selected cards when formData becomes empty', () => {
      const initialFormData = ['server1'];
      const props = createMockProps({ formData: initialFormData });
      const { rerender } = render(<MCPServersPickerExtension {...props} />);

      expect(screen.getByLabelText('Deselect server1')).toBeInTheDocument();

      rerender(<MCPServersPickerExtension {...props} formData={[]} />);

      expect(screen.getByLabelText('Select server1')).toBeInTheDocument();
    });

    it('handles formData becoming undefined', () => {
      const initialFormData = ['server1'];
      const props = createMockProps({ formData: initialFormData });
      const { rerender } = render(<MCPServersPickerExtension {...props} />);

      expect(screen.getByLabelText('Deselect server1')).toBeInTheDocument();

      rerender(<MCPServersPickerExtension {...props} formData={undefined} />);

      expect(screen.getByLabelText('Select server1')).toBeInTheDocument();
    });

    it('updates when formData changes multiple times', () => {
      const props = createMockProps({ formData: [] });
      const { rerender } = render(<MCPServersPickerExtension {...props} />);

      rerender(<MCPServersPickerExtension {...props} formData={['server1']} />);
      expect(screen.getByLabelText('Deselect server1')).toBeInTheDocument();

      rerender(
        <MCPServersPickerExtension
          {...props}
          formData={['server1', 'server2']}
        />,
      );
      expect(screen.getByLabelText('Deselect server1')).toBeInTheDocument();
      expect(screen.getByLabelText('Deselect server2')).toBeInTheDocument();

      rerender(<MCPServersPickerExtension {...props} formData={['server3']} />);
      expect(screen.getByLabelText('Deselect server3')).toBeInTheDocument();
      expect(screen.getByLabelText('Select server1')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid selection and deselection operations', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<MCPServersPickerExtension {...props} />);

      const card = screen.getByLabelText('Select server1');

      for (let i = 0; i < 5; i++) {
        fireEvent.click(card);
      }

      expect(onChange).toHaveBeenCalled();
    });

    it('handles very long server names', () => {
      const longServerName = 'a'.repeat(100);
      const props = createMockProps({
        schema: {
          items: {
            enum: [longServerName],
          },
        },
      });
      render(<MCPServersPickerExtension {...props} />);

      expect(screen.getByText(longServerName)).toBeInTheDocument();
    });

    it('handles special characters in server names', () => {
      const specialServerName = 'server-with-special-chars-@#$%';
      const props = createMockProps({
        schema: {
          items: {
            enum: [specialServerName],
          },
        },
      });
      render(<MCPServersPickerExtension {...props} />);

      expect(screen.getByText(specialServerName)).toBeInTheDocument();
    });

    it('handles selecting same server multiple times (should toggle)', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      const { rerender } = render(<MCPServersPickerExtension {...props} />);

      const card = screen.getByLabelText('Select server1');
      fireEvent.click(card);
      expect(onChange).toHaveBeenCalledWith(['server1']);

      rerender(<MCPServersPickerExtension {...props} formData={['server1']} />);

      const selectedCard = screen.getByLabelText('Deselect server1');
      fireEvent.click(selectedCard);
      expect(onChange).toHaveBeenCalledWith([]);
    });
  });

  describe('Integration Scenarios', () => {
    it('handles complete workflow: select, deselect, select multiple', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      const { rerender } = render(<MCPServersPickerExtension {...props} />);

      fireEvent.click(screen.getByLabelText('Select server1'));
      expect(onChange).toHaveBeenCalledWith(['server1']);

      rerender(<MCPServersPickerExtension {...props} formData={['server1']} />);

      expect(
        screen.getByText(
          "Update the 'mcp-vars.yaml' file if you want to override the default variables for the MCP servers selected for installation.",
        ),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Deselect server1'));
      expect(onChange).toHaveBeenCalledWith([]);

      rerender(<MCPServersPickerExtension {...props} formData={[]} />);

      expect(
        screen.queryByText(
          "Update the 'mcp-vars.yaml' file if you want to override the default variables for the MCP servers selected for installation.",
        ),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Select server1'));
      rerender(<MCPServersPickerExtension {...props} formData={['server1']} />);
      fireEvent.click(screen.getByLabelText('Select server2'));

      expect(onChange).toHaveBeenCalled();
    });

    it('handles multiple selections and maintains state', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      const { rerender } = render(<MCPServersPickerExtension {...props} />);

      fireEvent.click(screen.getByLabelText('Select server1'));
      rerender(<MCPServersPickerExtension {...props} formData={['server1']} />);

      fireEvent.click(screen.getByLabelText('Select server2'));
      rerender(
        <MCPServersPickerExtension
          {...props}
          formData={['server1', 'server2']}
        />,
      );

      fireEvent.click(screen.getByLabelText('Select server3'));

      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('Component Props Handling', () => {
    it('handles onChange callback correctly', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<MCPServersPickerExtension {...props} />);

      const card = screen.getByLabelText('Select server1');
      fireEvent.click(card);

      expect(onChange).toHaveBeenCalledWith(['server1']);
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });
});
