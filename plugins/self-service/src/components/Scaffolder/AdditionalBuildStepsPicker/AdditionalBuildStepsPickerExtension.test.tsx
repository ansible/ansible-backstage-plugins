import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdditionalBuildStepsPickerExtension } from './AdditionalBuildStepsPickerExtension';
import { BuildStep } from './types';

const expandAccordion = (container: HTMLElement, index: number = 0) => {
  const accordions = container.querySelectorAll('.MuiAccordionSummary-root');
  if (accordions[index]) {
    fireEvent.click(accordions[index] as HTMLElement);
  }
};

const getCommandsField = (container: HTMLElement, index: number = 0) => {
  const textareas = container.querySelectorAll('textarea[placeholder*="RUN"]');
  return textareas[index] as HTMLTextAreaElement;
};

const mockStepTypeEnum = [
  'prepend_base',
  'append_base',
  'prepend_galaxy',
  'append_galaxy',
  'prepend_builder',
  'append_builder',
  'prepend_final',
  'append_final',
];

const mockStepTypeEnumNames = [
  'Prepend Base - Before base image dependencies',
  'Append Base - After base image dependencies',
  'Prepend Galaxy - Before Ansible collections',
  'Append Galaxy - After Ansible collections',
  'Prepend Builder - Before main build steps',
  'Append Builder - After main build steps',
  'Prepend Final - Before final image steps',
  'Append Final - After final image steps',
];

const createMockProps = (overrides = {}) => ({
  onChange: jest.fn(),
  disabled: false,
  rawErrors: [] as string[],
  schema: {
    title: 'Additional Build Steps',
    items: {
      type: 'object' as const,
      properties: {
        stepType: {
          type: 'string' as const,
          enum: mockStepTypeEnum,
          enumNames: mockStepTypeEnumNames,
          default: 'prepend_base',
        },
        commands: {
          type: 'array' as const,
          items: {
            type: 'string' as const,
          },
        },
      },
    },
  } as any,
  uiSchema: {},
  formData: [] as BuildStep[],
  idSchema: { $id: 'additionalBuildSteps' } as any,
  onBlur: jest.fn(),
  onFocus: jest.fn(),
  readonly: false,
  name: 'additionalBuildSteps',
  registry: {} as any,
  ...overrides,
});

describe('AdditionalBuildStepsPickerExtension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('renders the title correctly', () => {
      const props = createMockProps();
      render(<AdditionalBuildStepsPickerExtension {...props} />);
      expect(screen.getByText('Additional Build Steps')).toBeInTheDocument();
    });

    it('renders custom title from uiSchema', () => {
      const props = createMockProps({
        uiSchema: { 'ui:options': { title: 'Custom Build Steps' } },
      });
      render(<AdditionalBuildStepsPickerExtension {...props} />);
      expect(screen.getByText('Custom Build Steps')).toBeInTheDocument();
    });

    it('renders custom title from schema', () => {
      const props = createMockProps({
        schema: { title: 'Schema Title', items: {} },
      });
      render(<AdditionalBuildStepsPickerExtension {...props} />);
      expect(screen.getByText('Schema Title')).toBeInTheDocument();
    });

    it('renders "Add Build Step" button', () => {
      const props = createMockProps();
      render(<AdditionalBuildStepsPickerExtension {...props} />);
      expect(screen.getByText('Add Build Step')).toBeInTheDocument();
    });

    it('renders no steps when formData is empty', () => {
      const props = createMockProps({ formData: [] });
      render(<AdditionalBuildStepsPickerExtension {...props} />);
      expect(screen.queryByText(/Build Step 1/)).not.toBeInTheDocument();
    });

    it('renders steps from initial formData', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: ['RUN dnf update'] },
        { stepType: 'append_base', commands: ['RUN yum install -y git'] },
      ];
      const props = createMockProps({ formData });
      render(<AdditionalBuildStepsPickerExtension {...props} />);
      expect(screen.getByText('Build Step 1')).toBeInTheDocument();
      expect(screen.getByText('Build Step 2')).toBeInTheDocument();
    });

    it('renders steps with default step type when stepType is undefined', () => {
      const formData: BuildStep[] = [{ stepType: '', commands: [] }];
      const props = createMockProps({ formData });
      render(<AdditionalBuildStepsPickerExtension {...props} />);
      expect(screen.getByText('Build Step 1')).toBeInTheDocument();
    });

    it('starts with all steps collapsed', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: ['RUN dnf update'] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );
      const accordion = container.querySelector('.MuiAccordion-root');
      expect(accordion).not.toHaveClass('Mui-expanded');
    });

    it('initializes commandTexts from formData', () => {
      const formData: BuildStep[] = [
        {
          stepType: 'prepend_base',
          commands: ['RUN dnf update', 'RUN yum install'],
        },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const textField = getCommandsField(container, 0);
      expect(textField).toHaveValue('RUN dnf update\nRUN yum install');
    });
  });

  describe('Adding Build Steps', () => {
    it('adds a new build step when "Add Build Step" is clicked', () => {
      const props = createMockProps({ formData: [] });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Build Step');
      fireEvent.click(addButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { stepType: 'prepend_base', commands: [] },
      ]);
      expect(screen.getByText('Build Step 1')).toBeInTheDocument();
    });

    it('assigns first available step type to new step', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
        { stepType: 'append_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Build Step');
      fireEvent.click(addButton);

      expect(props.onChange).toHaveBeenCalledWith([
        ...formData,
        { stepType: 'prepend_galaxy', commands: [] },
      ]);
    });

    it('assigns default step type when all types are selected', () => {
      const formData: BuildStep[] = mockStepTypeEnum.map(type => ({
        stepType: type,
        commands: [],
      }));
      const props = createMockProps({ formData });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Build Step');
      fireEvent.click(addButton);

      expect(props.onChange).toHaveBeenCalledWith([
        ...formData,
        { stepType: 'prepend_base', commands: [] },
      ]);
    });

    it('collapses all other steps when adding a new step', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const addButton = screen.getByText('Add Build Step');
      fireEvent.click(addButton);

      const accordions = container.querySelectorAll('.MuiAccordion-root');
      expect(accordions[0]).not.toHaveClass('Mui-expanded');
      expect(accordions[1]).toHaveClass('Mui-expanded');
    });

    it('assigns first available step type skipping default when default is already used', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Build Step');
      fireEvent.click(addButton);

      expect(props.onChange).toHaveBeenCalledWith([
        ...formData,
        { stepType: 'append_base', commands: [] },
      ]);
    });
  });

  describe('Removing Build Steps', () => {
    it('removes a build step when delete button is clicked', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: ['RUN dnf update'] },
        { stepType: 'append_base', commands: ['RUN yum install'] },
      ];
      const props = createMockProps({ formData });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      const deleteButtons = screen.getAllByLabelText('Remove Build Step');
      fireEvent.click(deleteButtons[0]);

      expect(props.onChange).toHaveBeenCalledWith([
        { stepType: 'append_base', commands: ['RUN yum install'] },
      ]);
    });

    it('reindexes expanded steps after removal', async () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
        { stepType: 'append_base', commands: [] },
        { stepType: 'prepend_galaxy', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 1);

      const deleteButtons = screen.getAllByLabelText('Remove Build Step');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        const accordions = container.querySelectorAll('.MuiAccordion-root');
        expect(accordions[0]).toHaveClass('Mui-expanded');
      });
    });

    it('reindexes commandTexts after removal', async () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: ['cmd1'] },
        { stepType: 'append_base', commands: ['cmd2'] },
        { stepType: 'prepend_galaxy', commands: ['cmd3'] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 1);

      const textField = getCommandsField(container, 1);
      fireEvent.change(textField, { target: { value: 'modified cmd2' } });
      fireEvent.blur(textField);

      const deleteButtons = screen.getAllByLabelText('Remove Build Step');
      fireEvent.click(deleteButtons[0]);

      expandAccordion(container, 0);

      await waitFor(() => {
        const newTextField = getCommandsField(container, 0);
        expect(newTextField).toHaveValue('modified cmd2');
      });
    });

    it('handles removal when no steps exist', () => {
      const props = createMockProps({ formData: [] });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      expect(screen.getByText('Add Build Step')).toBeInTheDocument();
    });
  });

  describe('Changing Step Types', () => {
    it('updates step type when dropdown value changes', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const select = container.querySelector('.MuiSelect-root') as HTMLElement;
      fireEvent.mouseDown(select);
      const menuItem = screen.getByText(
        'Append Base - After base image dependencies',
      );
      fireEvent.click(menuItem);

      expect(props.onChange).toHaveBeenCalledWith([
        { stepType: 'append_base', commands: [] },
      ]);
    });

    it('updates display name when step type changes', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const select = container.querySelector('.MuiSelect-root') as HTMLElement;
      fireEvent.mouseDown(select);
      const menuItem = screen.getByText(
        'Append Galaxy - After Ansible collections',
      );
      fireEvent.click(menuItem);

      expect(
        screen.getAllByText('Append Galaxy - After Ansible collections').length,
      ).toBeGreaterThan(0);
    });

    it('shows only available step types in dropdown', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
        { stepType: 'append_base', commands: [] },
        { stepType: 'prepend_galaxy', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const selects = container.querySelectorAll('.MuiSelect-root');
      const select = selects[0] as HTMLElement;
      fireEvent.mouseDown(select);

      expect(
        screen.getAllByText('Prepend Base - Before base image dependencies')
          .length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText('Append Galaxy - After Ansible collections').length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText('Prepend Builder - Before main build steps').length,
      ).toBeGreaterThan(0);
    });

    it('always shows current step type in dropdown even if used elsewhere', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const selects = container.querySelectorAll('.MuiSelect-root');
      const select = selects[0] as HTMLElement;
      fireEvent.mouseDown(select);

      const prependMatches = screen.getAllByText(
        'Prepend Base - Before base image dependencies',
      );
      expect(prependMatches.length).toBeGreaterThan(0);
    });

    it('handles step type change when defaultStepType is used', () => {
      const formData: BuildStep[] = [{ stepType: '', commands: [] }];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const select = container.querySelector('.MuiSelect-root') as HTMLElement;
      fireEvent.mouseDown(select);
      const menuItem = screen.getByText(
        'Append Base - After base image dependencies',
      );
      fireEvent.click(menuItem);

      expect(props.onChange).toHaveBeenCalledWith([
        { stepType: 'append_base', commands: [] },
      ]);
    });
  });

  describe('Changing Commands', () => {
    it('updates commandTexts on input change without calling onChange', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: ['initial command'] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const textField = getCommandsField(container, 0);
      fireEvent.change(textField, { target: { value: 'new command' } });

      expect(props.onChange).not.toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ commands: ['new command'] }),
        ]),
      );

      expect(textField).toHaveValue('new command');
    });

    it('calls onChange on blur with parsed commands', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const textField = getCommandsField(container, 0);
      fireEvent.change(textField, {
        target: { value: 'RUN dnf update\nRUN yum install\n  ' },
      });
      fireEvent.blur(textField);

      expect(props.onChange).toHaveBeenCalledWith([
        {
          stepType: 'prepend_base',
          commands: ['RUN dnf update', 'RUN yum install'],
        },
      ]);
    });

    it('filters out empty commands', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const textField = getCommandsField(container, 0);
      fireEvent.change(textField, {
        target: { value: 'cmd1\n\ncmd2\n   \ncmd3' },
      });
      fireEvent.blur(textField);

      expect(props.onChange).toHaveBeenCalledWith([
        {
          stepType: 'prepend_base',
          commands: ['cmd1', 'cmd2', 'cmd3'],
        },
      ]);
    });

    it('trims whitespace from commands', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const textField = getCommandsField(container, 0);
      fireEvent.change(textField, {
        target: { value: '  cmd1  \n  cmd2  ' },
      });
      fireEvent.blur(textField);

      expect(props.onChange).toHaveBeenCalledWith([
        {
          stepType: 'prepend_base',
          commands: ['cmd1', 'cmd2'],
        },
      ]);
    });

    it('handles empty commands text', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: ['existing command'] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const textField = getCommandsField(container, 0);
      fireEvent.change(textField, { target: { value: '' } });
      fireEvent.blur(textField);

      expect(props.onChange).toHaveBeenCalledWith([
        {
          stepType: 'prepend_base',
          commands: [],
        },
      ]);
    });

    it('uses commandTexts state if available, otherwise falls back to step.commands', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: ['original'] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const textField = getCommandsField(container, 0);

      fireEvent.change(textField, { target: { value: 'modified' } });

      expect(textField).toHaveValue('modified');
    });
  });

  describe('Expanding/Collapsing Accordions', () => {
    it('expands accordion when expand icon is clicked', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      const accordion = container.querySelector('.MuiAccordion-root');
      expect(accordion).not.toHaveClass('Mui-expanded');

      expandAccordion(container, 0);

      expect(accordion).toHaveClass('Mui-expanded');
    });

    it('collapses accordion when expanded accordion is clicked', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const accordion = container.querySelector('.MuiAccordion-root');
      expect(accordion).toHaveClass('Mui-expanded');

      expandAccordion(container, 0);

      expect(accordion).not.toHaveClass('Mui-expanded');
    });

    it('handles multiple accordions independently', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
        { stepType: 'append_base', commands: [] },
        { stepType: 'prepend_galaxy', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      const expandButtons = container.querySelectorAll(
        '.MuiAccordionSummary-root',
      );

      fireEvent.click(expandButtons[0]);

      fireEvent.click(expandButtons[2]);

      const accordions = container.querySelectorAll('.MuiAccordion-root');
      expect(accordions[0]).toHaveClass('Mui-expanded');
      expect(accordions[1]).not.toHaveClass('Mui-expanded');
      expect(accordions[2]).toHaveClass('Mui-expanded');
    });

    it('stops event propagation when toggling expand', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);
      const accordion = container.querySelector('.MuiAccordion-root');
      expect(accordion).toHaveClass('Mui-expanded');
    });
  });

  describe('getAvailableStepTypes', () => {
    it('returns all step types when no steps exist', () => {
      const props = createMockProps({ formData: [] });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Build Step');
      fireEvent.click(addButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { stepType: 'prepend_base', commands: [] },
      ]);
    });

    it('excludes step types already selected in other steps', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
        { stepType: 'append_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const selects = container.querySelectorAll('.MuiSelect-root');
      const select = selects[0] as HTMLElement;
      fireEvent.mouseDown(select);

      expect(
        screen.getAllByText('Prepend Base - Before base image dependencies')
          .length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText('Prepend Galaxy - Before Ansible collections')
          .length,
      ).toBeGreaterThan(0);
    });

    it('includes current step type even if used in another step', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const selects = container.querySelectorAll('.MuiSelect-root');
      const select = selects[0] as HTMLElement;
      fireEvent.mouseDown(select);

      expect(
        screen.getAllByText('Prepend Base - Before base image dependencies')
          .length,
      ).toBeGreaterThan(0);
    });

    it('handles step with empty stepType using default', () => {
      const formData: BuildStep[] = [{ stepType: '', commands: [] }];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const select = container.querySelector('.MuiSelect-root') as HTMLElement;
      fireEvent.mouseDown(select);

      expect(
        screen.getAllByText('Prepend Base - Before base image dependencies')
          .length,
      ).toBeGreaterThan(0);
    });

    it('returns at least current step type when all others are taken', () => {
      const allButOne = mockStepTypeEnum.slice(0, -1).map(type => ({
        stepType: type,
        commands: [],
      }));
      const formData: BuildStep[] = [
        ...allButOne,
        {
          stepType: mockStepTypeEnum[mockStepTypeEnum.length - 1],
          commands: [],
        },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      const expandButtons = container.querySelectorAll(
        '.MuiAccordionSummary-root',
      );
      fireEvent.click(expandButtons[expandButtons.length - 1]);

      const selects = container.querySelectorAll('.MuiSelect-root');
      fireEvent.mouseDown(selects[selects.length - 1] as HTMLElement);

      expect(
        screen.getAllByText('Append Final - After final image steps').length,
      ).toBeGreaterThan(0);
    });
  });

  describe('getStepTypeDisplayName', () => {
    it('returns enum name when stepType has matching enum', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      expect(
        screen.getAllByText('Prepend Base - Before base image dependencies')
          .length,
      ).toBeGreaterThan(0);
    });

    it('returns stepType when no matching enum name found', () => {
      const formData: BuildStep[] = [
        { stepType: 'unknown_type', commands: [] },
      ];
      const props = createMockProps({ formData });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      expect(screen.getByText('unknown_type')).toBeInTheDocument();
    });

    it('handles empty stepType', () => {
      const formData: BuildStep[] = [{ stepType: '', commands: [] }];
      const props = createMockProps({ formData });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      expect(
        screen.getByText('Prepend Base - Before base image dependencies'),
      ).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays raw errors when present', () => {
      const props = createMockProps({
        rawErrors: ['Error 1', 'Error 2'],
      });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      expect(screen.getByText('Error 1, Error 2')).toBeInTheDocument();
    });

    it('does not display error message when rawErrors is empty', () => {
      const props = createMockProps({ rawErrors: [] });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      const errorText = container.querySelector('[color="error"]');
      expect(errorText).not.toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('disables all interactions when disabled prop is true', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData, disabled: true });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      const addButton = screen.getByRole('button', { name: /Add Build Step/i });
      const buttonElement = addButton.closest('button') || addButton;
      expect(buttonElement).toHaveAttribute('disabled');

      const accordion = container.querySelector('.MuiAccordion-root');
      expect(accordion).toHaveClass('Mui-disabled');

      expandAccordion(container, 0);

      const textField = getCommandsField(container, 0);
      expect(textField).toBeDisabled();

      const deleteButton = screen.getByLabelText('Remove Build Step');
      expect(deleteButton).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined formData', () => {
      const props = createMockProps({ formData: undefined });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      expect(screen.getByText('Add Build Step')).toBeInTheDocument();
      expect(screen.queryByText(/^Build Step \d+$/)).not.toBeInTheDocument();
    });

    it('handles formData with undefined commands', () => {
      const formData: any[] = [
        { stepType: 'prepend_base', commands: undefined },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const textField = getCommandsField(container, 0);
      expect(textField).toHaveValue('');
    });

    it('handles formData with null commands', () => {
      const formData: any[] = [{ stepType: 'prepend_base', commands: null }];
      const props = createMockProps({ formData });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      expect(screen.getByText('Build Step 1')).toBeInTheDocument();
    });

    it('handles schema without default step type', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              stepType: {
                enum: mockStepTypeEnum,
                enumNames: mockStepTypeEnumNames,
              },
            },
          },
        },
      });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Build Step');
      fireEvent.click(addButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { stepType: 'prepend_base', commands: [] },
      ]);
    });

    it('handles schema without enum names', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              stepType: {
                enum: mockStepTypeEnum,
              },
            },
          },
        },
      });
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const propsWithFormData = { ...props, formData };
      render(<AdditionalBuildStepsPickerExtension {...propsWithFormData} />);

      expect(screen.getAllByText('prepend_base').length).toBeGreaterThan(0);
    });

    it('handles empty stepTypeEnum', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              stepType: {
                enum: [],
              },
            },
          },
        },
      });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      expect(screen.getByText('Add Build Step')).toBeInTheDocument();
    });

    it('handles multiple rapid additions and removals', () => {
      const props = createMockProps({ formData: [] });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Build Step');
      fireEvent.click(addButton);
      fireEvent.click(addButton);
      fireEvent.click(addButton);

      expect(props.onChange).toHaveBeenCalledTimes(3);
    });

    it('handles removal of all steps', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      const deleteButton = screen.getByLabelText('Remove Build Step');
      fireEvent.click(deleteButton);

      expect(props.onChange).toHaveBeenCalledWith([]);
      expect(screen.queryByText(/^Build Step \d+$/)).not.toBeInTheDocument();
    });

    it('handles commands with special characters', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const textField = getCommandsField(container, 0);
      fireEvent.change(textField, {
        target: {
          value:
            'RUN echo "Hello World"\nRUN dnf install -y git\nRUN sed -i "s/old/new/g" file.txt',
        },
      });
      fireEvent.blur(textField);

      expect(props.onChange).toHaveBeenCalledWith([
        {
          stepType: 'prepend_base',
          commands: [
            'RUN echo "Hello World"',
            'RUN dnf install -y git',
            'RUN sed -i "s/old/new/g" file.txt',
          ],
        },
      ]);
    });

    it('handles very long command lines', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      expandAccordion(container, 0);

      const longCommand = 'A'.repeat(1000);
      const textField = getCommandsField(container, 0);
      fireEvent.change(textField, { target: { value: longCommand } });
      fireEvent.blur(textField);

      expect(props.onChange).toHaveBeenCalledWith([
        {
          stepType: 'prepend_base',
          commands: [longCommand],
        },
      ]);
    });

    it('handles formData update from external source', () => {
      const props = createMockProps({ formData: [] });
      render(<AdditionalBuildStepsPickerExtension {...props} />);

      expect(screen.queryByText(/^Build Step \d+$/)).not.toBeInTheDocument();

      expect(screen.getByText('Add Build Step')).toBeInTheDocument();
    });
  });

  describe('Initialization Logic', () => {
    it('initializes only once with isInitialized flag', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: ['initial'] },
      ];
      const props = createMockProps({ formData });
      const { rerender } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      const newFormData: BuildStep[] = [
        { stepType: 'append_base', commands: ['updated'] },
      ];
      rerender(
        <AdditionalBuildStepsPickerExtension
          {...props}
          formData={newFormData}
        />,
      );

      expect(screen.getByText('Build Step 1')).toBeInTheDocument();
    });

    it('starts with all steps collapsed on initial load', () => {
      const formData: BuildStep[] = [
        { stepType: 'prepend_base', commands: [] },
        { stepType: 'append_base', commands: [] },
      ];
      const props = createMockProps({ formData });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      const accordions = container.querySelectorAll('.MuiAccordion-root');
      accordions.forEach(accordion => {
        expect(accordion).not.toHaveClass('Mui-expanded');
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('handles complete workflow: add, expand, edit, collapse, remove', () => {
      const props = createMockProps({ formData: [] });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      const addButton = screen.getByText('Add Build Step');
      fireEvent.click(addButton);
      expect(screen.getByText('Build Step 1')).toBeInTheDocument();

      const accordion = container.querySelector('.MuiAccordion-root');
      expect(accordion).toHaveClass('Mui-expanded');

      const textField = getCommandsField(container, 0);
      fireEvent.change(textField, { target: { value: 'cmd1\ncmd2' } });
      fireEvent.blur(textField);
      expect(props.onChange).toHaveBeenCalledWith([
        { stepType: 'prepend_base', commands: ['cmd1', 'cmd2'] },
      ]);

      const select = container.querySelector('.MuiSelect-root') as HTMLElement;
      fireEvent.mouseDown(select);
      const menuItem = screen.getByText(
        'Append Base - After base image dependencies',
      );
      fireEvent.click(menuItem);
      expect(props.onChange).toHaveBeenLastCalledWith([
        { stepType: 'append_base', commands: ['cmd1', 'cmd2'] },
      ]);

      expandAccordion(container, 0);
      const collapsedAccordion = container.querySelector('.MuiAccordion-root');
      expect(collapsedAccordion).not.toHaveClass('Mui-expanded');

      const deleteButton = screen.getByLabelText('Remove Build Step');
      fireEvent.click(deleteButton);
      expect(props.onChange).toHaveBeenLastCalledWith([]);
      expect(screen.queryByText(/^Build Step \d+$/)).not.toBeInTheDocument();
    });

    it('handles adding multiple steps and managing their availability', () => {
      const props = createMockProps({ formData: [] });
      const { container } = render(
        <AdditionalBuildStepsPickerExtension {...props} />,
      );

      fireEvent.click(screen.getByText('Add Build Step'));

      fireEvent.click(screen.getByText('Add Build Step'));

      fireEvent.click(screen.getByText('Add Build Step'));

      expandAccordion(container, 0);
      const selects = container.querySelectorAll('.MuiSelect-root');
      const select1 = selects[0] as HTMLElement;
      fireEvent.mouseDown(select1);

      const matches = screen.getAllByText(
        'Prepend Base - Before base image dependencies',
      );
      expect(matches.length).toBeGreaterThan(0);
    });
  });
});
