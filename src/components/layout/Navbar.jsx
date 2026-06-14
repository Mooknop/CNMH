// File: src/components/layout/Navbar.js
import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { CharacterContext } from '../../contexts/CharacterContext';
import { useGmAuth } from '../../hooks/useGmAuth';
import SyncStatus from '../shared/SyncStatus';
import GameClock from './GameClock';
import './Navbar.css';

// The character selector now lives in the dashboard carousel (`/`), so the
// navbar keeps only the brand, clock, sync status, the active-character pill
// and the GM link. Its surface tints toward the active character's accent
// (--accent, set by the dashboard on /; falls back to ember elsewhere).
const Navbar = () => {
  const { activeCharacter } = useContext(CharacterContext);
  const { isGm } = useGmAuth();

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">Chaotic Neutral Milk Hotel</Link>
      </div>

      <ul className="navbar-nav">
        <li className="nav-item nav-clock">
          <GameClock />
        </li>
        <li className="nav-item nav-sync">
          <SyncStatus />
        </li>
        {activeCharacter && (
          <li className="nav-item">
            <div className="nav-active-char">
              <div className="nav-active-dot" />
              <span>{activeCharacter.name}</span>
            </div>
          </li>
        )}
        {isGm && (
          <li className="nav-item">
            <Link to="/gm" className="nav-link">GM</Link>
          </li>
        )}
      </ul>
    </nav>
  );
};

export default Navbar;
