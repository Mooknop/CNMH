import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import RoomDetail from './RoomDetail';

const room = {
  code: 'A3',
  name: 'Shrine to Kabriri',
  encounterLabel: 'Trivial 4',
  readAloud: 'A grim altar sits here.',
  checks: [
    { statistic: 'athletics', dc: 19, secret: false, label: 'Force Open' },
    { statistic: 'religion', dc: 19, secret: true, label: 'Recall Knowledge' },
  ],
  creatures: ['Glorkus'],
  hazards: [{ name: 'Fires of Abraxas', level: 5, stealthDc: 8, complex: false }],
  treasure: 'a <em>shark tooth charm</em>',
  reward: '80 XP',
  body: '<p>The full <strong>room</strong> text.</p>',
};

describe('RoomDetail', () => {
  it('renders the heading, budget, and read-aloud', () => {
    render(<RoomDetail room={room} />);
    expect(screen.getByRole('heading', { name: 'A3. Shrine to Kabriri' })).toBeInTheDocument();
    expect(screen.getByText('Trivial 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Read-aloud text')).toHaveTextContent('A grim altar sits here.');
  });

  it('lists hidden checks with DCs and a secret badge', () => {
    render(<RoomDetail room={room} />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Force Open')).toBeInTheDocument();
    expect(within(table).getByText('Recall Knowledge')).toBeInTheDocument();
    expect(within(table).getByText('secret')).toBeInTheDocument(); // only the religion row
  });

  it('shows creatures and hazards with Stealth DCs', () => {
    render(<RoomDetail room={room} />);
    expect(screen.getByText('Creatures:').closest('p')).toHaveTextContent('Glorkus');
    expect(screen.getByRole('listitem')).toHaveTextContent('Fires of Abraxas — Stealth DC 8, level 5');
  });

  it('renders treasure/reward inline HTML and a collapsible body', () => {
    render(<RoomDetail room={room} />);
    expect(screen.getByText('shark tooth charm').tagName).toBe('EM'); // inline HTML preserved
    expect(screen.getByText('Reward:').closest('p')).toHaveTextContent('80 XP');
    expect(screen.getByText('Full room text')).toBeInTheDocument(); // <summary>
  });

  it('hides the body when showBody is false and renders nothing for no room', () => {
    const { rerender, container } = render(<RoomDetail room={room} showBody={false} />);
    expect(screen.queryByText('Full room text')).not.toBeInTheDocument();
    rerender(<RoomDetail room={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
