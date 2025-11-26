import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';

// Mock the png import so the component's img src becomes a string we can check.
jest.mock(
  '../../../../images/ee-illustration.png',
  () => 'ee-illustration.png',
);

import { CreateCatalog } from './CreateCatalog';

const theme = createMuiTheme();

describe('CreateCatalog', () => {
  it('renders title, description, illustration, link and create button', () => {
    const onTabSwitch = jest.fn();

    render(
      <ThemeProvider theme={theme}>
        <CreateCatalog onTabSwitch={onTabSwitch} />
      </ThemeProvider>,
    );

    // container exists
    expect(screen.getByTestId('catalog-content')).toBeInTheDocument();

    // title
    const title = screen.getByRole('heading', {
      name: /No Execution Environment definition files, yet/i,
    });
    expect(title).toBeInTheDocument();

    // some description sentences are present
    expect(
      screen.getByText(
        /Get started with Execution Environment \(EE\) to ensure your/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Once your definition is saved, we'll walk you through building the EE./i,
      ),
    ).toBeInTheDocument();

    // button is present with accessible name
    const createButton = screen.getByRole('button', {
      name: /Create Execution Environment definition file/i,
    });
    expect(createButton).toBeInTheDocument();

    // link is present with correct visible text and href attribute
    const howToLink = screen.getByText(
      /How to build and use Execution Environment from definition files/i,
    );
    expect(howToLink).toBeInTheDocument();

    // anchor element
    const anchor = howToLink.closest('a');
    expect(anchor).toBeInTheDocument();

    // validate href (trim whitespace to avoid trailing space issues)
    expect(anchor!.getAttribute('href')!.trim()).toBe(
      'https://red.ht/self-service_build_and_use_ee_definition',
    );

    // illustration image is present with mocked src and correct alt
    const img = screen.getByAltText('Execution environment illustration');
    expect(img).toBeInTheDocument();
    expect((img as HTMLImageElement).getAttribute('src')).toBe(
      'ee-illustration.png',
    );
  });

  it('calls onTabSwitch with 1 when Create button is clicked', async () => {
    const onTabSwitch = jest.fn();
    render(
      <ThemeProvider theme={theme}>
        <CreateCatalog onTabSwitch={onTabSwitch} />
      </ThemeProvider>,
    );

    const createButton = screen.getByRole('button', {
      name: /Create Execution Environment definition file/i,
    });
    await userEvent.click(createButton);

    expect(onTabSwitch).toHaveBeenCalledTimes(1);
    expect(onTabSwitch).toHaveBeenCalledWith(1);
  });
});
