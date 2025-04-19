// File: src/components/layout/Navbar.js
import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { CharacterContext } from '../../contexts/CharacterContext';
import './Navbar.css';

const Navbar = () => {
  const { characters, activeCharacter } = useContext(CharacterContext);
  
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">PF2E Character Viewer</Link>
      </div>
      <ul className="navbar-nav">
        {characters.map(character => (
          <li key={character.id} className="nav-item">
            <Link 
              to={`/character/${character.id}`} 
              className={`nav-link ${activeCharacter && activeCharacter.id === character.id ? 'active' : ''}`}
            >
              {character.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default Navbar;