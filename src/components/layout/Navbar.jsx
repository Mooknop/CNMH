// File: src/components/layout/Navbar.js
import React, { useContext, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CharacterContext } from '../../contexts/CharacterContext';
import { useGmAuth } from '../../hooks/useGmAuth';
import SyncStatus from '../shared/SyncStatus';
import GameClock from './GameClock';
import './Navbar.css';

const Navbar = () => {
  const { characters, activeCharacter } = useContext(CharacterContext);
  const { isGm } = useGmAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  // Handle click outside to close the dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  const toggleDropdown = () => {
    setDropdownOpen(!dropdownOpen);
  };
  
  const closeDropdown = () => {
    setDropdownOpen(false);
  };

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
        {/* Characters Dropdown */}
        <li className="nav-item dropdown" ref={dropdownRef}>
          <button 
            className={`dropdown-toggle ${activeCharacter ? 'has-active' : ''}`}
            onClick={toggleDropdown}
          >
            Characters
            <span className="dropdown-caret">▼</span>
          </button>
          
          {dropdownOpen && (
            <div className="dropdown-menu">
              {characters.length > 0 ? (
                characters.map(character => (
                  <Link 
                    key={character.id} 
                    to={`/character/${character.id}`} 
                    className={`dropdown-item ${activeCharacter && activeCharacter.id === character.id ? 'active' : ''}`}
                    onClick={closeDropdown}
                  >
                    {character.name}
                  </Link>
                ))
              ) : (
                <div className="dropdown-item disabled">No characters</div>
              )}
            </div>
          )}
        </li>
      </ul>
    </nav>
  );
};

export default Navbar;